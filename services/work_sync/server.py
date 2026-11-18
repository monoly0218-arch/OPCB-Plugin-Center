"""Read-only workbench snapshot for a single Buzz template delivery."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "knowledge"))
from identity_gateway import IdentityBindings, PermissionDenied

PREFIX = "/opcb-plugins/work-sync/api/v1"
CHANNEL = "778996be-f459-4188-bac9-6303a1355dda"
HEX = re.compile(r"[0-9a-f]{64}")
ACCEPTANCE = {"通过", "通过这一版", "验收通过"}
REVIEW = re.compile(r"(通过这一版|验收通过|通过|退回|需修改)(?:[：:]\s*(.+))?", re.S)
EDITOR_ROLES = {"owner", "admin", "member"}
READ_ROLES = EDITOR_ROLES | {"guest", "bot"}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def link(event_id):
    return f"buzz://message?channel={CHANNEL}&id={event_id}"


def values(event, name):
    return [tag[1] for tag in event["tags"] if len(tag) >= 2 and tag[0] == name]


def belongs(event):
    return event["kind"] == 9 and values(event, "h") == [CHANNEL] and HEX.fullmatch(event["id"])


def reviews_submission(event, submission):
    return any(
        len(tag) >= 4 and tag[0] == "e" and tag[1] == submission and tag[3] == "reply"
        for tag in event["tags"]
    )


def attachment(event, relay):
    # Use the native attachment descriptor, including the signed content hash.
    descriptors = [tag for tag in event["tags"] if tag[0] == "imeta"]
    if len(descriptors) != 1:
        return None
    urls = [part[4:] for part in descriptors[0][1:] if part.startswith("url ")]
    digests = [part[2:] for part in descriptors[0][1:] if part.startswith("x ")]
    if len(urls) != 1 or len(digests) != 1 or not HEX.fullmatch(digests[0]):
        return None
    url = urlsplit(urls[0])
    if (url.scheme != "https" or url.netloc != urlsplit(relay).netloc
            or not re.fullmatch(r"/media/" + digests[0] + r"(?:\.[a-zA-Z0-9]+)?", url.path)
            or url.query or url.fragment):
        return None
    return urls[0]


class Buzz:
    def __init__(self, relay, executable="buzz", node="node"):
        self.relay = relay
        self.executable = executable
        self.node = node

    def read(self, *args):
        result = subprocess.run(
            [self.executable, "--format", "json", *args, "--relay", self.relay],
            capture_output=True, check=True, timeout=8,
        )
        value = json.loads(result.stdout)
        if not isinstance(value, list):
            raise ValueError("Buzz read returned an invalid list")
        return value

    def members(self):
        records = self.read("channels", "members", "--channel", CHANNEL)
        return {row["pubkey"]: row["role"] for row in records}

    def thread(self, event):
        events = self.read("messages", "thread", "--channel", CHANNEL,
                           "--event", event, "--limit", "100", "--depth-limit", "4")
        result = subprocess.run(
            [self.node, str(HERE / "auth.mjs")],
            input=json.dumps({"operation": "verify_events", "events": events}).encode(),
            capture_output=True, check=True, timeout=5,
        )
        verified = set(json.loads(result.stdout))
        return [item for item in events if item["id"] in verified]


class TemplatePilot:
    def __init__(self, buzz, bindings, owner, reviewer, agent, request, task_id, submission, title):
        self.buzz = buzz
        self.bindings = bindings
        self.owner, self.reviewer, self.agent = owner, reviewer, agent
        self.request = request
        self.task_id, self.submission, self.title = task_id, submission, title
        self.ready = False
        self.sync_lock = threading.Lock()
        with closing(self.bindings.connect()) as db, db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS work_snapshot(
                    channel TEXT PRIMARY KEY,
                    revision INTEGER NOT NULL,
                    updated_at TEXT NOT NULL,
                    items TEXT NOT NULL
                )
            """)

    def current_item(self, events, members):
        scoped = [event for event in events if belongs(event)]
        delivery = next((event for event in scoped if event["id"] == self.submission), None)
        url = attachment(delivery, self.buzz.relay) if delivery is not None else None
        if not url:
            raise ValueError("The configured delivery must contain one Buzz attachment")
        author = delivery["pubkey"]
        if members.get(author) not in EDITOR_ROLES | {"bot"}:
            raise PermissionDenied("Submitter cannot write to the channel")
        if author != self.owner:
            requests = values(delivery, "buzz:request")
            owner_request = next((event for event in scoped if [event["id"]] == requests), None)
            if (author != self.agent or requests != [self.request]
                    or owner_request is None or owner_request["pubkey"] != self.owner
                    or not reviews_submission(delivery, owner_request["id"])
                    or owner_request["created_at"] > delivery["created_at"]):
                raise PermissionDenied("Missing owner-signed submission request")
        item = {
            "taskId": self.task_id, "version": delivery["id"], "status": "pending_review",
            "title": self.title, "submissionUrl": link(delivery["id"]),
            "attachmentUrls": [url], "review": None,
        }
        # Only the assigned human's reply can change this delivery's review state.
        if members.get(self.reviewer) not in EDITOR_ROLES:
            return item
        for event in sorted(scoped, key=lambda row: (row["created_at"], row["id"]), reverse=True):
            if (event["pubkey"] != self.reviewer or event["created_at"] < delivery["created_at"]
                    or values(event, "auth")):
                continue
            command = event["content"].strip()
            source_link = link(delivery["id"])
            if command.endswith(" " + source_link):
                command = command.removesuffix(" " + source_link).strip()
            elif not reviews_submission(event, delivery["id"]):
                continue
            match = REVIEW.fullmatch(command.removesuffix("。"))
            if not match:
                continue
            decision, reason = match.groups()
            if decision in {"退回", "需修改"} and not (reason and reason.strip()):
                continue
            item["status"] = "accepted" if decision in ACCEPTANCE else "changes_requested"
            item["review"] = {
                "reviewerId": self.reviewer,
                "reviewedAt": datetime.fromtimestamp(event["created_at"], timezone.utc).isoformat(),
                "reason": (reason or "").strip()[:1000],
                "messageUrl": link(event["id"]),
            }
            break
        return item

    def sync(self):
        with self.sync_lock:
            try:
                members = self.buzz.members()
                items = [self.current_item(self.buzz.thread(self.submission), members)] if self.submission else []
                body = json.dumps(items, ensure_ascii=False, sort_keys=True)
                with closing(self.bindings.connect()) as db, db:
                    db.execute("BEGIN IMMEDIATE")
                    db.execute("""
                        INSERT INTO work_snapshot VALUES (?, 1, ?, ?)
                        ON CONFLICT(channel) DO UPDATE SET revision = revision + 1,
                            updated_at = excluded.updated_at, items = excluded.items
                        WHERE work_snapshot.items <> excluded.items
                    """, (CHANNEL, now_iso(), body))
                self.ready = True
            except (ValueError, PermissionDenied, subprocess.SubprocessError, OSError, KeyError, TypeError):
                self.ready = False

    def allowed(self, owner):
        return self.buzz.members().get(owner) in READ_ROLES

    def snapshot(self, owner):
        if not self.allowed(owner):
            raise PermissionDenied("Channel permission required")
        if not self.ready:
            raise OSError("Buzz source is unavailable")
        with closing(self.bindings.connect()) as db:
            row = db.execute("SELECT * FROM work_snapshot WHERE channel=?", (CHANNEL,)).fetchone()
        if not row:
            raise OSError("Buzz source is unavailable")
        return {"schema": 1, "channelId": CHANNEL, "revision": row["revision"],
                "updatedAt": row["updated_at"], "items": json.loads(row["items"])}


