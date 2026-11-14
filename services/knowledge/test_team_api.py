import hashlib
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

from knowledge import Store
from team_api import admitted, handler
from test_knowledge import note, response


class TeamApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = Store(self.root / "state")
        self.store.replace(response(note()))
        self.code = "test-team-code-" + "a" * 40
        self.access = self.root / "access.json"
        self.config = {"legacy_enabled": True, "sha256": hashlib.sha256(self.code.encode()).hexdigest(), "expires_at": time.time() + 3600}
        self.write_config()
        self.client = self.root / "client.py"
        self.client.write_text("# public team reader, no credentials\n")
        self.members = self.root / "members.json"
        self.members.write_text(json.dumps({"members": ["a" * 64]}))
        self.members.chmod(0o600)
        self.verified = None
        self.verify = lambda body, headers: self.verified
        self.archive_members = self.root / "haowangshui-members.json"
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler(
            self.store, self.access, self.client, self.verify, self.members, self.archive_members))
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def write_config(self):
        self.access.write_text(json.dumps(self.config))
        self.access.chmod(0o600)

    def post(self, value, code="default", length=None, member=False):
        headers = {"Content-Type": "application/json"}
        if code is not None:
            headers["Authorization"] = "Bearer " + (self.code if code == "default" else code)
        if member:
            headers["Authorization"] = "Nostr test-proof"
        if length is not None:
            headers["Content-Length"] = str(length)
        req = urllib.request.Request(self.url + "/query", data=json.dumps(value).encode(), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def test_code_holders_can_search_and_read_without_ssh(self):
        status, data = self.post({"op": "search", "query": "包装方案"})
        self.assertEqual(status, 200)
        self.assertEqual(data["results"][0]["id"], "100")
        self.assertEqual(self.post({"op": "get", "id": "100"})[0], 200)

    def test_team_code_reads_selected_sources_and_catalog_but_not_arbitrary_libraries(self):
        from source_adapters import document
        row = document("research", "product", "产品开发", {"价格": None}, "https://staging.paolab.cn/tingzi/")
        self.store.replace_source("research", [row])
        status, data = self.post({"op": "search", "source": "research", "query": "产品开发"})
        self.assertEqual(status, 200)
        self.assertEqual(data["source"]["source_id"], "research")
        self.assertEqual(data["results"][0]["id"], row["id"])
        self.assertEqual(len(self.post({"op": "catalog"})[1]["sources"]), 4)
        self.assertEqual(self.post({"op": "status", "source": "private-life-library"})[0], 403)
        self.assertEqual(self.post({"op": "get", "source": "business", "id": row["id"]})[0], 403)

    def test_anonymous_and_wrong_codes_cannot_see_source_status(self):
        for code in [None, "wrong-code-" + "b" * 40]:
            status, data = self.post({"op": "status"}, code)
            self.assertEqual(status, 401)
            self.assertNotIn("documents", data)
            self.assertNotIn("source", data)

    def test_expiry_rotation_and_insecure_config_revoke_access(self):
        self.config["expires_at"] = time.time() - 1
        self.write_config()
        self.assertEqual(self.post({"op": "status"})[0], 401)
        self.config.update(expires_at=time.time() + 3600, sha256="0" * 64)
        self.write_config()
        self.assertEqual(self.post({"op": "status"})[0], 401)
        self.config["sha256"] = hashlib.sha256(self.code.encode()).hexdigest()
        self.write_config()
        self.access.chmod(0o644)
        self.assertEqual(self.post({"op": "status"})[0], 401)

    def test_read_code_cannot_sync_change_library_or_read_external_note(self):
        for value in [{"op": "sync"}, {"op": "status", "library_id": "private"},
                      {"op": "get", "id": "999"}, {"op": "sql", "query": "select *"}]:
            self.assertEqual(self.post(value)[0], 403)
        self.assertEqual(self.store.status()["documents"], 1)

    def test_large_requests_are_rejected_before_reading_body(self):
        self.assertEqual(self.post({"op": "status"}, length=9000)[0], 413)

    def test_public_reader_contains_no_code_or_source_records(self):
        with urllib.request.urlopen(self.url + "/client.py", timeout=5) as r:
            body = r.read().decode()
            self.assertEqual(r.status, 200)
            self.assertEqual(r.headers["Cache-Control"], "no-store")
        self.assertNotIn(self.code, body)
        self.assertNotIn("工作会议", body)

    def test_expired_source_cannot_be_read_even_with_valid_code(self):
        with self.store.connect() as conn:
            conn.execute("UPDATE metadata SET value='0' WHERE key='synced_epoch'")
        self.assertEqual(self.post({"op": "search", "query": "包装"})[0], 403)

    def test_shared_code_is_disabled_by_default_and_can_be_explicitly_retired(self):
        self.config.pop("legacy_enabled")
        self.write_config()
        self.assertEqual(self.post({"op": "catalog"})[0], 401)
        self.config["legacy_enabled"] = False
        self.write_config()
        self.assertEqual(self.post({"op": "catalog"})[0], 401)

    def test_member_proof_replay_is_refused_even_after_handler_restart(self):
        self.verified = {"owner": "a" * 64, "caller": "b" * 64, "request_id": "c" * 64, "created_at": int(time.time())}
        self.config["legacy_enabled"] = False
        self.write_config()
        self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 200)
        self.server.RequestHandlerClass = handler(self.store, self.access, self.client, self.verify, self.members)
        self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 401)
        self.verified["request_id"] = "d" * 64
        self.assertEqual(self.post({"op": "status"}, member=True)[0], 200)

    def test_signed_members_are_still_read_only_and_bound_to_selected_sources(self):
        for number, value in enumerate([{"op": "sync"}, {"op": "status", "source": "private"},
                                        {"op": "get", "source": "business", "id": "123"}]):
            self.verified = {"owner": "a" * 64, "caller": "b" * 64, "request_id": f"{number:064x}", "created_at": int(time.time())}
            self.assertEqual(self.post(value, member=True)[0], 403)
        self.assertEqual(self.store.status()["documents"], 1)

    def test_server_admission_is_reread_for_each_request_and_uses_attested_owner(self):
        self.verified = {"owner": "a" * 64, "caller": "b" * 64, "request_id": "1" * 64, "created_at": int(time.time())}
        self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 200)
        # Admitting the agent alone cannot replace the required owner's admission.
        replacement = self.root / "replacement.json"
        replacement.write_text(json.dumps({"members": ["b" * 64]}))
        replacement.chmod(0o600)
        replacement.replace(self.members)
        self.verified["request_id"] = "2" * 64
        self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 401)
        self.members.write_text(json.dumps({"members": ["a" * 64]}))
        self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 200)

    def test_missing_damaged_or_insecure_members_file_fails_closed_over_http(self):
        self.verified = {"owner": "a" * 64, "caller": "b" * 64, "request_id": "e" * 64, "created_at": int(time.time())}
        for content in ["{", '{"members":"a"}', '{"members":["invalid"]}',
                        json.dumps({"members": ["a" * 64, "a" * 64]}),
                        json.dumps({"members": ["a" * 64], "role": "admin"}),
                        " " * 65537]:
            self.members.write_text(content)
            self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 401)
        self.members.write_text(json.dumps({"members": ["a" * 64]}))
        self.members.chmod(0o644)
        self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 401)
        self.members.chmod(0o600)
        self.root.chmod(0o777)
        try:
            self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 401)
        finally:
            self.root.chmod(0o700)
        self.members.unlink()
        self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 401)
        target = self.root / "target.json"
        target.write_text(json.dumps({"members": ["a" * 64]}))
        target.chmod(0o600)
        self.members.symlink_to(target)
        self.assertEqual(self.post({"op": "catalog"}, member=True)[0], 401)
        self.members.unlink()
        self.members.mkdir()
        self.assertFalse(admitted(self.members, "a" * 64))

    def test_refused_member_proof_never_returns_source_metadata(self):
        status, result = self.post({"op": "catalog"}, member=True)
        self.assertEqual(status, 401)
        self.assertNotIn("sources", result)

    def member_post(self, owner, value):
        import secrets
        self.verified = {"owner": owner, "caller": "f" * 64, "request_id": secrets.token_hex(32),
                         "created_at": int(time.time())}
        return self.post(value, member=True)

    def test_private_source_has_independent_owner_scope_not_team_or_agent_scope(self):
        from archive_snapshot import import_snapshot
        snapshot = self.root / "snapshot.json"
        snapshot.write_text(json.dumps({"version": 1, "complete": True, "snapshot_date": "2026-09-18",
            "documents": [{"object_key": "docx:sample", "title": "私有样本", "content": "仅测试资料"}], "facts": {}}))
        import_snapshot(self.store, snapshot)
        self.archive_members.write_text(json.dumps({"members": ["b" * 64, "c" * 64, "d" * 64]}))
        self.archive_members.chmod(0o600)
        for owner in ["b" * 64, "c" * 64, "d" * 64]:
            code, catalog = self.member_post(owner, {"op": "catalog"})
            self.assertEqual(code, 200)
            self.assertEqual([s["source_id"] for s in catalog["sources"]], ["haowangshui"])
            code, results = self.member_post(owner, {"op": "search", "source": "haowangshui", "query": "测试"})
            self.assertEqual(code, 200)
            document_id = results["results"][0]["id"]
            self.assertEqual(self.member_post(owner, {"op": "get", "source": "haowangshui", "id": document_id})[0], 200)
            self.assertEqual(self.member_post(owner, {"op": "status", "source": "recordings"})[0], 403)
        # The old team member and a legacy bearer cannot see or read the new source.
        self.assertEqual(len(self.member_post("a" * 64, {"op": "catalog"})[1]["sources"]), 4)
        for member in (False, True):
            if member:
                self.verified["owner"] = "a" * 64
                self.verified["request_id"] = "9" * 64
            self.assertEqual(self.post({"op": "status", "source": "haowangshui"}, member=member)[0], 403)
        # Only the caller is admitted: ownership must not be inferred from the agent.
        self.assertEqual(self.member_post("e" * 64, {"op": "catalog"})[0], 401)
        # A URL opens a locator shell, never the indexed title or content.
        with urllib.request.urlopen(self.url + "/archive/" + document_id, timeout=5) as response:
            html = response.read().decode()
            self.assertIn(document_id, html)
            self.assertNotIn("私有样本", html)
            self.assertNotIn("仅测试资料", html)

    def test_private_allowlist_revocation_and_damage_fail_closed_without_affecting_team_sources(self):
        self.archive_members.write_text(json.dumps({"members": ["a" * 64]}))
        self.archive_members.chmod(0o600)
        self.assertEqual(len(self.member_post("a" * 64, {"op": "catalog"})[1]["sources"]), 5)
        for content in ['{"members":[]}', '{"members":["invalid"]}', '{']:
            self.archive_members.write_text(content)
            self.assertEqual(self.member_post("a" * 64, {"op": "status", "source": "haowangshui"})[0], 403)
            self.assertEqual(len(self.member_post("a" * 64, {"op": "catalog"})[1]["sources"]), 4)
        self.archive_members.write_text(json.dumps({"members": ["a" * 64]}))
        self.archive_members.chmod(0o644)
        self.assertEqual(self.member_post("a" * 64, {"op": "status", "source": "haowangshui"})[0], 403)


if __name__ == "__main__":
    unittest.main()
