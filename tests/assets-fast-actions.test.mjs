import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssetWorkspace} from '../src/shangliangshan-assets/native-workspace.mjs';
import {COMMUNITY} from '../src/media-workspace/role-binding.mjs';

const owner = '96ddfaedaca50c0248576563df8dff9f08ed8abd5ddead823b44635b181fb24d';
const other = '823091f2c74e48e8eda43eb4c3830af13ec2ab99afa8abf3f2635bddecf2316b';
const base = 'http://127.0.0.1:4400/' + 'a'.repeat(43) + '/';

function fixture() {
  globalThis.OPCB_ASSET_SESSION_SOURCE = '# mock bridge';
  let connection = {status: 'ready', scope: 'test', session: {relayAuthor: COMMUNITY, viewer: owner}};
  let remote = {
    assets: ['one', 'two', 'three'].map(id => ({id, title: id, revision: 1, versions: [{number: 1}]})),
    files: [], user: {id: 'pantao', role: 'admin'},
  };
  const requests = [];
  let releaseExit;
  let spawnCount = 0;
  const relay = {snapshot: () => connection};
  const service = createAssetWorkspace({relay, host: {async spawn(_name, {onStdout}) {
    spawnCount++;
    return {
      exited: new Promise(resolve => { releaseExit = resolve; }),
      kill: async () => releaseExit(),
      async write(raw) {
        const msg = JSON.parse(raw);
        if (typeof msg === 'string') {
          onStdout(JSON.stringify({ready: true, base}) + '\n');
          return;
        }
        const send = payload => onStdout(JSON.stringify({id: msg.id, ...payload}) + '\n');
        const snapshot = () => structuredClone({data: remote, media: {}});
        if (msg.action === 'login' || msg.action === 'state') {
          requests.push(msg);
          send({result: snapshot()});
          return;
        }
        if (msg.action !== 'lifecycle') throw Error('unexpected command');
        requests.push({...msg, respond({error, uncertain = false, apply = !error} = {}) {
          if (apply) {
            const ids = new Set(msg.args.items.map(item => item.id));
            remote = {...remote, assets: remote.assets.map(a => ids.has(a.id)
              ? {...a, trashed: true, trashedById: 'pantao', revision: a.revision + 1} : a)};
          }
          if (error) send({error, rejected: !uncertain});
          else send({result: {...snapshot(), mutation: {result: {count: msg.args.items.length}}}});
        }});
      },
    };
  }}});
  service.bind(connection);
  return {
    service, requests, spawnCount: () => spawnCount,
    switchViewer() {
      connection = {...connection, session: {...connection.session, viewer: other}};
      service.bind(connection);
    },
    active: () => service.snapshot().data?.assets.filter(a => !a.trashed).map(a => a.id),
  };
}

async function waitForWrite(f, count) {
  for (let i = 0; i < 10; i++) {
    const writes = f.requests.filter(r => r.action === 'lifecycle');
    if (writes.length >= count) return writes[count - 1];
    await new Promise(resolve => setImmediate(resolve));
  }
  throw Error('background deletion was not sent');
}

test('slow deletes hide only selected assets, queue separately and survive leaving the page', async () => {
  const f = fixture();
  const detach = f.service.attach();
  try {
    await f.service.connect();
    const first = f.service.lifecycle('trash', ['one']);
    assert.deepEqual(f.active(), ['two', 'three']);
    const second = f.service.lifecycle('trash', ['two']);
    assert.deepEqual(f.active(), ['three']);
    const write1 = await waitForWrite(f, 1);
    detach();
    const reopen = f.service.attach();
    try {
      assert.deepEqual(f.active(), ['three']);
      await f.service.connect();
      assert.equal(f.spawnCount(), 1);
      assert.deepEqual(f.active(), ['three']);
      write1.respond();
      await first;
      const write2 = await waitForWrite(f, 2);
      write2.respond({error: '权限已变化'});
      await assert.rejects(second, /权限已变化/);
      assert.deepEqual(f.active(), ['two', 'three']);
      assert.equal(f.service.snapshot().pendingTrash, 0);
    } finally { reopen(); }
  } finally { f.service.dispose(); }
});

test('after a lost reply the workspace checks the landed deletion without replaying it', async () => {
  const f = fixture();
  try {
    await f.service.connect();
    const pending = f.service.lifecycle('trash', ['one']);
    (await waitForWrite(f, 1)).respond({error: '连接超时', uncertain: true, apply: true});
    assert.deepEqual(await pending, {count: 1, items: [{id: 'one', revision: 2}]});
    assert.deepEqual(f.active(), ['two', 'three']);
    assert.deepEqual(f.requests.map(r => r.action), ['login', 'lifecycle', 'state']);
  } finally { f.service.dispose(); }
});

test('a late reply cannot restore data for a different identity', async () => {
  const f = fixture();
  try {
    await f.service.connect();
    const pending = f.service.lifecycle('trash', ['one']);
    const request = await waitForWrite(f, 1);
    f.switchViewer();
    request.respond();
    await assert.rejects(pending);
    assert.equal(f.service.snapshot().data, null);
    assert.equal(f.service.snapshot().pendingTrash, 0);
  } finally { f.service.dispose(); }
});
