import fcntl
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

from knowledge import collect, KnowledgeError, request, Store
LIBRARY_ID = "fixture-library"


def note(note_id="100", content="包装方案：使用小袋装。", title="工作会议"):
    return {"note_id": note_id, "title": title, "content": content,
            "created_at": "2026-10-24", "edit_time": "2026-10-25"}


def response(*notes):
    return {"success": True, "data": {"notes": list(notes), "has_more": False}}


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        library = patch("knowledge.LIBRARY_ID", LIBRARY_ID)
        library.start()
        self.addCleanup(library.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / "private")
        self.store.replace(response(note()))
        self.credentials = self.store.root / "credentials.json"
        self.credentials.write_text(json.dumps({"api_key": "secret-test-key", "client_id": "client"}))
        self.credentials.chmod(0o600)

    def test_chinese_search_and_citation(self):
        result = self.store.search("包装方案")
        self.assertEqual(result["results"][0]["id"], "100")
        self.assertEqual(result["results"][0]["url"], "https://www.biji.com/note/100")
        self.assertTrue(result["source"]["untrusted_content"])
        self.assertEqual(self.store.search("小袋")["results"][0]["id"], "100")

    def test_temporary_media_tickets_are_not_exposed_as_text(self):
        self.store.replace(response(note(content=(
            "![图片](https://media.test/a.jpg?Signature=private-ticket) "
            "https://media.test/a.mp3?Expires=123&Signature=another-ticket 包装方案"
        ))))
        content = self.store.get("100")["note"]["content"]
        self.assertNotIn("private-ticket", content)
        self.assertNotIn("another-ticket", content)
        self.assertIn("包装方案", content)

    def test_literal_query_does_not_become_sql_or_fts_operators(self):
        for query in ['" OR 1=1 --', "*", "{title}:", "包装方案 OR 私人"]:
            self.assertEqual(self.store.search(query)["results"], [])
        self.assertEqual(self.store.status()["documents"], 1)

    def test_replacement_updates_content_and_removes_departed_notes(self):
        self.store.replace(response(note("200", "产品规格和价格"), note("100", "包装方案已更新")))
        self.assertEqual(self.store.search("包装方案")["results"][0]["id"], "100")
        self.store.replace(response(note("200", "产品规格和价格已更新")))
        with self.assertRaises(KnowledgeError):
            self.store.get("100")
        self.assertEqual(self.store.search("产品规格")["results"][0]["id"], "200")

    def test_bad_snapshots_never_replace_previous_documents(self):
        invalid = [None, [], {}, {"success": False},
                   {"success": True, "data": {"notes": [], "has_more": True}},
                   response(note(), note()), response({"note_id": "../private"}),
                   response(note(content={"not": "text"}))]
        for value in invalid:
            with self.subTest(value=type(value).__name__), self.assertRaises(KnowledgeError):
                self.store.replace(value)
            self.assertEqual(self.store.get("100")["note"]["title"], "工作会议")

    def test_complete_empty_library_removes_previous_documents(self):
        self.store.replace(response())
        self.assertEqual(self.store.status()["documents"], 0)
        self.assertEqual(self.store.search("包装")["results"], [])

    def test_missing_or_stale_index_is_not_queryable(self):
        with patch("knowledge.time.time", return_value=time.time() + 901):
            self.assertEqual(self.store.status()["state"], "stale")
            with self.assertRaises(KnowledgeError):
                self.store.search("包装")
            with self.assertRaises(KnowledgeError):
                self.store.get("100")

    def test_only_current_library_ids_can_be_read(self):
        with self.assertRaises(KnowledgeError):
            request(self.store, {"op": "get", "id": "999"})
        for value in [{"op": "sql"}, {"op": "get", "id": "../../private"},
                      {"op": "status", "library_id": "other"}, {"op": "sync"},
                      {"op": "search", "query": "x", "limit": True}]:
            with self.subTest(value=value), self.assertRaises(KnowledgeError):
                request(self.store, value)

    def test_collect_pins_library_and_keeps_credentials_out_of_argv(self):
        def run(argv, **kwargs):
            self.assertEqual(argv, ["/private/getnote", "kb", LIBRARY_ID, "--all", "-o", "json"])
            self.assertNotIn("secret-test-key", " ".join(argv))
            self.assertEqual(kwargs["env"]["GETNOTE_API_KEY"], "secret-test-key")
            self.assertEqual(kwargs["env"]["GETNOTE_API_URL"], "https://openapi.biji.com")
            kwargs["stdout"].write(json.dumps(response(note("200"))).encode())
            return subprocess.CompletedProcess(argv, 0)
        with patch("knowledge.subprocess.run", side_effect=run):
            self.assertEqual(collect(self.store, "/private/getnote", self.credentials)["documents"], 1)
        self.assertEqual(self.store.get("200")["note"]["id"], "200")
        with self.assertRaises(KnowledgeError):
            self.store.get("100")

    def test_failed_collection_retains_previous_index_without_leaking_details(self):
        with patch("knowledge.subprocess.run", return_value=subprocess.CompletedProcess([], 1)):
            with self.assertRaisesRegex(KnowledgeError, "no partial data published"):
                collect(self.store, "/private/getnote", self.credentials)
        self.assertIsNotNone(self.store.status()["last_error"])
        self.assertEqual(self.store.get("100")["note"]["id"], "100")

    def test_overlapping_sync_is_rejected(self):
        with (self.store.root / "sync.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(KnowledgeError, "already running"):
                collect(self.store, "/private/getnote", self.credentials)

    def test_unsafe_directory_or_credentials_are_rejected(self):
        self.credentials.chmod(0o644)
        with self.assertRaisesRegex(KnowledgeError, "0600"):
            collect(self.store, "/private/getnote", self.credentials)
        self.store.root.chmod(0o755)
        with self.assertRaisesRegex(KnowledgeError, "0700"):
            Store(self.store.root)


if __name__ == "__main__":
    unittest.main()
