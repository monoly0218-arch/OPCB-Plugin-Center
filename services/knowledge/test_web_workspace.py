from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import hashlib
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest

import knowledge
from web_gateway import COOKIE, DESKTOP_ORIGIN, ORIGIN, PUBLIC_PATH, ReadOnlyStore, handler, query, source_policy
from web_session import BrowserSessions, PasswordAccess, SessionError

A, B = "a" * 64, "b" * 64


class SessionsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.allowed = {A, B}
        self.now = [1000.0]
        self.sessions = BrowserSessions(self.root / "sessions.sqlite3", self.allowed.__contains__, lambda: self.now[0])

    def test_personal_binding_one_use_and_only_hashes_are_stored(self):
        code = self.sessions.issue(A)
        with self.assertRaises(SessionError):
            self.sessions.exchange(code, B)
        token = self.sessions.exchange(code, A)
        self.assertEqual(self.sessions.owner(token, A), A)
        with self.assertRaises(SessionError):
            self.sessions.owner(token, B)
        with self.assertRaises(SessionError):
            self.sessions.exchange(code, A)
        with closing(self.sessions.connect()) as db:
            self.assertEqual(db.execute("SELECT digest,owner FROM session").fetchall(),
                             [(hashlib.sha256(token.encode()).hexdigest(), A)])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM activation").fetchone()[0], 0)
        self.assertNotIn(code.encode(), self.sessions.filename.read_bytes())
        self.assertNotIn(token.encode(), self.sessions.filename.read_bytes())
        self.assertEqual(self.sessions.filename.stat().st_mode & 0o777, 0o600)

    def test_expiry_logout_and_current_admission_are_enforced(self):
        code = self.sessions.issue(A)
        self.now[0] += 300
        with self.assertRaises(SessionError):
            self.sessions.exchange(code, A)
        token = self.sessions.exchange(self.sessions.issue(A), A)
        self.now[0] += 12 * 3600
        with self.assertRaises(SessionError):
            self.sessions.owner(token, A)
        token = self.sessions.exchange(self.sessions.issue(A), A)
        self.allowed.remove(A)
        with self.assertRaises(SessionError):
            self.sessions.owner(token, A)
        self.allowed.add(A)
        # A regrant must not resurrect a session already retired by revocation.
        with self.assertRaises(SessionError):
            self.sessions.owner(token, A)
        token = self.sessions.exchange(self.sessions.issue(A), A)
        self.sessions.logout(token)
        with self.assertRaises(SessionError):
            self.sessions.owner(token, A)

    def test_concurrent_exchange_consumes_activation_exactly_once(self):
        code = self.sessions.issue(A)
        def exchange(_):
            try:
                return self.sessions.exchange(code, A)
            except SessionError:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            tokens = list(pool.map(exchange, range(2)))
        self.assertEqual(sum(token is not None for token in tokens), 1)

    def test_admin_revocation_is_personal_and_cancels_pending_codes(self):
        pending = self.sessions.issue(A)
        token_a = self.sessions.exchange(self.sessions.issue(A), A)
        token_b = self.sessions.exchange(self.sessions.issue(B), B)
        self.sessions.revoke(A)
        with self.assertRaises(SessionError):
            self.sessions.exchange(pending, A)
        with self.assertRaises(SessionError):
            self.sessions.owner(token_a, A)
        self.assertEqual(self.sessions.owner(token_b, B), B)

    def test_unadmitted_people_and_symlinked_database_are_rejected(self):
        with self.assertRaises(SessionError):
            self.sessions.issue("c" * 64)
        target = self.root / "keep.txt"
        target.write_text("preserve")
        link = self.root / "link.sqlite3"
        link.symlink_to(target)
        with self.assertRaises(SessionError):
            BrowserSessions(link, self.allowed.__contains__)
        self.assertEqual(target.read_text(), "preserve")


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.state = self.root / "state"
        original = knowledge.Store(self.state)
        original.replace({"success": True, "data": {"notes": [{
            "note_id": "100", "title": "包装会议", "content": "原始包装资料",
            "created_at": "2026-10-24", "edit_time": "2026-10-25"}], "has_more": False}})
        self.store = ReadOnlyStore(self.state)
        self.members = self.root / "members.json"
        self.archive = self.root / "archive-members.json"
        self.write_members(self.members, [A])
        self.write_members(self.archive, [B])
        self.sources = source_policy(self.members, self.archive)
        self.sessions = BrowserSessions(self.state / "sessions.sqlite3", lambda owner: bool(self.sources(owner)))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler(self.store, self.sessions, self.sources))
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    @staticmethod
    def write_members(path, keys):
        path.write_text(json.dumps({"members": keys}))
        path.chmod(0o600)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def http(self, path, value=None, cookie=None, origin=ORIGIN, raw=None, desktop=False, token=None, client=False):
        connection = HTTPConnection(*self.server.server_address, timeout=5)
        self.addCleanup(connection.close)
        headers = {}
        body = None
        method = "GET"
        if value is not None or raw is not None:
            method = "POST"
            body = raw if raw is not None else json.dumps(value).encode()
            headers = {"Content-Type": "application/json", "X-OPCB-Desktop" if desktop else "X-OPCB-Client" if client else "X-OPCB-Web": "1"}
            if origin is not None:
                headers["Origin"] = origin
        if cookie:
            headers["Cookie"] = cookie
        if token:
            headers["Authorization"] = f"Bearer {token}"
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        data = response.read()
        return response.status, dict(response.getheaders()), json.loads(data)

    def login(self, owner=A):
        code = self.sessions.issue(owner)
        status, headers, value = self.http("/api/login", {"viewer": owner, "code": code})
        self.assertEqual(status, 200)
        self.assertEqual(value, {"owner": owner})
        cookie = headers["Set-Cookie"]
        for flag in ["HttpOnly", "Secure", "SameSite=Strict", f"Path={PUBLIC_PATH}"]:
            self.assertIn(flag, cookie)
        return cookie.split(";", 1)[0]

    def test_real_http_reads_original_index_and_logout_retires_access(self):
        before = self.store.database.read_bytes()
        cookie = self.login()
        status, _, result = self.http("/api/query", {"viewer": A, "request": {"op": "search", "query": "包装"}}, cookie)
        self.assertEqual(status, 200)
        self.assertEqual(result["results"][0]["id"], "100")
        status, _, result = self.http("/api/query", {"viewer": A, "request": {"op": "get", "id": "100"}}, cookie)
        self.assertEqual(status, 200)
        self.assertEqual(result["note"]["content"], "原始包装资料")
        self.assertEqual(self.store.database.read_bytes(), before)
        with self.store.connect() as db, self.assertRaises(sqlite3.OperationalError):
            db.execute("DELETE FROM documents")
        self.assertEqual(self.http("/api/logout", {"viewer": A}, cookie)[0], 200)
        self.assertEqual(self.http(f"/api/session?viewer={A}", cookie=cookie)[0], 401)

    def test_origin_binding_account_switch_and_live_acl_revocation(self):
        code = self.sessions.issue(A)
        for origin in [None, "https://other.test"]:
            self.assertEqual(self.http("/api/login", {"viewer": A, "code": code}, origin=origin)[0], 403)
        self.assertEqual(self.http("/api/login", {"viewer": B, "code": code})[0], 401)
        status, headers, _ = self.http("/api/login", {"viewer": A, "code": code})
        self.assertEqual(status, 200)
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        self.assertEqual(self.http(f"/api/session?viewer={B}", cookie=cookie)[0], 401)
        self.write_members(self.members, [])
        self.assertEqual(self.http("/api/query", {"viewer": A, "request": {"op": "catalog"}}, cookie)[0], 401)

    def test_independent_source_admission_and_request_limits(self):
        self.assertNotIn("haowangshui", self.sources(A))
        self.assertEqual(self.sources(B), {"haowangshui"})
        self.assertEqual([entry["source_id"] for entry in query(self.store, {"op": "catalog"}, {"recordings"})["sources"]], ["recordings"])
        cookie = self.login()
        for value in [{"op": "status", "source": "haowangshui"}, {"op": "catalog", "owner": B}, {"op": "status", "source": []}]:
            self.assertEqual(self.http("/api/query", {"viewer": A, "request": value}, cookie)[0], 403)
        self.assertEqual(self.http("/api/login", raw=b"x" * 8193)[0], 413)
        self.assertEqual(self.http("/api/login", raw=b"{")[0], 400)
        self.assertEqual(self.http("/query", {"op": "catalog"}, cookie)[0], 404)

    def test_revocation_during_a_query_does_not_return_the_old_result(self):
        cookie = self.login()
        original = self.store.status
        def status(source="recordings"):
            result = original(source)
            self.write_members(self.members, [])
            return result
        self.store.status = status
        self.assertEqual(self.http("/api/query", {"viewer": A, "request": {"op": "status"}}, cookie)[0], 401)

    def desktop(self, action, value, token=None, origin=DESKTOP_ORIGIN, cookie=None):
        return self.http("/api/desktop/" + action, value, origin=origin, desktop=True, token=token, cookie=cookie)

    def test_desktop_personal_login_reads_sources_and_logout_retires_token(self):
        before = self.store.database.read_bytes()
        code = self.sessions.issue(A)
        self.assertEqual(self.desktop("login", {"viewer": B, "code": code})[0], 401)
        status, headers, result = self.desktop("login", {"viewer": A, "code": code})
        self.assertEqual(status, 200)
        self.assertNotIn("Set-Cookie", headers)
        token = result["token"]
        self.assertEqual(result["owner"], A)
        self.assertEqual(self.desktop("login", {"viewer": A, "code": code})[0], 401)
        status, _, result = self.desktop("query", {"viewer": A, "request": {"op": "search", "query": "包装"}}, token)
        self.assertEqual(status, 200)
        self.assertEqual(result["results"][0]["id"], "100")
        self.assertIn("url", result["results"][0])
        self.assertEqual(self.desktop("query", {"viewer": B, "request": {"op": "catalog"}}, token)[0], 401)
        self.assertEqual(self.desktop("query", {"viewer": A, "request": {"op": "get", "id": "100"}}, token)[2]["note"]["content"], "原始包装资料")
        self.assertEqual(self.store.database.read_bytes(), before)
        self.assertEqual(self.desktop("logout", {"viewer": A}, token)[0], 200)
        self.assertEqual(self.desktop("query", {"viewer": A, "request": {"op": "catalog"}}, token)[0], 401)

    def test_desktop_rejects_web_origin_cookies_and_revoked_source(self):
        cookie = self.login()
        value = {"viewer": A, "request": {"op": "catalog"}}
        self.assertEqual(self.desktop("query", value, cookie=cookie)[0], 401)
        code = self.sessions.issue(A)
        for origin in [None, ORIGIN, "https://other.test"]:
            self.assertEqual(self.desktop("login", {"viewer": A, "code": code}, origin=origin)[0], 403)
        token = self.desktop("login", {"viewer": A, "code": code})[2]["token"]
        self.assertEqual(self.desktop("query", {"viewer": A, "request": {"op": "status", "source": "haowangshui"}}, token)[0], 403)
        self.write_members(self.members, [])
        self.assertEqual(self.desktop("query", value, token)[0], 401)

    def test_desktop_rechecks_revocation_after_read(self):
        token = self.desktop("login", {"viewer": A, "code": self.sessions.issue(A)})[2]["token"]
        original = self.store.status
        def status(source="recordings"):
            result = original(source)
            self.sessions.revoke(A)
            return result
        self.store.status = status
        self.assertEqual(self.desktop("query", {"viewer": A, "request": {"op": "status"}}, token)[0], 401)



