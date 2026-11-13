"""Optional loopback-only personal web entry; never signs as a person or an agent."""
import argparse
from collections import OrderedDict
from contextlib import closing, contextmanager
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
import threading
import time
from urllib.parse import parse_qs, urlsplit

import knowledge
from team_api import admitted
from web_session import BrowserSessions, PasswordAccess, SessionError

TEAM = {"recordings", "business", "research", "content"}
COOKIE = "__Secure-opcb_knowledge_web"
PUBLIC_PATH = "/opcb-plugins/knowledge/"
ORIGIN = "https://shangliangshan.paolab.cn"
DESKTOP_ORIGIN = "tauri://localhost"


class ReadOnlyStore(knowledge.Store):
    """Reuse existing queries without the collector's implicit schema writes."""
    def __init__(self, root):
        self.root = Path(root).resolve(strict=True)
        if not self.root.is_dir() or self.root.stat().st_mode & 0o077:
            raise knowledge.KnowledgeError("Knowledge directory must be private")
        self.database = self.root / "index.sqlite3"
        if not self.database.is_file():
            raise knowledge.KnowledgeError("Existing knowledge index is required")

    @contextmanager
    def connect(self):
        uri = self.database.resolve(strict=True).as_uri() + "?mode=ro"
        with closing(sqlite3.connect(uri, uri=True, timeout=10)) as db:
            db.row_factory = sqlite3.Row
            yield db


def source_policy(members, archive_members):
    def sources(owner):
        result = TEAM.intersection(knowledge.SOURCES) if admitted(members, owner) else set()
        if "haowangshui" in knowledge.SOURCES and admitted(archive_members, owner):
            result.add("haowangshui")
        return result
    return sources


def query(store, value, sources):
    if not isinstance(value, dict):
        raise knowledge.KnowledgeError("Invalid knowledge request")
    operation = value.get("op")
    fields = {"catalog": {"op"}, "status": {"op", "source"},
              "list": {"op", "source", "limit", "offset"},
              "search": {"op", "source", "query", "limit"}, "get": {"op", "source", "id"}}
    if not isinstance(operation, str) or operation not in fields or set(value) - fields[operation]:
        raise knowledge.KnowledgeError("Invalid knowledge request")
    if operation == "catalog":
        return {"sources": [store.status(source) for source in knowledge.SOURCES if source in sources]}
    source = value.get("source", "recordings")
    if not isinstance(source, str) or source not in sources:
        raise knowledge.KnowledgeError("This source is not admitted")
    if operation == "status":
        return store.status(source)
    if operation == "search":
        return store.search(value.get("query"), value.get("limit", 5), source)
    if operation == "list":
        status = store.require_fresh(source)
        limit, offset = value.get("limit", 20), value.get("offset", 0)
        if type(limit) is not int or not 1 <= limit <= 20 or type(offset) is not int or not 0 <= offset <= 1000000:
            raise knowledge.KnowledgeError("Invalid document page")
        with store.connect() as db:
            rows = db.execute("SELECT id,title,substr(content,1,360) AS excerpt,url,updated_at FROM documents WHERE source=? ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?", (source, limit, offset)).fetchall()
        return {"source": status, "results": [dict(row) for row in rows], "offset": offset,
                "total": status["documents"], "next_offset": offset + len(rows) if rows and offset + len(rows) < status["documents"] else None}
    if not knowledge.valid_id(source, value.get("id")):
        raise knowledge.KnowledgeError("Invalid source document ID")
    return store.get(value["id"], source)


