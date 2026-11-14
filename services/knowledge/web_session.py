"""Personal, revocable browser sessions; independent of NIP-98 and agent custody."""
from contextlib import closing
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import time

KEY = re.compile(r"[a-f0-9]{64}\Z")
TOKEN = re.compile(r"[A-Za-z0-9_-]{43}\Z")


class SessionError(Exception):
    pass


class PasswordAccess:
    """One server-owned password hash; never shipped with the plugin."""
    def __init__(self, filename):
        self.filename = Path(filename)
        self.record()

    @staticmethod
    def encode(password):
        if not isinstance(password, str) or not 1 <= len(password) <= 256:
            raise SessionError("A password of 1 to 256 characters is required")
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
        return {"salt": salt.hex(), "digest": digest.hex()}

    def record(self):
        try:
            with os.fdopen(os.open(self.filename, os.O_RDONLY | os.O_NOFOLLOW), "rb") as stream:
                info = os.fstat(stream.fileno())
                if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077
                        or info.st_uid != os.geteuid() or info.st_size > 4096):
                    raise SessionError("Password file must be private and owned by the service")
                value = json.loads(stream.read(4097))
            if (not isinstance(value, dict) or set(value) != {"salt", "digest"}
                    or not isinstance(value["salt"], str) or not re.fullmatch(r"[0-9a-f]{32}", value["salt"])
                    or not isinstance(value["digest"], str) or not re.fullmatch(r"[0-9a-f]{128}", value["digest"])):
                raise SessionError("Password configuration is invalid")
            return value
        except (OSError, ValueError, TypeError) as error:
            raise SessionError("Password configuration is unavailable") from error

    def verify(self, password):
        if not isinstance(password, str) or not 1 <= len(password) <= 256:
            raise SessionError("Password is incorrect")
        record = self.record()
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(record["salt"]), n=16384, r=8, p=1)
        if not hmac.compare_digest(digest.hex(), record["digest"]):
            raise SessionError("Password is incorrect")


class BrowserSessions:
    def __init__(self, filename, admitted, now=time.time):
        self.filename = Path(filename)
        self.admitted = admitted
        self.now = now
        parent = self.filename.parent.stat()
        if (not stat.S_ISDIR(parent.st_mode) or parent.st_mode & 0o077
                or parent.st_uid != os.geteuid()):
            raise SessionError("Session directory must belong to the service and be private")
        try:
            descriptor = os.open(self.filename, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            info = self.filename.lstat()
            if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077
                    or info.st_uid != os.geteuid()):
                raise SessionError("Session database must be a private regular file") from None
        else:
            os.close(descriptor)
        with closing(self.connect()) as db, db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS activation (
                    digest TEXT PRIMARY KEY, owner TEXT NOT NULL, expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS session (
                    digest TEXT PRIMARY KEY, owner TEXT NOT NULL, expires REAL NOT NULL);
            """)

    def connect(self):
        return sqlite3.connect(self.filename, timeout=3)

    @staticmethod
    def digest(token):
        if not isinstance(token, str) or not TOKEN.fullmatch(token):
            raise SessionError("Login is required")
        return hashlib.sha256(token.encode("ascii")).hexdigest()

    def prune(self, db):
        for table in ("activation", "session"):
            db.execute(f"DELETE FROM {table} WHERE expires <= ?", (self.now(),))

    def issue(self, owner):
        """Administrator-only CLI. A code binds one already-admitted person."""
        if not isinstance(owner, str) or not KEY.fullmatch(owner) or not self.admitted(owner):
            raise SessionError("The person is not currently admitted")
        code = secrets.token_urlsafe(32)
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            self.prune(db)
            if db.execute("SELECT COUNT(*) FROM activation").fetchone()[0] >= 256:
                raise SessionError("Too many pending activations")
            db.execute("INSERT INTO activation VALUES (?, ?, ?)",
                       (self.digest(code), owner, self.now() + 300))
        return code

    def exchange(self, code, expected_owner):
        if not isinstance(expected_owner, str) or not KEY.fullmatch(expected_owner):
            raise SessionError("Open this workspace from the current Buzz account")
        digest = self.digest(code)
        token = secrets.token_urlsafe(32)
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            self.prune(db)
            row = db.execute("SELECT owner FROM activation WHERE digest=?", (digest,)).fetchone()
            if not row or row[0] != expected_owner or not self.admitted(row[0]):
                raise SessionError("Activation is invalid, expired or belongs to another account")
            if db.execute("SELECT COUNT(*) FROM session").fetchone()[0] >= 1024:
                raise SessionError("Too many active sessions")
            db.execute("DELETE FROM activation WHERE digest=?", (digest,))
            db.execute("INSERT INTO session VALUES (?, ?, ?)",
                       (self.digest(token), row[0], self.now() + 12 * 3600))
        return token

    def start(self, owner):
        """Called only after shared-password verification by the gateway."""
        if not isinstance(owner, str) or not KEY.fullmatch(owner) or not self.admitted(owner):
            raise SessionError("A valid client identifier is required")
        token = secrets.token_urlsafe(32)
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            self.prune(db)
            if db.execute("SELECT COUNT(*) FROM session").fetchone()[0] >= 1024:
                raise SessionError("Too many active sessions")
            db.execute("INSERT INTO session VALUES (?, ?, ?)",
                       (self.digest(token), owner, self.now() + 12 * 3600))
        return token

    def owner(self, token, expected_owner):
        if not isinstance(expected_owner, str) or not KEY.fullmatch(expected_owner):
            raise SessionError("Open this workspace from the current Buzz account")
        digest = self.digest(token)
        with closing(self.connect()) as db, db:
            row = db.execute("SELECT owner,expires FROM session WHERE digest=?", (digest,)).fetchone()
            if not row or row[0] != expected_owner:
                raise SessionError("Login is required for this account")
            if row[1] <= self.now() or not self.admitted(row[0]):
                db.execute("DELETE FROM session WHERE digest=?", (digest,))
                # Commit retirement even though the caller receives a denial.
                db.commit()
                raise SessionError("Session expired or access was revoked")
            return row[0]

    def logout(self, token):
        digest = self.digest(token)
        with closing(self.connect()) as db, db:
            db.execute("DELETE FROM session WHERE digest=?", (digest,))

    def revoke(self, owner):
        if not isinstance(owner, str) or not KEY.fullmatch(owner):
            raise SessionError("A full member public key is required")
        with closing(self.connect()) as db, db:
            for table in ("activation", "session"):
                db.execute(f"DELETE FROM {table} WHERE owner=?", (owner,))
