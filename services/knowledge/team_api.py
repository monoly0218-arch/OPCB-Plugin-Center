#!/usr/bin/env python3
"""Read-only knowledge API with server-managed OPCB admission and request-bound signatures."""
import argparse
from collections import OrderedDict
from contextlib import closing
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import stat
import sqlite3
import subprocess
import threading
import time

from knowledge import KnowledgeError, request, Store, TEAM_SOURCES, valid_id


def member_verifier(node, bundle):
    def verify(body, headers):
        try:
            envelope = {"body": body.decode("utf-8"), "authorization": headers.get("Authorization", ""),
                        "ownerAuthorization": headers.get("x-auth-tag", "")}
            encoded = json.dumps(envelope, ensure_ascii=False).encode()
            if len(encoded) > 32768:
                return None
            result = subprocess.run([str(node), "--jitless", "--max-old-space-size=48", str(bundle)], input=encoded, capture_output=True,
                                    timeout=12, check=False)
            if result.returncode or len(result.stdout) > 1024:
                return None
            identity = json.loads(result.stdout)
            if set(identity) != {"owner", "caller", "request_id", "created_at"}:
                return None
            for key in ("owner", "caller", "request_id"):
                if not isinstance(identity[key], str) or len(identity[key]) != 64 or any(
                        c not in "0123456789abcdef" for c in identity[key]):
                    return None
            if type(identity["created_at"]) is not int or abs(time.time() - identity["created_at"]) > 61:
                return None
            return identity
        except (OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired):
            return None
    return verify


def admitted(members_file, owner):
    """Read the administrator's current allowlist, never a request field or cache."""
    directory = descriptor = None
    try:
        path = Path(members_file)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        parent = os.fstat(directory)
        if parent.st_uid not in (0, os.geteuid()) or parent.st_mode & 0o022:
            return False
        descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid not in (0, os.geteuid())
                or stat.S_IMODE(info.st_mode) & 0o077 or info.st_size > 65536):
            return False
        with os.fdopen(descriptor, "rb") as stream:
            descriptor = None
            raw = stream.read(65537)
        if len(raw) > 65536:
            return False
        config = json.loads(raw)
        if not isinstance(config, dict) or set(config) != {"members"}:
            return False
        members = config["members"]
        if not isinstance(members, list) or len(members) > 1024 or any(
                not isinstance(key, str) or len(key) != 64 or any(c not in "0123456789abcdef" for c in key)
                for key in members):
            return False
        return len(set(members)) == len(members) and owner in members
    except (OSError, ValueError, TypeError):
        return False
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if directory is not None:
            os.close(directory)