def handler(store, sessions, sources_for, origin=ORIGIN, public_path=PUBLIC_PATH, passwords=None):
    slots = threading.BoundedSemaphore(2)
    clients, rate_lock = OrderedDict(), threading.Lock()
    web = Path(__file__).with_name("web")
    assets = {"/": ("index.html", "text/html; charset=utf-8"),
              "/app.js": ("app.js", "text/javascript; charset=utf-8"),
              "/app.css": ("app.css", "text/css; charset=utf-8")}

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_args):
            pass

        def reply(self, status, value, content_type="application/json; charset=utf-8", cookie=None):
            data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
            if len(data) > 4 * 1024 * 1024:
                status, data = 413, b'{"error":"Response exceeds workspace limit"}'
                content_type = "application/json; charset=utf-8"
            self.send_response(status)
            for name, text in {
                "Content-Type": content_type, "Content-Length": str(len(data)),
                "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
            }.items():
                self.send_header(name, text)
            if cookie is not None:
                self.send_header("Set-Cookie", cookie)
            self.end_headers()
            self.wfile.write(data)

        def cookie(self, token, age=12 * 3600):
            return f"{COOKIE}={token}; Path={public_path}; Max-Age={age}; HttpOnly; Secure; SameSite=Strict"

        def token(self):
            if self.path.startswith(("/api/desktop/", "/api/client/")):
                authorization = self.headers.get("Authorization", "")
                return authorization[7:] if authorization.startswith("Bearer ") else ""
            cookies = SimpleCookie()
            try:
                cookies.load(self.headers.get("Cookie", ""))
            except Exception:
                return ""
            return cookies[COOKIE].value if COOKIE in cookies else ""

        def owner(self, viewer):
            return sessions.owner(self.token(), viewer)

        def rate_allowed(self):
            # Listener is loopback-only. The existing trusted Caddy owns XFF.
            client = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
            window = int(time.time() // 60)
            with rate_lock:
                old, count = clients.pop(client, (window, 0))
                count = count + 1 if old == window else 1
                clients[client] = (window, count)
                while len(clients) > 1024:
                    clients.popitem(last=False)
                return count <= 60

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path == "/health":
                return self.reply(200, {"service": "opcb-knowledge-web", "ok": True})
            if url.path in assets:
                name, content_type = assets[url.path]
                try:
                    return self.reply(200, (web / name).read_bytes(), content_type)
                except OSError:
                    return self.reply(503, {"error": "Workspace files are unavailable"})
            if url.path == "/api/session":
                try:
                    values = parse_qs(url.query).get("viewer", [])
                    owner = self.owner(values[0] if len(values) == 1 else None)
                    return self.reply(200, {"owner": owner, "sources": sorted(sources_for(owner))})
                except SessionError:
                    return self.reply(401, {"error": "Login is required"})
            return self.reply(404, {"error": "Not found"})

        def do_POST(self):
            desktop = self.path.startswith("/api/desktop/")
            client = self.path.startswith("/api/client/")
            prefix = "/api/desktop/" if desktop else "/api/client/" if client else "/api/"
            path = "/api/" + self.path[len(prefix):] if desktop or client else self.path
            if path not in {"/api/login", "/api/logout", "/api/query"}:
                return self.reply(404, {"error": "Not found"})
            expected_origin = DESKTOP_ORIGIN if desktop else origin
            marker = "X-OPCB-Desktop" if desktop else "X-OPCB-Client" if client else "X-OPCB-Web"
            if self.headers.get("Origin") != expected_origin or self.headers.get(marker) != "1":
                return self.reply(403, {"error": "Use the current workspace to submit this action"})
            if not self.rate_allowed():
                return self.reply(429, {"error": "Request limit reached"})
            if not slots.acquire(blocking=False):
                return self.reply(503, {"error": "Busy; try again"})
            try:
                try:
                    length = int(self.headers.get("Content-Length", "-1"))
                    if not 0 < length <= 8192:
                        return self.reply(413, {"error": "Request too large or length missing"})
                    raw = self.rfile.read(length)
                    if len(raw) != length:
                        return self.reply(400, {"error": "Incomplete request"})
                    value = json.loads(raw.decode("utf-8"))
                    if not isinstance(value, dict):
                        return self.reply(400, {"error": "Invalid request"})
                    viewer = value.get("viewer")
                    if path == "/api/login":
                        credential = "password" if passwords is not None else "code"
                        if set(value) != {"viewer", credential}:
                            return self.reply(400, {"error": "Invalid login request"})
                        if passwords is not None:
                            passwords.verify(value["password"])
                            token = sessions.start(viewer)
                        else:
                            token = sessions.exchange(value["code"], viewer)
                        if desktop or client:
                            return self.reply(200, {"owner": viewer, "token": token})
                        return self.reply(200, {"owner": viewer}, cookie=self.cookie(token))
                    owner = self.owner(viewer)
                    if path == "/api/logout":
                        if set(value) != {"viewer"}:
                            return self.reply(400, {"error": "Invalid logout request"})
                        sessions.logout(self.token())
                        return self.reply(200, {"ok": True}, cookie=None if desktop or client else self.cookie("", 0))
                    if set(value) != {"viewer", "request"}:
                        return self.reply(400, {"error": "Invalid query request"})
                    sources = sources_for(owner)
                    result = query(store, value["request"], sources)
                    # Recheck after a read: logout or ACL revocation retires its result.
                    self.owner(viewer)
                    if not sources <= sources_for(owner):
                        raise SessionError("Access changed during the request")
                    return self.reply(200, result)
                except SessionError:
                    return self.reply(401, {"error": "Password or session is invalid; sign in again"})
                except (ValueError, UnicodeError):
                    return self.reply(400, {"error": "Invalid JSON request"})
                except knowledge.KnowledgeError:
                    return self.reply(403, {"error": "Source is unavailable or not admitted; refresh its status"})
                except Exception:
                    return self.reply(503, {"error": "Knowledge workspace unavailable"})
            finally:
                slots.release()

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/opt/opcb-knowledge/state"))
    parser.add_argument("--members", type=Path, default=Path("/opt/opcb-knowledge/members.json"))
    parser.add_argument("--archive-members", type=Path, default=Path("/opt/opcb-knowledge/haowangshui-members.json"))
    parser.add_argument("--sessions", type=Path)
    parser.add_argument("--password-file", type=Path, help="Server-owned shared password hash; enables access to all configured sources")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--issue", help="Administrator: issue one personal activation; never send it to chat")
    action.add_argument("--revoke", help="Administrator: revoke one person's web sessions and pending activations")
    args = parser.parse_args()
    passwords = PasswordAccess(args.password_file) if args.password_file is not None else None
    sources = (lambda _owner: set(knowledge.SOURCES)) if passwords else source_policy(args.members, args.archive_members)
    session_file = args.sessions or Path("/var/lib/opcb-knowledge-web") / (
        "shared-sessions.sqlite3" if passwords else "sessions.sqlite3")
    sessions = BrowserSessions(session_file, lambda key: bool(sources(key)))
    if args.issue:
        if passwords is not None:
            parser.error("Shared-password mode does not issue activation codes")
        print(sessions.issue(args.issue))
        return
    if args.revoke:
        sessions.revoke(args.revoke)
        return
    server = ThreadingHTTPServer(("127.0.0.1", 3036), handler(ReadOnlyStore(args.root), sessions, sources, passwords=passwords))
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    main()
