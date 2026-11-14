#!/usr/bin/env python3
"""Team knowledge store: fixed recording library and three read-only site mirrors."""
import argparse
from contextlib import contextmanager
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
import re
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time

LIBRARY_ID = os.environ.get("OPCB_GETNOTE_LIBRARY_ID", "")
LIBRARY_NAME = "会议纪要与工作资料"
MAX_AGE = 900
MAX_BYTES = 64 * 1024 * 1024
SOURCES = {
    "recordings": (LIBRARY_NAME, "library text and summaries; not archived audio"),
    "business": ("上粮山经营数据", "原报表指标与明细；缺失保留、不同口径不合并"),
    "research": ("产品调研", "现有商品快照与人工修订；不恢复上游采集"),
    "content": ("内容资产", "素材、评论、审核及成品关系；不复制媒体原件"),
    "haowangshui": ("好望水飞书备份", "历史导出正文与目录；非实时飞书，不含音视频转写"),
}
TEAM_SOURCES = frozenset(SOURCES) - {"haowangshui"}


def source_key(source):
    if not isinstance(source, str) or source not in SOURCES:
        raise KnowledgeError("Unknown knowledge source")
    return "" if source == "recordings" else source + "."


def valid_id(source, value):
    return isinstance(value, str) and bool(re.fullmatch(
        r"[0-9]{1,30}" if source == "recordings" else re.escape(source) + r":[0-9a-f]{24}", value))
SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, url TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT 'recordings'
);
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, content, tokenize='trigram');
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


class KnowledgeError(Exception):
    pass


def stamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def text_only(content):
    # Temporary media tickets are not knowledge citations or text for an agent.
    content = re.sub(r"!\[[^\]]*\]\(https?://[^\s)]+\)", "[图片]", content)

    def safe_url(match):
        url = match.group(0)
        if re.search(r"[?&](?:signature|expires|token|accesskeyid|ossaccesskeyid|x-oss-[^=]+)=", url, re.I):
            return url.split("?", 1)[0]
        return url

    return re.sub(r"https?://[^\s<>\"')]*", safe_url, content)


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if stat.S_IMODE(self.root.stat().st_mode) & 0o077:
            raise KnowledgeError("Knowledge directory must be private (0700)")
        self.database = self.root / "index.sqlite3"

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.database, timeout=10)
        try:
            conn.row_factory = sqlite3.Row
            conn.executescript(SCHEMA)
            if "source" not in {row[1] for row in conn.execute("PRAGMA table_info(documents)")}:
                conn.execute("ALTER TABLE documents ADD COLUMN source TEXT NOT NULL DEFAULT 'recordings'")
            conn.execute("CREATE INDEX IF NOT EXISTS documents_source ON documents(source)")
            self.database.chmod(0o600)
            with conn:
                yield conn
        finally:
            conn.close()

    def status(self, source="recordings"):
        prefix = source_key(source)
        with self.connect() as conn:
            meta = dict(conn.execute("SELECT key,value FROM metadata"))
            count = conn.execute("SELECT count(*) FROM documents WHERE source=?", (source,)).fetchone()[0]
        epoch = float(meta.get(prefix + "synced_epoch", "0"))
        value = {
            "source": SOURCES[source][0], "source_id": source,
            "documents": count, "synced_at": meta.get(prefix + "synced_at"),
            "state": "ready" if epoch and (source == "haowangshui" or time.time() - epoch <= MAX_AGE) else "stale",
            "last_error": meta.get(prefix + "last_error") or None,
            "content_kind": SOURCES[source][1],
            "source_facts": json.loads(meta.get(prefix + "facts", "{}")),
            "untrusted_content": True,
        }
        if source == "recordings":
            value["library_id"] = LIBRARY_ID
        return value

    def require_fresh(self, source="recordings"):
        status = self.status(source)
        if status["state"] != "ready":
            raise KnowledgeError("Source is not freshly synchronized; query denied")
        return status

    def replace(self, response):
        data = response.get("data") if isinstance(response, dict) else None
        if not isinstance(response, dict) or response.get("success") is not True or not isinstance(data, dict):
            raise KnowledgeError("Invalid Getnote library response")
        notes = data.get("notes")
        if data.get("has_more") is not False or not isinstance(notes, list):
            raise KnowledgeError("Incomplete library listing; previous index retained")
        if len(notes) > 10000:
            raise KnowledgeError("Library exceeds pilot limit")
        records, seen = [], set()
        for note in notes:
            if not isinstance(note, dict):
                raise KnowledgeError("Invalid note record")
            note_id = note.get("note_id")
            if not isinstance(note_id, str) or not re.fullmatch(r"[0-9]{1,30}", note_id):
                raise KnowledgeError("Invalid note ID")
            if note_id in seen:
                raise KnowledgeError("Duplicate IDs during pagination; previous index retained")
            seen.add(note_id)
            fields = [note.get(k, "") or "" for k in ("title", "content", "created_at", "edit_time")]
            if not all(isinstance(value, str) for value in fields):
                raise KnowledgeError("Invalid note fields")
            fields[1] = text_only(fields[1])
            records.append(dict(zip(("id", "title", "content", "created_at", "updated_at", "url"),
                                    (note_id, *fields, f"https://www.biji.com/note/{note_id}"))))
        return self.replace_source("recordings", records)

    def replace_source(self, source, records, facts=None):
        prefix = source_key(source)
        if not isinstance(records, list) or len(records) > 20000:
            raise KnowledgeError("Invalid source document collection")
        seen, checked = set(), []
        for record in records:
            if not isinstance(record, dict) or not valid_id(source, record.get("id")) or record["id"] in seen:
                raise KnowledgeError("Invalid or duplicate source document ID")
            seen.add(record["id"])
            fields = [record.get(k, "") for k in ("id", "title", "content", "created_at", "updated_at", "url")]
            if not all(isinstance(value, str) for value in fields) or len(fields[2]) > 1024 * 1024:
                raise KnowledgeError("Invalid source document fields")
            url = urlsplit(fields[5])
            archive_url = (source == "haowangshui" and url.netloc == "shangliangshan.paolab.cn"
                           and url.path == "/opcb-knowledge/archive/" + record["id"]
                           and not url.query and not url.fragment)
            if url.scheme != "https" or not (archive_url or url.netloc in ("www.biji.com", "paolab.cn", "staging.paolab.cn")):
                raise KnowledgeError("Unexpected source citation origin")
            fields[2] = text_only(fields[2])
            checked.append((*fields, source))
        facts_json = json.dumps(facts or {}, ensure_ascii=False, allow_nan=False)
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM search_index WHERE rowid IN (SELECT rowid FROM documents WHERE source=?)", (source,))
            conn.execute("DELETE FROM documents WHERE source=?", (source,))
            for record in checked:
                rowid = conn.execute("INSERT INTO documents(id,title,content,created_at,updated_at,url,source) VALUES (?,?,?,?,?,?,?)", record).lastrowid
                conn.execute("INSERT INTO search_index(rowid,title,content) VALUES (?,?,?)", (rowid, record[1], record[2]))
            meta = {prefix + "synced_at": stamp(), prefix + "synced_epoch": str(time.time()),
                    prefix + "last_error": "", prefix + "facts": facts_json}
            conn.executemany("INSERT OR REPLACE INTO metadata VALUES (?,?)", meta.items())
        return self.status(source)

    def record_error(self, source="recordings"):
        prefix = source_key(source)
        with self.connect() as conn:
            conn.execute("INSERT OR REPLACE INTO metadata VALUES (?,?)", (prefix + "last_error", stamp()))

    def search(self, query, limit=5, source="recordings"):
        status = self.require_fresh(source)
        if not isinstance(query, str) or not 1 <= len(query.strip()) <= 100:
            raise KnowledgeError("Query must contain 1–100 characters")
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 20:
            raise KnowledgeError("Limit must be 1–20")
        query = query.strip()
        with self.connect() as conn:
            if len(query) >= 3:
                phrase = '"' + query.replace('"', '""') + '"'
                rows = conn.execute("""
                    SELECT d.* FROM search_index JOIN documents d ON d.rowid=search_index.rowid
                    WHERE search_index MATCH ? AND d.source=? ORDER BY rank LIMIT ?
                """, (phrase, source, limit)).fetchall()
            else:
                rows = conn.execute("""
                    SELECT * FROM documents WHERE source=? AND (instr(title,?)>0 OR instr(content,?)>0)
                    ORDER BY updated_at DESC LIMIT ?
                """, (source, query, query, limit)).fetchall()
        results = []
        for row in rows:
            content = row["content"]
            index = content.casefold().find(query.casefold())
            start = max(0, index - 100)
            results.append({"id": row["id"], "title": row["title"],
                            "excerpt": content[start:start + 700], "url": row["url"],
                            "updated_at": row["updated_at"]})
        return {"source": status, "query": query, "results": results}

    def get(self, note_id, source="recordings"):
        status = self.require_fresh(source)
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM documents WHERE id=? AND source=?", (note_id, source)).fetchone()
        if row is None:
            raise KnowledgeError("Note is not in the authorized library")
        return {"source": status, "note": dict(row)}