class SharedPasswordTests(unittest.TestCase):
    http = WorkspaceTests.http
    stop = WorkspaceTests.stop
    write_members = staticmethod(WorkspaceTests.write_members)
    def setUp(self):
        WorkspaceTests.setUp(self)
        self.stop()
        self.password = "fixture-password-测试"
        self.password_file = self.root / "access.json"
        self.password_file.write_text(json.dumps(PasswordAccess.encode(self.password)))
        self.password_file.chmod(0o600)
        self.passwords = PasswordAccess(self.password_file)
        self.legacy = self.sessions
        self.sources = lambda _owner: set(knowledge.SOURCES)
        self.sessions = BrowserSessions(self.state / "shared-sessions.sqlite3", lambda _: True)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler(
            self.store, self.sessions, self.sources, passwords=self.passwords))
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    # Legacy tests remain covered by WorkspaceTests, not repeated in shared mode.

    def client(self, action, value, token=None, **kwargs):
        return self.http("/api/client/" + action, value, client=True, token=token, **kwargs)

    def test_unregistered_human_and_agent_can_read_all_sources_but_cannot_mutate(self):
        before = self.store.database.read_bytes()
        for owner in ["c" * 64, "d" * 64]:
            status, headers, login = self.client("login", {"viewer": owner, "password": self.password})
            self.assertEqual(status, 200)
            self.assertNotIn("Set-Cookie", headers)
            token = login["token"]
            def read(request, viewer=owner):
                return self.client("query", {"viewer": viewer, "request": request}, token)
            self.assertEqual({x["source_id"] for x in read({"op": "catalog"})[2]["sources"]}, set(knowledge.SOURCES))
            self.assertEqual(read({"op": "search", "query": "包装"})[2]["results"][0]["id"], "100")
            self.assertEqual(read({"op": "get", "id": "100"})[2]["note"]["content"], "原始包装资料")
            self.assertEqual(read({"op": "delete", "id": "100"})[0], 403)
            self.assertEqual(read({"op": "catalog"}, A)[0], 401)
            self.assertEqual(self.client("logout", {"viewer": owner}, token)[0], 200)
            self.assertEqual(read({"op": "catalog"})[0], 401)
        self.assertEqual(before, self.store.database.read_bytes())
        self.assertNotIn(self.password.encode(), self.password_file.read_bytes())
        self.assertNotIn(self.password.encode(), self.sessions.filename.read_bytes())

    def test_invalid_credentials_old_codes_cookie_and_origin_are_rejected(self):
        for password in ["wrong", "", None, 123, "x" * 257]:
            self.assertEqual(self.client("login", {"viewer": A, "password": password})[0], 401)
        self.assertEqual(self.client("login", {"viewer": A, "code": "x" * 43})[0], 400)
        self.assertEqual(self.client("login", {"viewer": A, "password": self.password}, origin=None)[0], 403)
        old = self.legacy.exchange(self.legacy.issue(A), A)
        request = {"viewer": A, "request": {"op": "catalog"}}
        self.assertEqual(self.client("query", request, old)[0], 401)
        self.assertEqual(self.client("query", request)[0], 401)
        cookie = self.http("/api/login", {"viewer": A, "password": self.password})[1]["Set-Cookie"]
        self.assertEqual(self.client("query", request, cookie=cookie)[0], 401)
        self.assertEqual(self.http("/api/query", request, cookie=cookie)[0], 200)
        token = self.client("login", {"viewer": A, "password": self.password})[2]["token"]
        self.sessions.now = lambda: 10**12
        self.assertEqual(self.client("query", request, token)[0], 401)

    def test_private_password_configuration_fails_closed(self):
        self.password_file.chmod(0o644)
        with self.assertRaises(SessionError):
            self.passwords.verify(self.password)
        self.password_file.chmod(0o600)
        self.password_file.write_text('{}')
        with self.assertRaises(SessionError):
            PasswordAccess(self.password_file)
        link = self.root / "link.json"
        link.symlink_to(self.password_file)
        with self.assertRaises(SessionError):
            PasswordAccess(link)


if __name__ == "__main__":
    unittest.main()