def handler(pilot):
    slots = threading.BoundedSemaphore(4)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def reply(self, status, value):
            payload = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)

        def error(self, status, code, message):
            return self.reply(status, {"error": {"code": code, "message": message}})

        def do_GET(self):
            if self.path == PREFIX + "/health":
                return self.reply(200 if pilot.ready else 503, {"ready": pilot.ready})
            return self.error(404, "not_found", "Unknown endpoint")

        def do_POST(self):
            paths = {PREFIX + "/" + name: name for name in ("challenge", "bind", "snapshot")}
            action = paths.get(self.path)
            if not action:
                return self.error(404, "not_found", "Unknown endpoint")
            if not slots.acquire(blocking=False):
                return self.error(503, "source_unavailable", "Work sync is busy")
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 32768:
                    raise ValueError()
                value = json.loads(self.rfile.read(length))
                if not isinstance(value, dict):
                    raise ValueError()
                if action == "challenge" and set(value) == {"fingerprint"}:
                    return self.reply(200, pilot.bindings.challenge(value["fingerprint"]))
                if action == "bind" and set(value) == {"event"} and isinstance(value["event"], dict):
                    try:
                        # Verify before treating any pubkey as an identity.
                        checked = pilot.bindings.verify({
                            "operation": "bind", "event": value["event"], "community": pilot.bindings.community,
                        })
                        if not pilot.allowed(checked["owner"]):
                            return self.error(403, "forbidden", "Channel permission required")
                        return self.reply(200, pilot.bindings.bind(value["event"]))
                    except PermissionDenied:
                        return self.error(401, "invalid_proof", "Buzz identity binding is invalid or expired")
                if action == "snapshot" and set(value) == {"body", "proof"} and isinstance(value["body"], str):
                    if json.loads(value["body"]) != {"channelId": CHANNEL}:
                        raise ValueError()
                    try:
                        principal = pilot.bindings.authenticate(action, value["body"], value["proof"])
                    except PermissionDenied:
                        return self.error(401, "invalid_proof", "Device proof is invalid or expired")
                    return self.reply(200, pilot.snapshot(principal.owner))
                raise ValueError()
            except PermissionDenied:
                return self.error(403, "forbidden", "Channel permission required")
            except (ValueError, UnicodeError, TypeError):
                return self.error(400, "invalid_request", "Invalid request")
            except (subprocess.SubprocessError, OSError, KeyError):
                return self.error(503, "source_unavailable", "Buzz source is unavailable")
            finally:
                slots.release()

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, required=True, help="Existing private state directory")
    parser.add_argument("--community", required=True, help="Buzz relay author pubkey")
    parser.add_argument("--relay", required=True, help="Buzz relay URL")
    parser.add_argument("--audience", required=True, help="Public HTTPS API base")
    parser.add_argument("--owner", required=True)
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--forwarding-agent")
    parser.add_argument("--forwarding-request", help="Exact owner-signed request authorizing the forward")
    parser.add_argument("--submission-id")
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--buzz", default="buzz")
    parser.add_argument("--node", default="node")
    parser.add_argument("--port", type=int, default=3039)
    args = parser.parse_args()
    ids = [args.community, args.owner, args.reviewer, args.forwarding_agent, args.forwarding_request, args.submission_id]
    if any(value is not None and not HEX.fullmatch(value) for value in ids) or args.owner == args.reviewer:
        parser.error("Supply exact Buzz pubkeys and an exact submission event ID")
    if bool(args.forwarding_agent) != bool(args.forwarding_request):
        parser.error("A forwarding agent requires an exact owner request")
    audience = urlsplit(args.audience)
    if (audience.scheme != "https" or not audience.netloc or audience.path != PREFIX or
            audience.username or audience.password or audience.query or audience.fragment):
        parser.error("Audience must be the complete HTTPS API base")
    os.environ["OPCB_WORK_SYNC_AUDIENCE"] = args.audience
    bindings = IdentityBindings(args.state / "work-sync.sqlite3", args.community, HERE / "auth.mjs", args.node)
    pilot = TemplatePilot(Buzz(args.relay, args.buzz, args.node), bindings, args.owner, args.reviewer,
                          args.forwarding_agent, args.forwarding_request, args.task_id, args.submission_id, args.title)
    stop = threading.Event()

    def sync_loop():
        while not stop.is_set():
            pilot.sync()
            stop.wait(15)

    with ThreadingHTTPServer(("127.0.0.1", args.port), handler(pilot)) as server:
        worker = threading.Thread(target=sync_loop, daemon=True)
        worker.start()
        try:
            server.serve_forever()
        finally:
            stop.set()


if __name__ == "__main__":
    main()
