import test from 'node:test';
import assert from 'node:assert/strict';
import {FACTORY_CHANNEL, WORK_SYNC_PATH, createWorkSyncClient, createWorkSyncFeed, readWorkSyncSnapshot} from '../src/commercial/work-sync.mjs';
import {workSyncPanel} from '../src/commercial/work-sync-view.mjs';

const api = `https://work-sync.test${WORK_SYNC_PATH}`;
const owner = '1'.repeat(64), community = '2'.repeat(64), nonce = '3'.repeat(64);
const submissionUrl = `buzz://message?channel=${FACTORY_CHANNEL}&id=${'4'.repeat(64)}`;
const reviewUrl = `buzz://message?channel=${FACTORY_CHANNEL}&id=${'5'.repeat(64)}`;
const updatedAt = '2026-11-18T11:45:00Z';
const pending = {schema:1, channelId:FACTORY_CHANNEL, revision:1, updatedAt, items:[{
  taskId:'test-template', title:'草原 <模版>', version:'V8-23', status:'pending_review', submissionUrl, attachmentUrls:[], review:null
}]};
const reviewed = status => ({...pending, revision:2, items:[{...pending.items[0], status, review:{
  reviewerId:'6'.repeat(64), reviewedAt:updatedAt, reason:'核对 <第1版>', messageUrl:reviewUrl
}}]});

test('work sync signs the same URL, body and nonce the server verifies', async () => {
  let fingerprint, bindingPayload;
  const host = {async request(request) {
    const body = JSON.parse(request.body);
    if (request.url === `${api}/challenge`) {
      fingerprint = body.fingerprint;
      assert.match(fingerprint, /^[a-f0-9]{64}$/);
      return {status:200, body:JSON.stringify({nonce, community})};
    }
    if (request.url === `${api}/bind`) {
      bindingPayload = JSON.parse(body.event.content);
      assert.deepEqual(Object.keys(bindingPayload), ['version','purpose','audience','community','deviceKey','nonce','role']);
      assert.equal(bindingPayload.audience, api);
      return {status:200, body:JSON.stringify({device:fingerprint, owner, delegated:false})};
    }
    assert.equal(request.url, `${api}/snapshot`);
    assert.deepEqual(JSON.parse(body.body), {channelId:FACTORY_CHANNEL});
    assert.equal(body.proof.device, fingerprint);
    const key = await crypto.subtle.importKey('jwk', bindingPayload.deviceKey, {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
    const message = JSON.stringify(['opcb.work-sync.request.v1', request.url, body.body, body.proof.nonce, body.proof.timestamp]);
    assert(await crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, key, Buffer.from(body.proof.signature, 'base64url'), new TextEncoder().encode(message)));
    return {status:200, body:JSON.stringify(pending)};
  }};
  const client = createWorkSyncClient(host, api);
  const binding = await client.bind({owner, community}, async content => ({pubkey:owner, content}));
  assert.equal(binding.key.extractable, false);
  assert.deepEqual(await client.snapshot(binding), pending);
  assert.throws(() => createWorkSyncClient(host, `http://work-sync.test${WORK_SYNC_PATH}`));
});

test('work sync displays the matching review and rejects unusable channel links', () => {
  for (const [status, label] of [['accepted','已验收'], ['changes_requested','需修改']]) {
    const html = workSyncPanel({snapshot:readWorkSyncSnapshot(reviewed(status))});
    assert(html.includes(label));
    assert(html.includes('草原 &lt;模版&gt;'));
    assert(html.includes('核对 &lt;第1版&gt;'));
    assert(html.includes('查看验收'));
  }
  assert(workSyncPanel({snapshot:readWorkSyncSnapshot(pending)}).includes('待验收'));
  assert.throws(() => readWorkSyncSnapshot({...pending, items:[{...pending.items[0], submissionUrl:'https://example.com/'}]}));
  assert.throws(() => readWorkSyncSnapshot({...pending, channelId:'a different channel'}));
});

test('work sync restores cache without a request, retains it on 503, and drops it on 403', async () => {
  let row = {binding:{device:'mock'}, snapshot:pending}, calls = 0, response = 503;
  const storage = {get:async () => row, put:async (_key,value) => { row = value; }};
  const client = {async snapshot() { calls++; throw Object.assign(Error('fixture'), {status:response}); }};
  let restored;
  const ready = new Promise(resolve => { restored = resolve; });
  const feed = createWorkSyncFeed({client, storage, key:'mock', access:() => true, onState:state => {
    if (state.snapshot && !state.busy) restored();
  }});
  feed.roster(true);
  await ready;
  assert.equal(calls, 0);
  await feed.refresh();
  assert.equal(feed.status().snapshot.revision, 1);
  response = 403;
  await feed.refresh();
  assert.equal(feed.status().snapshot, undefined);
  assert.equal(row.snapshot, undefined);
  feed.dispose();
});

test('work sync ignores a response received after Buzz channel access is revoked', async () => {
  let respond, started;
  const requested = new Promise(resolve => { started = resolve; });
  const client = {snapshot() { return new Promise(resolve => { respond = resolve; started(); }); }};
  let row = {binding:{device:'mock'}};
  const storage = {get:async () => row, put:async (_key,value) => { row = value; }};
  const feed = createWorkSyncFeed({client, storage, key:'mock', access:() => true, onState:() => {}});
  feed.roster(true);
  await requested;
  feed.roster(false);
  respond(reviewed('accepted'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(feed.status().snapshot, undefined);
  assert.equal(row.snapshot, undefined);
  feed.dispose();
});