def collect(store, binary, credentials):
    if not LIBRARY_ID:
        raise KnowledgeError("An explicit GetNote library ID is required")
    credentials = Path(credentials)
    if stat.S_IMODE(credentials.stat().st_mode) & 0o077:
        raise KnowledgeError("Credentials must have mode 0600")
    config = json.loads(credentials.read_text())
    if not config.get("api_key") or not config.get("client_id"):
        raise KnowledgeError("Missing Getnote credentials")
    env = dict(os.environ, GETNOTE_API_KEY=config["api_key"], GETNOTE_CLIENT_ID=config["client_id"],
               GETNOTE_API_URL="https://openapi.biji.com", GETNOTE_WEB_URL="https://www.biji.com")
    with (store.root / "sync.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise KnowledgeError("Synchronization already running") from None
        try:
            # CLI stdout is private, never journaled. Only the fixed library is listed.
            with tempfile.TemporaryFile(dir=store.root) as output:
                result = subprocess.run([str(binary), "kb", LIBRARY_ID, "--all", "-o", "json"],
                                        env=env, stdout=output, stderr=subprocess.DEVNULL, timeout=240)
                if result.returncode or output.tell() > MAX_BYTES:
                    raise KnowledgeError("Getnote collection failed or exceeded size limit")
                output.seek(0)
                return store.replace(json.load(output))
        except (KnowledgeError, ValueError, subprocess.TimeoutExpired, OSError):
            store.record_error()
            raise KnowledgeError("Synchronization failed; no partial data published") from None


def request(store, value, sources=TEAM_SOURCES):
    if not isinstance(value, dict) or value.get("op") not in ("catalog", "status", "search", "get"):
        raise KnowledgeError("Unsupported read operation")
    allowed = {"catalog": {"op"}, "status": {"op", "source"},
               "search": {"op", "source", "query", "limit"}, "get": {"op", "source", "id"}}[value["op"]]
    if set(value) - allowed:
        raise KnowledgeError("Unexpected request fields")
    if value["op"] == "catalog":
        return {"sources": [store.status(source) for source in SOURCES if source in sources]}
    source = value.get("source", "recordings")
    source_key(source)
    if source not in sources:
        raise KnowledgeError("Knowledge source access denied")
    if value["op"] == "status":
        return store.status(source)
    if value["op"] == "search":
        return store.search(value.get("query"), value.get("limit", 5), source)
    if not valid_id(source, value.get("id")):
        raise KnowledgeError("Invalid source document ID")
    return store.get(value["id"], source)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default="/opt/opcb-knowledge/state")
    parser.add_argument("--binary", default="/opt/opcb-knowledge/bin/getnote")
    parser.add_argument("--credentials", default="/opt/opcb-knowledge/getnote-access.json")
    parser.add_argument("--web-credentials", default="/opt/opcb-knowledge/business-access.json")
    parser.add_argument("command", choices=["sync", "request"])
    args = parser.parse_args()
    try:
        store = Store(args.root)
        if args.command == "sync":
            with (store.root / "batch.lock").open("w") as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise KnowledgeError("Synchronization batch already running") from None
                from source_adapters import collect_web
                results, failed = {}, []
                try:
                    results["recordings"] = collect(store, args.binary, args.credentials)
                except Exception:
                    failed.append("recordings")
                    results["recordings"] = {"error": "Recording sync failed; previous snapshot retained"}
                web_results, web_failed = collect_web(store, args.web_credentials)
                result = {"sources": {**results, **web_results}, "failed": failed + web_failed}
        else:
            raw = sys.stdin.buffer.read(8193)
            if len(raw) > 8192:
                raise KnowledgeError("Request too large")
            result = request(store, json.loads(raw))
        print(json.dumps(result, ensure_ascii=False))
        if args.command == "sync" and result.get("failed"):
            return 1
    except (KnowledgeError, ValueError, OSError, sqlite3.Error) as error:
        # No upstream response bodies, note content, or credential values in failures.
        message = str(error) if isinstance(error, KnowledgeError) else "Knowledge operation failed"
        print(json.dumps({"error": message}, ensure_ascii=False))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
