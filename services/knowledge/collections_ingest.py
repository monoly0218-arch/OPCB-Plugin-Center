"""Typed, owner-private knowledge deposits. Never fetches a submitted URL.

The gateway supplies a verified identity and checks the collection source grant
on EVERY call. This is independent of the immutable GetNote/source indexes.
"""
import base64
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import time
from urllib.parse import urlsplit

from identity_policy import PermissionDenied, PolicyConflict, VerifiedIdentity

KINDS = {"document", "image", "video", "audio", "link"}
HEX = re.compile(r"[a-f0-9]{64}\Z")
MAX_BYTES, CHUNK_BYTES, QUOTA = 32 * 1024 * 1024, 128 * 1024, 256 * 1024 * 1024


def safe_url(value):
    if not isinstance(value, str) or len(value) > 4096:
        raise ValueError("Invalid source URL")
    url = urlsplit(value)
    if url.scheme not in {"https", "http"} or not url.hostname or url.username or url.password:
        raise ValueError("Invalid source URL")
    return value


class Collections:
    def __init__(self, filename, now=time.time):
        self.filename, self.now = Path(filename), now
        parent = self.filename.parent.stat()
        if parent.st_uid != os.geteuid() or parent.st_mode & 0o077:
            raise PermissionDenied("Collection directory must be private")
        try:
            fd = os.open(self.filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            info = self.filename.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
                raise PermissionDenied("Collection database must be private")
        else:
            os.close(fd)
        with closing(self.connect()) as db, db:
            db.executescript('''
              CREATE TABLE IF NOT EXISTS deposit(id TEXT PRIMARY KEY,community TEXT NOT NULL,owner TEXT NOT NULL,actor TEXT NOT NULL,source_id TEXT NOT NULL,fingerprint TEXT NOT NULL,metadata TEXT NOT NULL,size INTEGER NOT NULL,digest TEXT NOT NULL,mime TEXT NOT NULL,next INTEGER NOT NULL DEFAULT 0,received INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,created REAL NOT NULL,completed REAL,UNIQUE(community,owner,source_id));
              CREATE TABLE IF NOT EXISTS chunk(deposit TEXT NOT NULL REFERENCES deposit(id),seq INTEGER NOT NULL,body BLOB NOT NULL,PRIMARY KEY(deposit,seq));
            ''')

    def connect(self):
        db = sqlite3.connect(self.filename, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    @staticmethod
    def _scope(principal):
        if not isinstance(principal, VerifiedIdentity):
            raise PermissionDenied("Verified identity required")
        return principal.community, principal.owner

    @staticmethod
    def metadata(value):
        allowed = {"source_id", "title", "kind", "source_url", "channel_id", "message_id", "tags", "group_id", "version", "group_title"}
        if not isinstance(value, dict) or set(value) - allowed:
            raise ValueError("Invalid deposit metadata")
        if not isinstance(value.get("source_id"), str) or not 1 <= len(value["source_id"]) <= 4096 or value.get("kind") not in KINDS:
            raise ValueError("Invalid artifact identity/type")
        if not isinstance(value.get("title"), str) or not 1 <= len(value["title"].strip()) <= 240:
            raise ValueError("Invalid artifact title")
        safe_url(value.get("source_url"))
        if not isinstance(value.get("channel_id"), str) or not 1 <= len(value["channel_id"]) <= 100 or not HEX.fullmatch(value.get("message_id", "")):
            raise ValueError("Invalid source message")
        tags = value.get("tags", [])
        if not isinstance(tags, list) or len(tags) > 16 or any(not isinstance(tag, str) or not 1 <= len(tag) <= 60 for tag in tags):
            raise ValueError("Invalid tags")
        if value.get("group_id") is not None and (not isinstance(value["group_id"], str) or len(value["group_id"]) > 100):
            raise ValueError("Invalid version group")
        if value.get("group_title") is not None and (not isinstance(value["group_title"], str) or len(value["group_title"]) > 120):
            raise ValueError("Invalid group title")
        if value.get("version") is not None and (type(value["version"]) is not int or not 1 <= value["version"] <= 100):
            raise ValueError("Invalid source version")
        return {**value, "title": value["title"].strip(), "tags": tags}

    def begin(self, principal, metadata, upload=None):
        community, owner = self._scope(principal)
        meta = self.metadata(metadata)
        upload = upload or {"size": 0, "sha256": hashlib.sha256(b"").hexdigest(), "mime": "text/uri-list"}
        if set(upload) != {"size", "sha256", "mime"} or type(upload["size"]) is not int or not 0 <= upload["size"] <= MAX_BYTES or not HEX.fullmatch(upload["sha256"]) or not isinstance(upload["mime"], str) or len(upload["mime"]) > 100:
            raise ValueError("Invalid upload descriptor")
        if meta["kind"] == "link" and upload["size"]:
            raise ValueError("Links are explicit references, not hidden file uploads")
        if meta["kind"] != "link" and not upload["size"]:
            raise ValueError("Files require original bytes; a URL alone is a link")
        if meta["kind"] == "image" and upload["mime"] not in {"image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"}:
            raise ValueError("Unsupported image MIME")
        if meta["kind"] in {"image", "video", "audio"} and not upload["mime"].startswith(meta["kind"] + "/"):
            raise ValueError("File type and MIME disagree")
        fingerprint = hashlib.sha256(json.dumps([meta, upload], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        identifier = "collection:" + hashlib.sha256(json.dumps([community, owner, meta["source_id"]]).encode()).hexdigest()[:24]
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM deposit WHERE id=?", (identifier,)).fetchone()
            if previous:
                if (previous["community"], previous["owner"]) != (community, owner):
                    raise PermissionDenied("Collection item unavailable")
                if previous["fingerprint"] != fingerprint:
                    raise PolicyConflict("This source was already deposited with different content")
                return self.receipt(previous)
            if db.execute("SELECT count(*) FROM deposit WHERE community=? AND owner=?", (community, owner)).fetchone()[0] >= 10000:
                raise ValueError("Personal collection item capacity reached")
            total = db.execute("SELECT COALESCE(sum(size),0) FROM deposit WHERE community=? AND owner=?", (community, owner)).fetchone()[0]
            if total + upload["size"] > QUOTA:
                raise ValueError("Personal collection capacity reached")
            db.execute("INSERT INTO deposit(id,community,owner,actor,source_id,fingerprint,metadata,size,digest,mime,state,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (identifier, community, owner, principal.actor, meta["source_id"], fingerprint, json.dumps(meta, ensure_ascii=False), upload["size"], upload["sha256"], upload["mime"], "uploading", self.now()))
            return self.receipt(db.execute("SELECT * FROM deposit WHERE id=?", (identifier,)).fetchone())

    def owned(self, db, principal, identifier, complete=False):
        community, owner = self._scope(principal)
        row = db.execute("SELECT * FROM deposit WHERE id=? AND community=? AND owner=?", (identifier, community, owner)).fetchone()
        if row is None or (complete and row["state"] != "complete"):
            raise PermissionDenied("Collection item unavailable")
        return row

    def append(self, principal, identifier, seq, encoded):
        if type(seq) is not int or seq < 0 or not isinstance(encoded, str) or len(encoded) > 4 * ((CHUNK_BYTES + 2) // 3):
            raise ValueError("Invalid upload chunk")
        body = base64.b64decode(encoded, validate=True)
        if not 0 < len(body) <= CHUNK_BYTES:
            raise ValueError("Invalid chunk size")
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = self.owned(db, principal, identifier)
            previous = db.execute("SELECT body FROM chunk WHERE deposit=? AND seq=?", (identifier, seq)).fetchone()
            if previous:
                if bytes(previous[0]) != body:
                    raise PolicyConflict("Chunk retry has different bytes")
                return self.receipt(row)
            if row["state"] != "uploading" or seq != row["next"] or row["received"] + len(body) > row["size"] or len(body) != min(CHUNK_BYTES, row["size"] - row["received"]):
                raise PolicyConflict("Upload sequence or size changed")
            db.execute("INSERT INTO chunk VALUES(?,?,?)", (identifier, seq, body))
            db.execute("UPDATE deposit SET next=next+1,received=received+? WHERE id=?", (len(body), identifier))
            return self.receipt(db.execute("SELECT * FROM deposit WHERE id=?", (identifier,)).fetchone())

    def commit(self, principal, identifier):
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            row = self.owned(db, principal, identifier)
            if row["state"] == "complete":
                return self.receipt(row)
            digest = hashlib.sha256()
            for part in db.execute("SELECT body FROM chunk WHERE deposit=? ORDER BY seq", (identifier,)):
                digest.update(part[0])
            if row["received"] != row["size"] or digest.hexdigest() != row["digest"]:
                raise ValueError("Upload incomplete or hash mismatch")
            db.execute("UPDATE deposit SET state='complete',completed=? WHERE id=?", (self.now(), identifier))
            return self.receipt(db.execute("SELECT * FROM deposit WHERE id=?", (identifier,)).fetchone())

    @staticmethod
    def receipt(row):
        return {"id": row["id"], "state": row["state"], "next": row["next"], "received": row["received"], "size": row["size"], "sha256": row["digest"], "mime": row["mime"], "owner": row["owner"], "actor": row["actor"], "saved_at": row["completed"], "metadata": json.loads(row["metadata"]), "storage": "original" if row["size"] else "link"}

    def read(self, principal, identifier, seq=None):
        with closing(self.connect()) as db:
            row = self.owned(db, principal, identifier, complete=True)
            result = self.receipt(row)
            if seq is not None:
                if type(seq) is not int or seq < 0:
                    raise ValueError("Invalid chunk cursor")
                part = db.execute("SELECT body FROM chunk WHERE deposit=? AND seq=?", (identifier, seq)).fetchone()
                result["chunk"] = base64.b64encode(part[0]).decode() if part else None
            return result

    def list(self, principal, kind=None, query="", limit=20, offset=0):
        community, owner = self._scope(principal)
        if kind is not None and kind not in KINDS or not isinstance(query, str) or len(query) > 100 or type(limit) is not int or not 1 <= limit <= 20 or type(offset) is not int or not 0 <= offset <= 1000000:
            raise ValueError("Invalid collection query")
        # Escape LIKE metacharacters so a user query stays a literal keyword.
        word = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        with closing(self.connect()) as db:
            rows = db.execute("SELECT * FROM deposit WHERE community=? AND owner=? AND state='complete' AND (? IS NULL OR json_extract(metadata,'$.kind')=?) AND (?='' OR metadata LIKE ? ESCAPE '\\') ORDER BY completed DESC,id LIMIT ? OFFSET ?", (community, owner, kind, kind, word, "%" + word + "%", limit + 1, offset)).fetchall()
        return {"results": [self.receipt(row) for row in rows[:limit]], "more": len(rows) > limit, "offset": offset}

    def count(self, principal):
        community, owner = self._scope(principal)
        with closing(self.connect()) as db:
            return db.execute("SELECT count(*) FROM deposit WHERE community=? AND owner=? AND state='complete'", (community, owner)).fetchone()[0]

    def request(self, principal, body):
        if not isinstance(body, dict):
            raise ValueError("Invalid collection request")
        op = body.get("op")
        fields = {"begin": {"op", "metadata", "upload"}, "append": {"op", "id", "seq", "chunk"}, "commit": {"op", "id"}, "get": {"op", "id", "seq"}, "list": {"op", "kind", "query", "limit", "offset"}}
        if op not in fields or set(body) - fields[op]:
            raise ValueError("Unsupported collection operation")
        if op == "begin": return self.begin(principal, body["metadata"], body.get("upload"))
        if op == "append": return self.append(principal, body["id"], body["seq"], body["chunk"])
        if op == "commit": return self.commit(principal, body["id"])
        if op == "get": return self.read(principal, body["id"], body.get("seq"))
        return self.list(principal, body.get("kind"), body.get("query", ""), body.get("limit", 20), body.get("offset", 0))
