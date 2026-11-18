"""Read-only workbench snapshots for Buzz template deliveries."""
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
THUMBS_UP = re.compile(r"👍\ufe0f?[🏻-🏿]?")
TASK_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
EDITOR_ROLES = {"owner", "admin", "member"}
READ_ROLES = EDITOR_ROLES | {"guest", "bot"}
WORKBENCH_ITEM_LIMIT = 100


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def link(event_id):
    return f"buzz://message?channel={CHANNEL}&id={event_id}"


def values(event, name):
    return [tag[1] for tag in event["tags"] if len(tag) >= 2 and tag[0] == name]


def belongs(event):
    return event["kind"] == 9 and values(event, "h") == [CHANNEL] and HEX.fullmatch(event["id"])


def field(content, name):
    prefix = name + ":"
    matches = [line[len(prefix):].strip() for line in content.splitlines() if line.startswith(prefix)]
    return matches[0] if len(matches) == 1 else ""


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

    def read(self, *args, shape=list):
        result = subprocess.run(
            [self.executable, "--format", "json", *args, "--relay", self.relay],
            capture_output=True, check=True, timeout=8,
        )
        value = json.loads(result.stdout)
        if not isinstance(value, shape):
            raise ValueError("Buzz read returned an unexpected JSON shape")
        return value

    def members(self):
        records = self.read("channels", "members", "--channel", CHANNEL)
        return {row["pubkey"]: row["role"] for row in records}

    def verified(self, events):
        result = subprocess.run(
            [self.node, str(HERE / "auth.mjs")],
            input=json.dumps({"operation": "verify_events", "events": events}).encode(),
            capture_output=True, check=True, timeout=5,
        )
        verified = set(json.loads(result.stdout))
        return [item for item in events if item["id"] in verified]

    def thread(self, event):
        return self.verified(self.read("messages", "thread", "--channel", CHANNEL,
                                       "--event", event, "--limit", "100", "--depth-limit", "4"))

    def deliveries(self, since, authors):
        before = None
        seen = set()
        while True:
            pagination = ["--before", str(before)] if before is not None else []
            rows = self.read("messages", "get", "--channel", CHANNEL, "--kinds", "9",
                             "--since", str(since - 1), "--limit", "100", *pagination)
            candidates = []
            for row in rows:
                if row["id"] in seen:
                    continue
                seen.add(row["id"])
                if (belongs(row) and row["created_at"] >= since and row["pubkey"] in authors
                        and field(row["content"], "work-sync-task")):
                    candidates.append(row)
            if candidates:
                yield from self.verified(candidates)
            if len(rows) < 100:
                break
            overlap = min(row["created_at"] for row in rows) + 1
            if before is not None and overlap >= before:
                raise ValueError("Buzz delivery page is full at a single timestamp")
            before = overlap

    def thumbs_up(self, submission, reviewer, submitted_at):
        # Buzz's reaction list is the live view, including removed reactions.
        totals = self.read("reactions", "get", "--event", submission, shape=dict)
        active = {row["emoji"] for row in totals["reactions"]
                  if THUMBS_UP.fullmatch(row["emoji"]) and reviewer in row["pubkeys"]}
        if not active:
            return None

        # Use the signed event for identity, target and time. Buzz can infer
        # the channel of reactions without an explicit h tag from the target.
        rows = self.read("messages", "get", "--channel", CHANNEL, "--kinds", "7",
                         "--since", str(max(0, submitted_at - 1)), "--limit", "100")
        candidates = []
        for event in rows:
            if (event["kind"] != 7 or event["pubkey"] != reviewer or event["content"] not in active
                    or event["created_at"] < submitted_at or values(event, "auth")
                    or values(event, "h") not in ([], [CHANNEL])):
                continue
            targets = [ref.lower() for ref in values(event, "e") if HEX.fullmatch(ref.lower())]
            if targets and targets[-1] == submission:
                candidates.append(event)
        verified = self.verified(candidates)
        if not verified:
            raise ValueError("Active thumbs-up could not be matched to a signed event")
        return min(verified, key=lambda event: (event["created_at"], event["id"]))


