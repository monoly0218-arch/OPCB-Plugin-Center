import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { fingerprint, publicKey } from "../services/knowledge/identity_auth.mjs";

const prefix = "/opcb-plugins/work-sync/api/v1";
const audience = "https://example.test" + prefix;
const channelId = "778996be-f459-4188-bac9-6303a1355dda";
const community = "2".repeat(64);
const unix = () => Math.floor(Date.now() / 1000);
const nonce = () => Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString("hex");
const exec = promisify(execFile);

function note(key, content, tags) {
  return finalizeEvent({ kind: 9, created_at: unix() - 100, tags: [["h", channelId], ...tags], content }, key);
}

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test("signed devices share one exact review and lose access when removed", { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "work-sync-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const [owner, reviewer, stranger, agent] = Array.from({ length: 4 }, generateSecretKey);
  const descriptor = [
    "imeta", "url https://relay.example.test/media/" + "a".repeat(64) + ".mp4", "x " + "a".repeat(64),
  ];
  const request = note(owner, "发出这一版供验收", []);
  const submission = note(agent, "第一条模板", [
    descriptor, ["buzz:request", request.id], ["e", request.id, "", "reply"],
  ]);
  const same = ["e", submission.id, "", "reply"];
  const wrong = ["e", "b".repeat(64), "", "reply"];
  const wrongActor = note(owner, "通过这一版", [same]);
  const wrongVersion = note(reviewer, "通过这一版", [wrong]);
  const flatUnscoped = note(reviewer, "通过", [["e", request.id, "", "reply"]]);
  const review = note(reviewer, "通过", [same]);
  const feed = join(directory, "feed.json");
  const members = [
    { pubkey: getPublicKey(owner), role: "owner" },
    { pubkey: getPublicKey(reviewer), role: "member" },
    { pubkey: getPublicKey(agent), role: "bot" },
  ];
  async function writeFeed(events, roster = members) {
    const next = feed + ".next";
    await writeFile(next, JSON.stringify({ events, roster }));
    await rename(next, feed);
  }
  await writeFeed([request, submission, { ...review, sig: "0".repeat(128) }, wrongActor, wrongVersion, flatUnscoped]);
  const fakeBuzz = join(directory, "buzz");
  await writeFile(fakeBuzz, "#!/usr/bin/env python3\nimport json,os,sys\nwith open(os.environ['WORK_SYNC_TEST_FEED']) as f:\n d=json.load(f)\n print(json.dumps({'reactions':[]} if 'reactions' in sys.argv else d['roster'] if 'members' in sys.argv else d['events']))\n");
  await chmod(fakeBuzz, 0o700);
  const port = await freePort();
  const server = spawn("python3", [
    "services/work_sync/server.py", "--state", directory, "--community", community,
    "--relay", "https://relay.example.test", "--audience", audience,
    "--owner", getPublicKey(owner), "--reviewer", getPublicKey(reviewer), "--task-id", "test-task",
    "--forwarding-agent", getPublicKey(agent), "--forwarding-request", request.id,
    "--submission-id", submission.id, "--title", "第一条模板", "--buzz", fakeBuzz, "--port", String(port),
  ], { env: { ...process.env, WORK_SYNC_TEST_FEED: feed }, stdio: ["ignore", "ignore", "inherit"] });
  const exited = once(server, "exit");
  t.after(async () => { server.kill(); await exited; });
  const base = "http://127.0.0.1:" + port + prefix;
  async function post(path, body) {
    const response = await fetch(base + path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    return { status: response.status, value: await response.json() };
  }
  let ready = false;
  for (let i = 0; i < 25 && !ready; i++) {
    ready = await fetch(base + "/health").then(response => response.ok, () => false);
    if (!ready) await delay(200);
  }
  assert.ok(ready);

  async function device(key) {
    const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const deviceKey = publicKey(await webcrypto.subtle.exportKey("jwk", keys.publicKey));
    const device = fingerprint(deviceKey);
    const { value: challenge } = await post("/challenge", { fingerprint: device });
    assert.equal(challenge.community, community);
    const event = finalizeEvent({
      kind: 45010, tags: [["h", "private-solo"]], created_at: unix(),
      content: JSON.stringify({ version: 1, purpose: "opcb.work-sync.device-binding", audience, community,
        role: "read", deviceKey, nonce: challenge.nonce }),
    }, key);
    const result = await post("/bind", { event });
    async function sign() {
      const body = JSON.stringify({ channelId });
      const timestamp = unix();
      const requestNonce = nonce();
      const material = JSON.stringify(["opcb.work-sync.request.v1", audience + "/snapshot", body, requestNonce, timestamp]);
      const signature = Buffer.from(await webcrypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" }, keys.privateKey, Buffer.from(material),
      )).toString("base64url");
      return { body, proof: { device, nonce: requestNonce, timestamp, signature } };
    }
    return { result, sign };
  }
  const air = await device(owner);
  const studio = await device(owner);
  assert.equal(air.result.status, 200);
  assert.equal(studio.result.status, 200);
  assert.equal((await device(stranger)).result.status, 403);
  const firstProof = await air.sign();
  const initial = await post("/snapshot", firstProof);
  assert.equal(initial.status, 200);
  assert.equal(initial.value.items[0].status, "pending_review");
  assert.deepEqual(await post("/snapshot", await studio.sign()), initial);
  assert.equal((await post("/snapshot", firstProof)).status, 401);

  await writeFeed([request, submission, wrongActor, wrongVersion, review]);
  let accepted;
  for (let i = 0; i < 34 && !accepted; i++) {
    const result = await post("/snapshot", await air.sign());
    if (result.value.items?.[0].status === "accepted") accepted = result;
    else await delay(500);
  }
  assert.ok(accepted);
  assert.equal(accepted.value.revision, initial.value.revision + 1);
  assert.equal(accepted.value.items[0].review.reviewerId, getPublicKey(reviewer));
  assert.equal(accepted.value.items[0].version, submission.id);
  assert.deepEqual(await post("/snapshot", await studio.sign()), accepted);
  await writeFeed([request, submission, review], members.filter(row => row.role !== "owner"));
  assert.equal((await post("/snapshot", await air.sign())).status, 403);
});