def handler(store, access_file, client_file, verify_member=None, members_file="/opt/opcb-knowledge/members.json",
            archive_members_file="/opt/opcb-knowledge/haowangshui-members.json"):
    access_file, client_file = Path(access_file), Path(client_file)
    slots = threading.BoundedSemaphore(2)
    clients, rate_lock = OrderedDict(), threading.Lock()
    replay_file = store.root / "auth-replay.sqlite3"
    with closing(sqlite3.connect(replay_file)) as connection, connection:
        connection.execute("CREATE TABLE IF NOT EXISTS used (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)")
    replay_file.chmod(0o600)

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_args):
            # Never journal access codes, request text or note contents.
            pass

        def reply(self, status, value, content_type="application/json; charset=utf-8"):
            data = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/health":
                return self.reply(200, {"ok": True})
            if self.path == "/client.py":
                return self.reply(200, client_file.read_bytes(), "text/plain; charset=utf-8")
            # A citation is a stable locator, never a bearer URL to private text.
            if self.path.startswith("/archive/") and valid_id("haowangshui", self.path[len("/archive/"):]):
                document_id = self.path[len("/archive/"):]
                page = ("<!doctype html><html lang=zh-CN><meta charset=utf-8>"
                        "<meta name=viewport content='width=device-width,initial-scale=1'>"
                        "<title>好望水归档引用</title><h1>好望水归档引用</h1>"
                        "<p>请在 OPCB Work 中读取好望水知识源，访问需验证账号权限。</p>"
                        f"<p>文档编号：<code>{document_id}</code></p></html>")
                return self.reply(200, page.encode(), "text/html; charset=utf-8")
            return self.reply(404, {"error": "Not found"})

        def legacy_authenticated(self):
            try:
                if stat.S_IMODE(access_file.stat().st_mode) & 0o077:
                    return False
                config = json.loads(access_file.read_text())
                auth = self.headers.get("Authorization", "")
                if not auth.startswith("Bearer ") or not 32 <= len(auth[7:]) <= 128:
                    return False
                return config.get("legacy_enabled") is True and time.time() < config["expires_at"] and hmac.compare_digest(
                    hashlib.sha256(auth[7:].encode()).hexdigest(), config["sha256"])
            except (OSError, ValueError, KeyError, TypeError):
                return False

        def authenticated(self, body):
            self.sources = set()
            auth = self.headers.get("Authorization", "")
            if not auth.startswith("Nostr "):
                if self.legacy_authenticated():
                    self.sources.update(TEAM_SOURCES)
                return bool(self.sources)
            if verify_member is None:
                return False
            identity = verify_member(body, self.headers)
            if not identity:
                return False
            if admitted(members_file, identity["owner"]):
                self.sources.update(TEAM_SOURCES)
            if admitted(archive_members_file, identity["owner"]):
                self.sources.add("haowangshui")
            if not self.sources:
                return False
            try:
                # Durable uniqueness also rejects replay after an API restart.
                with closing(sqlite3.connect(replay_file, timeout=2)) as connection, connection:
                    connection.execute("BEGIN IMMEDIATE")
                    connection.execute("DELETE FROM used WHERE created_at < ?", (time.time() - 125,))
                    if connection.execute("SELECT COUNT(*) FROM used").fetchone()[0] >= 4096:
                        return False
                    connection.execute("INSERT INTO used VALUES (?, ?)", (identity["request_id"], identity["created_at"]))
                return True
            except sqlite3.Error:
                return False

        def rate_allowed(self):
            # The listener is localhost-only, behind Caddy's trusted forwarding.
            client = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
            window = int(time.time() // 60)
            with rate_lock:
                old_window, count = clients.pop(client, (window, 0))
                count = count + 1 if old_window == window else 1
                clients[client] = (window, count)
                while len(clients) > 1024:
                    clients.popitem(last=False)
                return count <= 60

        def do_POST(self):
            if self.path != "/query":
                return self.reply(404, {"error": "Not found"})
            if not self.rate_allowed():
                return self.reply(429, {"error": "Request limit reached"})
            if not self.headers.get("Authorization", "").startswith("Nostr ") and not self.legacy_authenticated():
                return self.reply(401, {"error": "Current OPCB team member authorization is required"})
            if not slots.acquire(blocking=False):
                return self.reply(503, {"error": "Busy; try again"})
            try:
                try:
                    length = int(self.headers.get("Content-Length", "-1"))
                    if not 0 <= length <= 8192:
                        return self.reply(413, {"error": "Request too large or length missing"})
                    raw = self.rfile.read(length)
                    if len(raw) != length:
                        return self.reply(400, {"error": "Incomplete request"})
                    if not self.authenticated(raw):
                        return self.reply(401, {"error": "Current OPCB team member authorization is required"})
                    result = request(store, json.loads(raw), self.sources)
                    return self.reply(200, result)
                except (ValueError, UnicodeError):
                    return self.reply(400, {"error": "Invalid JSON request"})
                except KnowledgeError as error:
                    return self.reply(403, {"error": str(error)})
                except Exception:
                    return self.reply(503, {"error": "Knowledge service unavailable"})
            finally:
                slots.release()

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="/opt/opcb-knowledge/state")
    parser.add_argument("--access", default="/opt/opcb-knowledge/team-access.json")
    parser.add_argument("--members", type=Path, default=Path("/opt/opcb-knowledge/members.json"))
    parser.add_argument("--archive-members", type=Path, default=Path("/opt/opcb-knowledge/haowangshui-members.json"))
    parser.add_argument("--client", default="/opt/opcb-knowledge/team_client.py")
    parser.add_argument("--port", type=int, default=3035)
    parser.add_argument("--member-verifier", type=Path, default=Path(__file__).absolute().with_name("member-auth.mjs"))
    parser.add_argument("--node", type=Path, default=Path("/opt/opcb-knowledge/runtime/node/bin/node"))
    args = parser.parse_args()
    if not args.node.is_file() or not args.member_verifier.is_file():
        parser.error("Member authorization runtime and bundle must be installed first")
    verify = member_verifier(args.node, args.member_verifier)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler(
        Store(args.root), args.access, args.client, verify, args.members, args.archive_members))
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    main()