class TemplatePilot:
    def __init__(self, buzz, bindings, owner, reviewer, agent, request, task_id, submission, title, discover_since=None):
        self.buzz = buzz
        self.bindings = bindings
        self.owner, self.reviewer, self.agent = owner, reviewer, agent
        self.request = request
        self.task_id, self.submission, self.title = task_id, submission, title
        self.discover_since = discover_since
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

    def authorized_delivery(self, delivery, scoped, members, task_id, pinned):
        author = delivery["pubkey"]
        if members.get(author) not in EDITOR_ROLES | {"bot"}:
            return False
        if author == self.owner:
            return not values(delivery, "auth")
        requests = values(delivery, "buzz:request")
        if author != self.agent or len(requests) != 1 or not reviews_submission(delivery, requests[0]):
            return False
        owner_request = next((event for event in scoped if event["id"] == requests[0]), None)
        return bool(owner_request and owner_request["pubkey"] == self.owner
                    and not values(owner_request, "auth") and owner_request["created_at"] <= delivery["created_at"]
                    and (requests == [self.request] or
                         (not pinned and field(owner_request["content"], "work-sync-task") == task_id)))

    def current_item(self, delivery, scoped, members, task_id, title, url):
        item = {
            "taskId": task_id, "version": delivery["id"], "status": "pending_review",
            "title": title, "submissionUrl": link(delivery["id"]),
            "attachmentUrls": [url], "review": None,
        }
        # Review decisions are scoped to the assigned human and exact delivery.
        if members.get(self.reviewer) not in EDITOR_ROLES:
            return item
        reaction = self.buzz.thumbs_up(delivery["id"], self.reviewer, delivery["created_at"])
        review = (reaction, "accepted", "", delivery["id"]) if reaction else None
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
            if not reaction or event["created_at"] >= reaction["created_at"]:
                status = "accepted" if decision in ACCEPTANCE else "changes_requested"
                review = (event, status, (reason or "").strip()[:1000], event["id"])
            break
        if review:
            event, item["status"], reason, source = review
            item["review"] = {
                "reviewerId": self.reviewer,
                "reviewedAt": datetime.fromtimestamp(event["created_at"], timezone.utc).isoformat(),
                "reason": reason,
                "messageUrl": link(source),
            }
        return item

    def current_items(self, members):
        candidates = [(self.submission, self.task_id, self.title, True)] if self.submission else []
        if self.discover_since is not None:
            events = sorted(self.buzz.deliveries(self.discover_since, {self.owner, self.agent}),
                            key=lambda row: (row["created_at"], row["id"]))
            for event in events:
                task_id = field(event["content"], "work-sync-task")
                title = field(event["content"], "work-sync-title")
                if (event["id"] != self.submission and TASK_ID.fullmatch(task_id)
                        and 0 < len(title) <= 120 and attachment(event, self.buzz.relay)):
                    candidates.append((event["id"], task_id, title, False))
        items = []
        seen = set()
        for event_id, task_id, title, pinned in candidates:
            scoped = [event for event in self.buzz.thread(event_id) if belongs(event)]
            delivery = next((event for event in scoped if event["id"] == event_id), None)
            url = attachment(delivery, self.buzz.relay) if delivery else None
            if not url or not self.authorized_delivery(delivery, scoped, members, task_id, pinned):
                if pinned:
                    raise PermissionDenied("Configured delivery is missing or unauthorized")
                continue
            # A repost of the same bytes keeps the original review target.
            digest = urlsplit(url).path.removeprefix("/media/").split(".")[0]
            key = (task_id, digest)
            if key in seen:
                continue
            seen.add(key)
            items.append(self.current_item(delivery, scoped, members, task_id, title, url))
        if self.submission and len(items) > WORKBENCH_ITEM_LIMIT:
            return items[:1] + items[-(WORKBENCH_ITEM_LIMIT - 1):]
        return items[-WORKBENCH_ITEM_LIMIT:]

    def sync(self):
        with self.sync_lock:
            try:
                members = self.buzz.members()
                items = self.current_items(members)
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
    parser.add_argument("--discover-since", type=int, help="Discover structured channel receipts from this Unix second")
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
    if args.discover_since is not None and args.discover_since < 1:
        parser.error("Discovery start must be a positive Unix second")
    audience = urlsplit(args.audience)
    if (audience.scheme != "https" or not audience.netloc or audience.path != PREFIX or
            audience.username or audience.password or audience.query or audience.fragment):
        parser.error("Audience must be the complete HTTPS API base")
    os.environ["OPCB_WORK_SYNC_AUDIENCE"] = args.audience
    bindings = IdentityBindings(args.state / "work-sync.sqlite3", args.community, HERE / "auth.mjs", args.node)
    pilot = TemplatePilot(Buzz(args.relay, args.buzz, args.node), bindings, args.owner, args.reviewer,
                          args.forwarding_agent, args.forwarding_request, args.task_id, args.submission_id, args.title,
                          args.discover_since)
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
