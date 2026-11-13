import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateRegistry, loadDirectory, installSource, createDirectoryStore, REPOSITORY } from '../plugins/opcb.plugin-center/0.1.0/plugin.js';

const sha = 'a'.repeat(40);
const row = () => ({ id: 'opcb.example', version: '0.1.0', name: '测试工具', summary: '只用于测试', requirements: '需要本人授权', category: '工具', sourcePath: 'plugins/opcb.example/0.1.0', downloadPath: 'releases/example.zip' });
const registry = entries => ({ schema: 1, repository: REPOSITORY, entries });
const response = data => ({ status: 200, body: JSON.stringify(data) });
const requests = value => async options => options.url.endsWith('/commits/main') ? response({ sha }) : response({ encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') });

test('pins the content request and installation to the same observed head; preserves Chinese', async () => {
  const calls = [], request = requests(registry([row()]));
  const loaded = await loadDirectory(async options => { calls.push(options.url); return request(options); });
  assert(calls[1].endsWith(`?ref=${sha}`));
  assert.equal(loaded.entries[0].name, '测试工具');
  assert.deepEqual(installSource(loaded.entries[0], loaded.commit), { repository: `https://github.com/${REPOSITORY}.git`, reference: 'main', path: row().sourcePath, commit: sha });
});
test('rejects unsafe repository, path, malformed pins and duplicate versions', () => {
  for (const patch of [{ sourcePath: '../private' }, { downloadPath: 'https://bad.invalid/a.zip' }, { category: 'not-a-category' }, { reviewSource: { repository: 'someone/else', reference: 'main', commit: sha, path: '.' } }]) assert.throws(() => validateRegistry(registry([{ ...row(), ...patch }])));
  assert.throws(() => validateRegistry(registry([row(), row()])));
  assert.throws(() => validateRegistry({ ...registry([row()]), repository: 'someone/else' }));
});
test('load refuses HTTP errors, corrupt content and invalid heads', async () => {
  await assert.rejects(loadDirectory(async () => ({ status: 403, body: '{}' })), /限制/);
  await assert.rejects(loadDirectory(async () => response({ sha: 'main' })), /版本/);
  let n = 0;
  await assert.rejects(loadDirectory(async () => ++n === 1 ? response({ sha }) : response({ encoding: 'base64', content: 'not-base64' })), /损坏/);
});
test('failed refresh keeps last directory visible but blocks installation from stale state', async () => {
  let fail = false, reviews = 0;
  const store = createDirectoryStore(options => fail ? Promise.reject(new Error('offline')) : requests(registry([row()]))(options), { requestInstall() { reviews++; } });
  await store.refresh(); const entry = store.snapshot().entries[0];
  fail = true; await store.refresh();
  assert.equal(store.snapshot().entries[0], entry); assert.equal(store.snapshot().status, 'error');
  await store.review(entry); assert.equal(reviews, 0);
});
test('only an explicit review invokes host; serializes reviews and preserves cancellation', async () => {
  let finish, calls = 0, source;
  const installer = { requestInstall(value) { calls++; source = value; return new Promise(resolve => { finish = resolve; }); } };
  const store = createDirectoryStore(requests(registry([row()])), installer);
  await store.refresh(); assert.equal(calls, 0);
  const entry = store.snapshot().entries[0], waiting = store.review(entry);
  await store.review(entry); await store.refresh();
  assert.equal(calls, 1); assert.equal(source.commit, sha);
  finish('cancelled'); await waiting;
  assert.match(store.snapshot().notice, /未确认/); assert.equal(store.snapshot().busy, '');
});
test('missing capability and unavailable/rejected host outcomes do not report installed', async () => {
  for (const installer of [undefined, { requestInstall: async () => 'unavailable' }, { requestInstall: async () => { throw Error('moved'); } }]) {
    const store = createDirectoryStore(requests(registry([row()])), installer); await store.refresh(); await store.review(store.snapshot().entries[0]);
    assert.doesNotMatch(store.snapshot().notice, /已安装|已更新/); assert.equal(store.snapshot().busy, '');
  }
});
test('uses the exact independent distribution branch and commit', () => {
  const source = { repository: REPOSITORY, reference: 'distribution/example-0.1.0', path: '.', commit: sha };
  const [entry] = validateRegistry(registry([{ ...row(), reviewSource: source }]));
  assert.equal(installSource(entry, 'b'.repeat(40)).commit, sha);
  assert.equal(installSource(entry, sha).reference, source.reference);
});
test('disable during a pending load does not notify or restore ready state', async () => {
  let resolve, notifications = 0;
  const store = createDirectoryStore(() => new Promise(done => { resolve = done; }));
  store.subscribe(() => notifications++); const pending = store.refresh(); store.dispose();
  resolve(response({ sha })); await pending;
  assert.equal(notifications, 1); assert.equal(store.snapshot().status, 'loading');
});
test('published registry matches every source manifest and package; all install sources are independent', async () => {
  const file = JSON.parse(await readFile(new URL('../REGISTRY.json', import.meta.url), 'utf8'));
  const entries = validateRegistry(file);
  assert.equal(entries.length, 15);
  assert.equal(entries.filter(e => !e.legacy).length, 13);
  for (const entry of entries) {
    const manifest = JSON.parse(await readFile(new URL(`../${entry.sourcePath}/manifest.json`, import.meta.url), 'utf8'));
    assert.equal(entry.id, manifest.id); assert.equal(entry.name, manifest.name);
    assert(entry.reviewSource);
    assert((await readFile(new URL(`../${entry.downloadPath}`, import.meta.url))).length > 0);
  }
});
