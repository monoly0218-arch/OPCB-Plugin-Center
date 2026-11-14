"""Loopback gateway: native identity bindings, per-request proofs and live ACLs."""
import argparse
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import threading
import time

import knowledge
from group_catalog import GroupCatalog
from web_gateway import ReadOnlyStore, query
from identity_policy import LibraryPolicy, VerifiedIdentity, PermissionDenied, PolicyConflict, KEY


class IdentityBindings:
    def __init__(self, filename, community, verifier, node="node", now=time.time):
        self.filename, self.community, self.verifier, self.node, self.now = Path(filename), community, Path(verifier), node, now
        # Same private-file checks as the policy; no implicit public directory creation.
        parent = self.filename.parent.stat()
        if parent.st_uid != os.geteuid() or parent.st_mode & 0o077:
            raise PermissionDenied("Binding directory must be private")
        try:
            fd = os.open(self.filename, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        except FileExistsError:
            if self.filename.is_symlink() or not self.filename.is_file() or self.filename.stat().st_uid != os.geteuid() or self.filename.stat().st_mode & 0o077:
                raise PermissionDenied("Binding database must be private")
        else:
            os.close(fd)
        with closing(self.connect()) as db, db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS challenge(nonce TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,expires REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS device(id TEXT PRIMARY KEY,owner TEXT NOT NULL,actor TEXT NOT NULL,public_key TEXT NOT NULL,delegated INTEGER NOT NULL,proof TEXT NOT NULL,role TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS request_nonce(nonce TEXT PRIMARY KEY,at REAL NOT NULL);
            """)

    def connect(self):
        db = sqlite3.connect(self.filename, timeout=3)
        db.row_factory = sqlite3.Row
        return db

    def verify(self, value):
        encoded = json.dumps(value, ensure_ascii=False).encode()
        if len(encoded) > 32768:
            raise PermissionDenied("Identity proof too large")
        result = subprocess.run([self.node, str(self.verifier)], input=encoded, capture_output=True, timeout=5)
        if result.returncode or len(result.stdout) > 4096:
            raise PermissionDenied("Identity signature verification failed")
        return json.loads(result.stdout)

    def challenge(self, fingerprint):
        if not isinstance(fingerprint, str) or not KEY.fullmatch(fingerprint):
            raise ValueError("Invalid device fingerprint")
        nonce = secrets.token_hex(32)
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM challenge WHERE expires<=?", (self.now(),))
            if db.execute("SELECT count(*) FROM challenge").fetchone()[0] >= 256:
                raise ValueError("Too many pending identity bindings")
            db.execute("INSERT INTO challenge VALUES (?,?,?)", (nonce, fingerprint, self.now() + 90))
        return {"nonce": nonce, "community": self.community}

    def bind(self, event):
        checked = self.verify({"operation": "bind", "event": event, "community": self.community})
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            pending = db.execute("SELECT fingerprint,expires FROM challenge WHERE nonce=?", (checked["nonce"],)).fetchone()
            if not pending or pending["expires"] <= self.now() or pending["fingerprint"] != checked["device"]:
                raise PermissionDenied("Identity binding expired or mismatched")
            previous = db.execute("SELECT owner,delegated,role FROM device WHERE id=?", (checked["device"],)).fetchone()
            if previous and (previous["owner"] != checked["owner"] or previous["delegated"] != int(checked["delegated"]) or previous["role"] != checked["role"]):
                raise PermissionDenied("Device already has another identity binding")
            db.execute("DELETE FROM challenge WHERE nonce=?", (checked["nonce"],))
            db.execute("INSERT INTO device VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET proof=excluded.proof,revoked=0", (checked["device"], checked["owner"], checked["actor"], json.dumps(checked["deviceKey"]), int(checked["delegated"]), checked["proof_id"], checked["role"]))
        return {"device": checked["device"], "owner": checked["owner"], "delegated": checked["delegated"]}

    def authenticate(self, action, body, proof):
        device_id = proof.get("device") if isinstance(proof, dict) else None
        with closing(self.connect()) as db:
            device = db.execute("SELECT * FROM device WHERE id=? AND revoked=0", (device_id,)).fetchone()
        if not device:
            raise PermissionDenied("Device identity is not bound")
        if action == "policy" and device["role"] != "manage":
            raise PermissionDenied("Read-only device cannot administer libraries")
        checked = self.verify({"operation": "request", "action": action, "body": body, "proof": proof, "publicKey": json.loads(device["public_key"])})
        with closing(self.connect()) as db, db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM request_nonce WHERE at<?", (self.now() - 120,))
            try:
                db.execute("INSERT INTO request_nonce VALUES (?,?)", (checked["nonce"], self.now()))
            except sqlite3.IntegrityError:
                raise PermissionDenied("Request replay refused") from None
            if not db.execute("SELECT 1 FROM device WHERE id=? AND revoked=0", (device_id,)).fetchone():
                raise PermissionDenied("Device was revoked")
        return VerifiedIdentity(self.community, device["owner"], device["actor"], checked["request_id"])


def identity_handler(store, policy, bindings, organization=None):
    slots = threading.BoundedSemaphore(2)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def reply(self, status, value):
            body = json.dumps(value, ensure_ascii=False).encode()
            if len(body) > 4 * 1024 * 1024:
                status, body = 413, b'{"error":"Response too large"}'
            self.send_response(status)
            for name, value in {"Content-Type": "application/json; charset=utf-8", "Content-Length": str(len(body)), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}.items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            return self.reply(200 if self.path == "/health" else 404, {"service": "opcb-knowledge-identity", "ok": self.path == "/health"})

        def do_POST(self):
            action = self.path[1:]
            if action not in {"challenge", "bind", "read", "permissions", "policy"}:
                return self.reply(404, {"error": "Not found"})
            if not slots.acquire(blocking=False):
                return self.reply(503, {"error": "Busy"})
            try:
                length = int(self.headers.get("Content-Length", "-1"))
                if not 0 < length <= 32768:
                    return self.reply(413, {"error": "Request size invalid"})
                value = json.loads(self.rfile.read(length).decode())
                if not isinstance(value, dict):
                    raise ValueError()
                if action == "challenge":
                    if set(value) != {"fingerprint"}:
                        raise ValueError()
                    return self.reply(200, bindings.challenge(value["fingerprint"]))
                if action == "bind":
                    if set(value) != {"event"}:
                        raise ValueError()
                    return self.reply(200, bindings.bind(value["event"]))
                if set(value) != {"body", "proof"} or not isinstance(value["body"], str):
                    raise ValueError()
                principal = bindings.authenticate(action, value["body"], value["proof"])
                body = json.loads(value["body"])
                if not isinstance(body, dict):
                    raise ValueError()
                if action == "policy":
                    if body == {"op": "snapshot"}:
                        return self.reply(200, policy.snapshot(principal))
                    if set(body) != {"op", "expected_revision", "action", "payload"} or body["op"] != "change":
                        raise ValueError()
                    revision = policy.change(principal, body["expected_revision"], body["action"], body["payload"])
                    return self.reply(200, {"revision": revision})
                access = policy.read_access(principal)
                permitted = {s["id"] for s in access["sources"] if s["id"] in knowledge.SOURCES}
                revision = access["revision"]
                if action == "permissions":
                    if body:
                        raise ValueError()
                    if revision != policy.revision():
                        raise PermissionDenied("Permissions changed during read")
                    return self.reply(200, {"owner": principal.owner, "sources": sorted(permitted), "revision": revision, "can_administer": not principal.delegated and principal.owner in policy.administrators})
                if set(body) != {"request"}:
                    raise ValueError()
                group = GroupCatalog(store, organization)
                request = body["request"]
                if not isinstance(request, dict):
                    raise ValueError()
                result = group.browse(request, permitted) if request.get("op") == "browse" else query(store, request, permitted)
                if request.get("op") == "get":
                    result["note"] = group.enrich(result["note"], request.get("source", "recordings"))
                elif request.get("op") in {"list", "search"}:
                    result["results"] = [group.enrich(r, request.get("source", "recordings")) for r in result["results"]]
                if body["request"].get("op") == "catalog":
                    names = {lib["id"]: lib["name"] for lib in access["libraries"]}
                    mapping = {s["id"]: s["library"] for s in access["sources"]}
                    result["sources"] = [{**s, "library": mapping[s["source_id"]], "display_name": names[mapping[s["source_id"]]]} for s in result["sources"]]
                    result["libraries"] = access["libraries"]
                    result["revision"] = revision
                    result["organization"] = group.catalog(permitted)
                source = body["request"].get("source")
                # A read already in progress must not outlive a permission change.
                if revision != policy.revision() or (source and not policy.allowed(principal, source)):
                    raise PermissionDenied("Permissions changed during read")
                return self.reply(200, result)
            except PolicyConflict:
                return self.reply(409, {"error": "Permissions changed; refresh before saving"})
            except (PermissionDenied, knowledge.KnowledgeError):
                return self.reply(403, {"error": "Identity or library permission refused"})
            except (ValueError, TypeError, KeyError, UnicodeError):
                return self.reply(400, {"error": "Invalid request"})
            except Exception:
                return self.reply(503, {"error": "Knowledge service unavailable"})
            finally:
                slots.release()
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--policy-root", type=Path, required=True)
    parser.add_argument("--community", required=True)
    parser.add_argument("--admin", action="append", required=True)
    parser.add_argument("--verifier", type=Path, required=True)
    parser.add_argument("--node", default="node")
    parser.add_argument("--organization", type=Path, help="Private operator-confirmed classification sidecar")
    parser.add_argument("--port", type=int, default=3037)
    args = parser.parse_args()
    args.policy_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    policy = LibraryPolicy(args.policy_root / "policy.sqlite3", args.community, args.admin)
    policy.bootstrap_libraries()
    bindings = IdentityBindings(args.policy_root / "identities.sqlite3", args.community, args.verifier, args.node)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), identity_handler(ReadOnlyStore(args.root), policy, bindings, args.organization))
    server.daemon_threads = True
    server.serve_forever()


if __name__ == "__main__":
    main()
