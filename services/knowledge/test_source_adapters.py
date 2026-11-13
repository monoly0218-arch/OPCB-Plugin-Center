import io
import json
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
import urllib.error
from unittest.mock import patch

from knowledge import KnowledgeError, request, Store, text_only
from source_adapters import (business_records, collect_web, content_records, document,
                             research_records, SameSiteRedirect, Site)
from test_knowledge import note, response


def product():
    return {"id": "product-1", "name": "原名", "price": 10, "spec": "300ml",
            "platform": "渠道A", "excluded": False, "collected_at": "2026-10-19"}


class SourceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / "state")
        self.store.replace(response(note()))
        self.row = document("research", "one", "工作会议", {"价格": None}, "https://staging.paolab.cn/tingzi/")

    def test_sources_replace_and_search_independently(self):
        self.store.replace_source("research", [self.row])
        self.assertEqual(self.store.search("工作会议", source="research")["results"][0]["id"], self.row["id"])
        self.assertEqual(self.store.search("工作会议")["results"][0]["id"], "100")
        self.store.replace(response(note("200", "会议内容更新")))
        self.assertEqual(self.store.get(self.row["id"], "research")["note"]["id"], self.row["id"])
        self.store.replace_source("research", [])
        self.assertEqual(self.store.status("research")["documents"], 0)
        self.assertEqual(self.store.get("200")["note"]["id"], "200")

    def test_failed_source_validation_retains_other_sources(self):
        self.store.replace_source("research", [self.row])
        with self.assertRaises(KnowledgeError):
            self.store.replace_source("research", [self.row, self.row])
        self.assertEqual(self.store.status("research")["documents"], 1)
        self.assertEqual(self.store.status()["documents"], 1)
        self.store.record_error("research")
        self.assertIsNone(self.store.status()["last_error"])
        self.assertIsNotNone(self.store.status("research")["last_error"])

    def test_freshness_and_request_scope_are_source_bound(self):
        self.store.replace_source("research", [self.row])
        with self.store.connect() as conn:
            conn.execute("UPDATE metadata SET value='0' WHERE key='research.synced_epoch'")
        with self.assertRaises(KnowledgeError):
            self.store.get(self.row["id"], "research")
        self.assertEqual(self.store.get("100")["note"]["id"], "100")
        for value in [{"op": "get", "id": self.row["id"]},
                      {"op": "status", "source": "arbitrary-library"},
                      {"op": "status", "source": ["research"]}]:
            with self.assertRaises(KnowledgeError):
                request(self.store, value)
        self.assertEqual(len(request(self.store, {"op": "catalog"})["sources"]), 4)

    def test_legacy_six_column_database_migrates_without_losing_recordings(self):
        root = Path(self.temp.name) / "old"
        root.mkdir(mode=0o700)
        conn = sqlite3.connect(root / "index.sqlite3")
        conn.executescript("""
            CREATE TABLE documents(id TEXT PRIMARY KEY,title TEXT,content TEXT,created_at TEXT,updated_at TEXT,url TEXT);
            CREATE VIRTUAL TABLE search_index USING fts5(title,content,tokenize='trigram');
            CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            INSERT INTO documents VALUES ('100','旧会议','原录音正文','','','https://www.biji.com/note/100');
            INSERT INTO search_index VALUES ('旧会议','原录音正文');
        """)
        conn.execute("INSERT INTO metadata VALUES ('synced_epoch',?)", (str(time.time()),))
        conn.commit()
        conn.close()
        store = Store(root)
        self.assertEqual(store.get("100")["note"]["content"], "原录音正文")
        store.replace_source("research", [self.row])
        store.replace(response(note("200")))
        self.assertEqual(store.status("research")["documents"], 1)
        self.assertEqual(store.status()["documents"], 1)

    def test_research_uses_manual_corrections_and_exclusions_without_mutating_source(self):
        raw = product()
        data = {"products": [raw, {**product(), "id": "product-2"}], "snapshot_at": "2026-10-19"}
        entries = {"entries": {"product-1": {"corrections": {"name": "修订名", "price": None}, "note": "人工意见"},
                               "product-2": {"excluded": True}}}
        rows, facts = research_records(data, entries)
        self.assertEqual(len(rows), 1)
        payload = json.loads(rows[0]["content"])
        self.assertEqual(payload["名称"], "修订名")
        self.assertIsNone(payload["价格"])
        self.assertEqual(payload["人工备注"], "人工意见")
        self.assertEqual(facts["excluded_records"], 1)
        self.assertEqual(raw["name"], "原名")
        with self.assertRaises(ValueError):
            research_records({"products": [raw, raw]}, {"entries": {}})

    def test_content_keeps_relations_without_storage_paths_or_media_tickets(self):
        rows, facts = content_records({"cards": [{"id": "card-1", "title": "样品视频", "media_url": "https://media.test/?token=secret", "result_storage_filename": "/secret/storage"}],
                                      "result_versions": [{"card_id": "card-1", "revision": 2, "filename": "成品.mp4", "storage_filename": "/secret/storage"}]})
        self.assertEqual(facts["result_versions"], 1)
        self.assertNotIn("token=secret", rows[0]["content"])
        self.assertNotIn("/secret/storage", rows[0]["content"])
        self.assertIn("成品.mp4", rows[0]["content"])

    def test_business_keeps_dates_missing_values_and_metric_basis(self):
        data = {"completedDate": "2026-10-20", "completed": {"paidAmount": 100, "refundAmount": None, "refundAmountBasis": "按支付时间"},
                "realtime": {"date": "2026-10-25", "status": "incomplete-day"},
                "platformPublication": {"status": "partial", "platforms": {"youzan": {"missingDates": ["2026-10-20"]}}},
                "history": {"sales": [{"date": "2026-10-20", "paidAmount": 100}]}}
        rows, facts = business_records(data)
        payload = json.loads(rows[0]["content"])
        self.assertIsNone(payload["completed"]["refundAmount"])
        self.assertEqual(payload["completed"]["refundAmountBasis"], "按支付时间")
        self.assertEqual(facts["completed_date"], "2026-10-20")
        self.assertEqual(facts["platform_publication"]["status"], "partial")
        self.assertIn("实时快照", rows[1]["title"])

    def test_media_query_redaction_keeps_json_well_formed(self):
        payload = text_only(json.dumps({"url": "https://media.test/a?Signature=ticket", "value": 12}))
        self.assertEqual(json.loads(payload), {"url": "https://media.test/a", "value": 12})

    def test_fixed_site_fetch_reuses_conditional_cache(self):
        site = Site(Path(self.temp.name) / "cache")
        body = io.BytesIO(b'{"products":[]}')
        body.headers = {"ETag": '"one"', "Last-Modified": "today"}
        not_modified = urllib.error.HTTPError("https://staging.paolab.cn/tingzi/data.json", 304, "Not modified", {}, None)
        with patch.object(site.opener, "open", side_effect=[body, not_modified]) as opened:
            first = site.json("https://staging.paolab.cn/tingzi/data.json", cached=True)
            second = site.json("https://staging.paolab.cn/tingzi/data.json", cached=True)
        self.assertEqual(first, second)
        self.assertEqual(opened.call_args_list[1].args[0].get_header("If-none-match"), '"one"')
        with self.assertRaises(ValueError):
            SameSiteRedirect().redirect_request(urllib.request.Request("https://paolab.cn/"), None, 302, "", {}, "https://attacker.test/")

    def test_one_failed_upstream_does_not_drop_other_sources_or_restart_producers(self):
        config = self.store.root / "web.json"
        config.write_text(json.dumps({"sls": {"id": "id", "pin": "not-real"}, "adflow": {"name": "tester"}}))
        config.chmod(0o600)
        calls = []
        class FixedSite:
            def __init__(self, _cache):
                pass
            def json(self, url, body=None, cached=False):
                calls.append((url, body))
                if "paolab.cn/shangliangshan" in url:
                    raise OSError("upstream unavailable")
                if url.endswith("data.json"):
                    return {"products": [product()]}
                if url.endswith("api/state"):
                    return {"entries": {}}
                if url.endswith("api/login"):
                    return {"ok": True}
                return {"cards": []}
        with patch("source_adapters.Site", FixedSite):
            results, failures = collect_web(self.store, config)
        self.assertEqual(failures, ["business"])
        self.assertEqual(results["research"]["documents"], 1)
        self.assertEqual(self.store.status()["documents"], 1)
        self.assertTrue(all(body is None or url.endswith("auth/login") or url.endswith("api/login") for url, body in calls))


if __name__ == "__main__":
    unittest.main()
