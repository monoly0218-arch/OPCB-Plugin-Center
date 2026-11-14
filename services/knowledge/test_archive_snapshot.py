import copy
import json
from pathlib import Path
import tempfile
import unittest

from archive_snapshot import import_snapshot
from knowledge import KnowledgeError, request, Store


class ArchiveSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = Store(self.root / "state")
        self.path = self.root / "snapshot.json"
        self.value = {"version": 1, "complete": True, "snapshot_date": "2026-09-18", "facts": {"failed_objects": 44},
                      "documents": [{"object_key": "docx:sample", "title": "样本产品", "content": "产品测试正文"}]}
        self.write(self.value)

    def write(self, value):
        self.path.write_text(json.dumps(value, ensure_ascii=False))

    def test_snapshot_remains_readable_without_claiming_business_updates(self):
        status = import_snapshot(self.store, self.path)
        self.assertEqual(status["source_facts"]["snapshot_date"], "2026-09-18")
        self.assertEqual(status["source_facts"]["failed_objects"], 44)
        with self.store.connect() as connection:
            connection.execute("UPDATE metadata SET value='1' WHERE key='haowangshui.synced_epoch'")
        result = request(self.store, {"op": "search", "source": "haowangshui", "query": "测试"}, {"haowangshui"})
        document = self.store.get(result["results"][0]["id"], "haowangshui")["note"]
        self.assertEqual(document["updated_at"], "")
        self.assertEqual(document["created_at"], "")
        self.assertEqual(result["source"]["state"], "ready")
        self.assertEqual(self.store.status("research")["state"], "stale")
        with self.assertRaises(KnowledgeError):
            request(self.store, {"op": "status", "source": "haowangshui"})

    def test_bad_or_partial_snapshot_preserves_previous_index(self):
        import_snapshot(self.store, self.path)
        invalid = [dict(self.value, complete=False), dict(self.value, documents=[]),
                   dict(self.value, snapshot_date="2999-01-01"), dict(self.value, version=True),
                   dict(self.value, documents=self.value["documents"] * 2)]
        malformed = copy.deepcopy(self.value)
        malformed["documents"][0]["content"] = "x" * (1024 * 1024 + 1)
        invalid.append(malformed)
        for value in invalid:
            self.write(value)
            with self.assertRaises(KnowledgeError):
                import_snapshot(self.store, self.path)
            self.assertEqual(self.store.status("haowangshui")["documents"], 1)
            self.assertEqual(len(self.store.search("测试", source="haowangshui")["results"]), 1)

    def test_reimport_is_stable_and_does_not_touch_other_sources(self):
        from test_knowledge import response, note
        self.store.replace(response(note()))
        import_snapshot(self.store, self.path)
        first = self.store.search("测试", source="haowangshui")["results"][0]["id"]
        self.value["documents"][0]["title"] = "修改标题"
        self.write(self.value)
        import_snapshot(self.store, self.path)
        self.assertEqual(self.store.search("测试", source="haowangshui")["results"][0]["id"], first)
        self.assertEqual(self.store.status("recordings")["documents"], 1)