test("the exact native thumbs-up is idempotent and withdrawal returns to pending", { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "work-sync-reactions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const [owner, reviewer] = Array.from({ length: 2 }, generateSecretKey);
  const ownerId = getPublicKey(owner), reviewerId = getPublicKey(reviewer);
  const descriptor = ["imeta", "url https://relay.example.test/media/" + "a".repeat(64) + ".mp4", "x " + "a".repeat(64)];
  const delivery = note(owner, "第一条模板", [descriptor]);
  function reaction(key, target, time) {
    return finalizeEvent({ kind: 7, content: "👍", created_at: time, tags: [["e", target], ["p", ownerId]] }, key);
  }
  const thumb = reaction(reviewer, delivery.id, unix() - 30);
  const duplicate = reaction(reviewer, delivery.id, unix() - 20);
  const other = reaction(owner, delivery.id, unix() - 10);
  const wrongVersion = reaction(reviewer, "b".repeat(64), unix() - 10);
  const fixture = join(directory, "fixture.json");
  const feed = join(directory, "feed.json");
  await writeFile(fixture, JSON.stringify({ ownerId, reviewerId, community, delivery, thumb, duplicate, other, wrongVersion }));
  const fakeBuzz = join(directory, "buzz");
  await writeFile(fakeBuzz, `#!/usr/bin/env python3
import json,os,sys
with open(os.environ['WORK_SYNC_TEST_FEED']) as file:
    feed = json.load(file)
    key = 'roster' if 'members' in sys.argv else 'reactions' if 'reactions' in sys.argv else 'rows' if '--kinds' in sys.argv else 'thread'
    print(json.dumps(feed[key]))
`);
  await chmod(fakeBuzz, 0o700);
  const check = `
import json, sys
from pathlib import Path
sys.path.insert(0, 'services/work_sync')
from server import Buzz, TemplatePilot, HERE, IdentityBindings
folder = Path(sys.argv[1]); f = json.loads((folder / 'fixture.json').read_text())
owner, reviewer = f['ownerId'], f['reviewerId']
buzz = Buzz('https://relay.example.test', str(folder / 'buzz'))
pilot = TemplatePilot(buzz, IdentityBindings(folder / 'state.sqlite3', f['community'], HERE / 'auth.mjs'), owner, reviewer, None, None, 'test-task', f['delivery']['id'], '第一条模板')
def pulse(actors, rows):
    record = {'roster': [{'pubkey': owner, 'role': 'owner'}, {'pubkey': reviewer, 'role': 'member'}], 'reactions': {'reactions': [{'emoji': '👍', 'pubkeys': actors}]}, 'thread': [f['delivery']], 'rows': rows}
    (folder / 'feed.json').write_text(json.dumps(record))
    pilot.sync()
    value = pilot.snapshot(owner)
    return value['revision'], value['items'][0]
before, pending = pulse([owner], [f['other'], f['wrongVersion']])
assert pending['status'] == 'pending_review'
accepted, item = pulse([owner, reviewer], [f['other'], f['thumb'], f['wrongVersion']])
assert accepted == before + 1 and item['status'] == 'accepted'
assert item['review']['reviewerId'] == reviewer and item['review']['messageUrl'] == item['submissionUrl']
assert pulse([reviewer], [f['duplicate'], f['thumb'], f['thumb']]) == (accepted, item)
# Keep old signed rows in the fixture to check the authoritative active list.
after, withdrawn = pulse([owner], [f['thumb'], f['other']])
assert after == accepted + 1 and withdrawn['status'] == 'pending_review' and withdrawn['review'] is None
`;
  await exec("python3", ["-c", check, directory], { env: { ...process.env, WORK_SYNC_TEST_FEED: feed } });
});
