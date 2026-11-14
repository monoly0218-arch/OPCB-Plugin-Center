"""Server-authoritative library grants. Call only after signature verification.

No password/session auth is implemented here. Public-key strings in a JSON
request must never be used to construct VerifiedIdentity at the HTTP boundary.
"""
from contextlib import closing
from dataclasses import dataclass
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import time

KEY = re.compile(r"[0-9a-f]{64}\Z")
LIBRARY = re.compile(r"[a-z][a-z0-9.-]{0,79}\Z")


class PermissionDenied(Exception):
    pass


class PolicyConflict(Exception):
    pass


@dataclass(frozen=True)
class VerifiedIdentity:
    community: str
    owner: str
    actor: str
    proof_id: str

    def __post_init__(self):
        if any(not isinstance(v, str) or not KEY.fullmatch(v)
               for v in (self.community, self.owner, self.actor, self.proof_id)):
            raise PermissionDenied("Verified identity is required")

    @property
    def delegated(self):
        return self.owner != self.actor


class LibraryPolicy:
    def __init__(self, filename, community, administrators):
        if not KEY.fullmatch(community) or not administrators or any(not KEY.fullmatch(a) for a in administrators):
            raise PermissionDenied("Explicit server-owned bootstrap configuration is required")
        self.filename = Path(filename)
        self.community = community
        self.administrators = frozenset(administrators)
        parent = self.filename.parent.stat()
        if parent.st_uid != os.geteuid() or parent.st_mode & 0o077 or not stat.S_ISDIR(parent.st_mode):
            raise PermissionDenied("Policy directory must be private and service-owned")
        try:
            fd = os.open(self.filename, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            info = self.filename.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
                raise PermissionDenied("Policy database must be a private regular file") from None
        else:
            os.close(fd)
        with closing(self.connect()) as db, db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS policy_revision (id INTEGER PRIMARY KEY CHECK(id=1), value INTEGER NOT NULL);
                INSERT OR IGNORE INTO policy_revision VALUES (1,0);
                CREATE TABLE IF NOT EXISTS library (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent TEXT REFERENCES library(id));
                CREATE TABLE IF NOT EXISTS source (id TEXT PRIMARY KEY, library TEXT NOT NULL REFERENCES library(id));
                CREATE TABLE IF NOT EXISTS grant_rule (owner TEXT NOT NULL, library TEXT NOT NULL REFERENCES library(id), allow INTEGER NOT NULL CHECK(allow IN (0,1)), PRIMARY KEY(owner,library));
                CREATE TABLE IF NOT EXISTS disabled (owner TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS audit (revision INTEGER PRIMARY KEY, actor TEXT NOT NULL, owner TEXT NOT NULL, proof TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL, at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS audit_changes (revision INTEGER PRIMARY KEY REFERENCES audit(revision), before_value TEXT NOT NULL, after_value TEXT NOT NULL);
            """)
            # A separate table keeps the legacy seven-column audit schema intact,
            # so rolling back the service cannot break old INSERT statements.

    @staticmethod
    def audit_value(db, action, payload):
        if action == "library":
            row = db.execute("SELECT id,name,parent FROM library WHERE id=?", (payload.get("id"),)).fetchone()
            return dict(row) if row else None
        if action == "source":
            row = db.execute("SELECT id,library FROM source WHERE id=?", (payload.get("id"),)).fetchone()
            return dict(row) if row else None
        if action in ("grant", "inherit"):
            row = db.execute("SELECT allow FROM grant_rule WHERE owner=? AND library=?", (payload.get("owner"), payload.get("library"))).fetchone()
            return {"rule": "inherit" if row is None else "allow" if row[0] else "deny"}
        if action == "disable":
            return {"disabled": bool(db.execute("SELECT 1 FROM disabled WHERE owner=?", (payload.get("owner"),)).fetchone())}
        return None

    def connect(self):
        db = sqlite3.connect(self.filename, timeout=3)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def check_identity(self, identity):
        if not isinstance(identity, VerifiedIdentity) or identity.community != self.community:
            raise PermissionDenied("Identity must be verified for this community")

    def check_admin(self, identity):
        self.check_identity(identity)
        if identity.delegated or identity.owner not in self.administrators:
            raise PermissionDenied("A verified personal administrator is required; agents inherit read access only")

    def revision(self):
        with closing(self.connect()) as db:
            return db.execute("SELECT value FROM policy_revision WHERE id=1").fetchone()[0]

    def change(self, identity, expected_revision, action, payload):
        self.check_admin(identity)
        if type(expected_revision) is not int or not isinstance(payload, dict):
            raise ValueError("Invalid policy change")
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            revision = db.execute("SELECT value FROM policy_revision WHERE id=1").fetchone()[0]
            if revision != expected_revision:
                raise PolicyConflict("Policy changed; refresh before saving")
            before = self.audit_value(db, action, payload)
            if action == "library":
                if set(payload) != {"id", "name", "parent"} or not LIBRARY.fullmatch(payload["id"]) or not isinstance(payload["name"], str) or not 1 <= len(payload["name"].strip()) <= 80:
                    raise ValueError("Invalid library")
                row = db.execute("SELECT parent FROM library WHERE id=?", (payload["id"],)).fetchone()
                if row and row["parent"] != payload["parent"]:
                    raise ValueError("Changing library ancestry requires an explicit migration")
                if payload["parent"] is not None and (payload["parent"] == payload["id"] or not db.execute("SELECT 1 FROM library WHERE id=?", (payload["parent"],)).fetchone()):
                    raise ValueError("Invalid library parent")
                db.execute("INSERT INTO library VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name", (payload["id"], payload["name"].strip(), payload["parent"]))
            elif action == "source":
                if set(payload) != {"id", "library"} or not LIBRARY.fullmatch(payload["id"]):
                    raise ValueError("Invalid source mapping")
                db.execute("INSERT INTO source VALUES (?,?) ON CONFLICT(id) DO UPDATE SET library=excluded.library", (payload["id"], payload["library"]))
            elif action == "grant":
                if set(payload) != {"owner", "library", "allow"} or not KEY.fullmatch(payload["owner"]) or type(payload["allow"]) is not bool:
                    raise ValueError("Invalid personal grant")
                db.execute("INSERT INTO grant_rule VALUES (?,?,?) ON CONFLICT(owner,library) DO UPDATE SET allow=excluded.allow", (payload["owner"], payload["library"], int(payload["allow"])))
            elif action == "disable":
                if set(payload) != {"owner", "disabled"} or not KEY.fullmatch(payload["owner"]) or type(payload["disabled"]) is not bool:
                    raise ValueError("Invalid personal status")
                if payload["disabled"]:
                    db.execute("INSERT OR IGNORE INTO disabled VALUES (?)", (payload["owner"],))
                else:
                    db.execute("DELETE FROM disabled WHERE owner=?", (payload["owner"],))
            elif action == "inherit":
                if set(payload) != {"owner", "library"} or not KEY.fullmatch(payload["owner"]):
                    raise ValueError("Invalid inherited grant")
                db.execute("DELETE FROM grant_rule WHERE owner=? AND library=?", (payload["owner"], payload["library"]))
            else:
                raise ValueError("Unsupported policy action")
            revision += 1
            db.execute("UPDATE policy_revision SET value=? WHERE id=1", (revision,))
            db.execute("INSERT INTO audit (revision,actor,owner,proof,action,payload,at) VALUES (?,?,?,?,?,?,?)", (revision, identity.actor, identity.owner, identity.proof_id, action, json.dumps(payload, ensure_ascii=False), time.time()))
            db.execute("INSERT INTO audit_changes VALUES (?,?,?)", (revision, json.dumps(before, ensure_ascii=False), json.dumps(self.audit_value(db, action, payload), ensure_ascii=False)))
            return revision

    def allowed(self, identity, source):
        self.check_identity(identity)
        with closing(self.connect()) as db:
            db.execute("BEGIN")
            return self._allowed(db, identity.owner, source)

    @staticmethod
    def _allowed(db, owner, source):
        if db.execute("SELECT 1 FROM disabled WHERE owner=?", (owner,)).fetchone():
            return False
        row = db.execute("SELECT library FROM source WHERE id=?", (source,)).fetchone()
        if not row:
            return False
        library, seen, granted = row["library"], set(), False
        while library is not None:
            if library in seen:
                return False
            seen.add(library)
            rule = db.execute("SELECT allow FROM grant_rule WHERE owner=? AND library=?", (owner, library)).fetchone()
            if rule:
                if not rule["allow"]:
                    return False
                granted = True
            parent = db.execute("SELECT parent FROM library WHERE id=?", (library,)).fetchone()
            if not parent:
                return False
            library = parent["parent"]
        return granted

    def read_access(self, identity):
        """One SQLite snapshot for grants, names and the revision fence."""
        self.check_identity(identity)
        with closing(self.connect()) as db:
            db.execute("BEGIN")
            revision = db.execute("SELECT value FROM policy_revision WHERE id=1").fetchone()[0]
            libraries = {r["id"]: dict(r) for r in db.execute("SELECT * FROM library")}
            sources = [dict(r) for r in db.execute("SELECT * FROM source ORDER BY id")
                       if self._allowed(db, identity.owner, r["id"])]
            visible = set()
            for source in sources:
                library = source["library"]
                while library is not None and library not in visible:
                    visible.add(library)
                    library = libraries[library]["parent"]
            return {"revision": revision, "sources": sources,
                    "libraries": [libraries[i] for i in sorted(visible)]}

    def snapshot(self, identity):
        self.check_admin(identity)
        with closing(self.connect()) as db:
            return {"revision": db.execute("SELECT value FROM policy_revision WHERE id=1").fetchone()[0],
                    "libraries": [dict(r) for r in db.execute("SELECT * FROM library ORDER BY id")],
                    "sources": [dict(r) for r in db.execute("SELECT * FROM source ORDER BY id")],
                    "grants": [dict(r) for r in db.execute("SELECT * FROM grant_rule ORDER BY owner,library")],
                    "disabled": [r[0] for r in db.execute("SELECT owner FROM disabled ORDER BY owner")],
                    "audit": [dict(r) for r in db.execute("SELECT a.revision,a.actor,a.owner,a.action,a.payload,a.at,c.before_value,c.after_value FROM audit a LEFT JOIN audit_changes c ON c.revision=a.revision ORDER BY a.revision DESC LIMIT 50")]}

    def bootstrap_libraries(self):
        """Local service setup only; never called from an HTTP request."""
        libraries = [("company", "OPCB 企业知识库", None),
                     ("work-records", "会议纪要与工作资料", "company"),
                     ("shangliangshan", "上粮山业务知识库", "company"),
                     ("operations", "经营数据", "shangliangshan"),
                     ("product-research", "产品与市场研究", "shangliangshan"),
                     ("content-assets", "内容资产", "shangliangshan"),
                     ("project-archive", "项目档案", "company")]
        sources = [("recordings", "work-records"), ("business", "operations"),
                   ("research", "product-research"), ("content", "content-assets"), ("haowangshui", "project-archive")]
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT COUNT(*) FROM library").fetchone()[0]:
                return
            db.executemany("INSERT INTO library VALUES (?,?,?)", libraries)
            db.executemany("INSERT INTO source VALUES (?,?)", sources)
            db.executemany("INSERT INTO grant_rule VALUES (?,?,1)", [(a, "company") for a in self.administrators])
            db.execute("UPDATE policy_revision SET value=1 WHERE id=1")
            db.execute("INSERT INTO audit (revision,actor,owner,proof,action,payload,at) VALUES (1,?,?,?,?,?,?)", ("server-bootstrap", "server-bootstrap", "server-config", "bootstrap", "{}", time.time()))

    def bootstrap_collection_source(self):
        """Only when the operator explicitly enables --collection-root; no grants added."""
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            existing = db.execute("SELECT library FROM source WHERE id='collection'").fetchone()
            if existing:
                if existing["library"] != "collected-artifacts":
                    raise PolicyConflict("Existing collection mapping needs explicit migration")
                return
            if not db.execute("SELECT 1 FROM library WHERE id='company'").fetchone():
                raise PermissionDenied("Bootstrap the company library before enabling collection")
            db.execute("INSERT INTO library VALUES('collected-artifacts','收藏与产物','company')")
            db.execute("INSERT INTO source VALUES('collection','collected-artifacts')")
            db.execute("UPDATE policy_revision SET value=value+1 WHERE id=1")
            revision = db.execute("SELECT value FROM policy_revision WHERE id=1").fetchone()[0]
            db.execute("INSERT INTO audit (revision,actor,owner,proof,action,payload,at) VALUES(?,?,?,?,?,?,?)", (revision, 'server-bootstrap', 'server-bootstrap', 'server-config', 'enable-owner-private-collection', '{}', time.time()))
