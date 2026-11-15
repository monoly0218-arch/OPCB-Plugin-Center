import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {canonicalRepository, validateBaseline, planPluginSync} from '../src/plugin-center/sync-plan.mjs';

const baseline = JSON.parse(await readFile(new URL('../BASELINE.json', import.meta.url)));
const options = {platform: 'macos', hostVersion: '1.0.2'};
const clone = value => structuredClone(value);
const installed = () => ({plugins: baseline.targets.map(row => ({id: row.id, enabled: row.enabled,
  bundled: false, revision: row.revision, source: {kind: 'git', ...row.reviewSource}}))});
const plan = (value, opts = options) => planPluginSync(baseline, value, opts);

test('a fresh device gets one exact request per plugin, including the center; no duplicate pool variants', () => {
  const result = plan({plugins: []});
  assert.equal(result.counts.install, 17);
  assert.equal(new Set(result.targets.map(row => row.id)).size, 17);
  assert.equal(result.targets.filter(row => row.id === 'opcb.higgsfield-mailbox').length, 1);
  assert.equal(result.targets.find(row => row.id === 'opcb.plugin-center').state, 'install');
  for (const row of result.targets) {
    const target = baseline.targets.find(target => target.id === row.id);
    assert.deepEqual(row.request, {action: 'install', id: row.id, ...target.reviewSource,
      reason: `对齐 OPCB 整套基线 ${baseline.id}：${target.name} ${target.version}`});
  }
});

test('an already aligned device is idempotent and does not pretend to verify runtime or business access', () => {
  const value = installed(), before = clone(value);
  const result = plan(value);
  assert.equal(result.counts.aligned, 17);
  assert.equal(result.versionsAligned, true);
  assert.equal(result.runtimeVerified, false);
  assert.equal(result.businessAccessVerified, false);
  assert.equal(result.targets.some(row => row.request), false);
  assert.deepEqual(value, before);
});

test('same repository variants normalize; lookalike hosts and paths cannot become same-source updates', () => {
  for (const repo of [baseline.repository, `https://github.com/${baseline.repository}`,
    `https://github.com/${baseline.repository}.git`, `git@github.com:${baseline.repository}.git`,
    `ssh://git@github.com/${baseline.repository}.git`]) {
    const value = installed(); value.plugins[0].source.repository = repo;
    assert.equal(plan(value).targets[0].state, 'aligned');
  }
  for (const repo of ['https://github.com.evil.test/' + baseline.repository,
    'https://github.com/' + baseline.repository + '/other', 'https://github.com/other/OPCB-Plugin-Center.git']) {
    assert.equal(canonicalRepository(repo), null);
    const value = installed(); value.plugins[0].source.repository = repo;
    assert.equal(plan(value).targets[0].state, 'blocked');
  }
});

test('matching ID, matching commit, or matching revision alone never proves alignment', () => {
  for (const change of [row => {row.revision = 'f'.repeat(64);},
    row => {row.source.commit = 'f'.repeat(40);}, row => {row.source.reference = 'distribution/another';}]) {
    const value = installed(); change(value.plugins[0]);
    const result = plan(value).targets[0];
    assert.equal(result.state, 'update');
    assert.equal(result.request.commit, baseline.targets[0].reviewSource.commit);
    assert.equal(result.request.repository, undefined);
    assert.equal(result.request.path, undefined);
  }
});

test('disabled plugins need a reviewed enable; an update requires a fresh read before enable', () => {
  const value = installed(); value.plugins[0].enabled = false;
  assert.equal(plan(value).targets[0].request.action, 'enable');
  value.plugins[0].revision = 'f'.repeat(64);
  const result = plan(value).targets[0];
  assert.equal(result.request.action, 'update');
  assert.equal(result.enableAfterReview, true);
});

test('a mixed device resumes after approved updates while cancelled requests remain pending', () => {
  const value = installed();
  const removed = value.plugins.shift();
  value.plugins[0].revision = 'f'.repeat(64);
  value.plugins[1].enabled = false;
  const first = plan(value);
  assert.deepEqual(first.counts, {total: 17, aligned: 14, install: 1, update: 1, enable: 1, blocked: 0});
  // Only one review was approved. The cancelled install and enable still need action.
  value.plugins[0].revision = baseline.targets[1].revision;
  assert.deepEqual(plan(value).counts, {total: 17, aligned: 15, install: 1, update: 0, enable: 1, blocked: 0});
  value.plugins.push(removed); value.plugins[1].enabled = true;
  assert.equal(plan(value).versionsAligned, true);
});

test('folder, cross-source and different-subfolder installs are blocked without suggesting removal', () => {
  for (const source of [{kind: 'folder'}, {kind: 'url'},
    {kind: 'git', repository: 'other/repo'}, {...installed().plugins[0].source, path: 'plugins/old'}]) {
    const value = installed(); value.plugins[0].source = source;
    const result = plan(value).targets[0];
    assert.equal(result.state, 'blocked');
    assert.equal(result.request, undefined);
  }
});

test('unknown states and duplicate input IDs fail closed', () => {
  for (const patch of [{revision: null}, {enabled: undefined}, {bundled: undefined}, {bundled: true},
    {source: {...installed().plugins[0].source, commit: undefined}}]) {
    const value = installed(); Object.assign(value.plugins[0], patch);
    assert.equal(plan(value).targets[0].state, 'blocked');
  }
  const value = installed(); value.plugins.push(value.plugins[0]);
  assert.throws(() => plan(value), /重复/);
  assert.throws(() => plan({}), /plugin_list/);
});

test('mobile and unknown platforms do not get a desktop installation plan', () => {
  for (const platform of ['android', 'ios', 'windows', undefined]) {
    const result = plan({plugins: []}, {platform});
    assert.equal(result.counts.blocked, 17);
    assert.equal(result.targets.some(row => row.request), false);
    assert.equal(result.versionsAligned, false);
  }
  assert.equal(plan(installed(), {platform: 'macos'}).warnings.length, 1);
});

test('unrelated and bundled plugins are preserved; output omits unrelated configuration', () => {
  const value = installed(); value.plugins.push({id: 'other.personal', bundled: false, secret: 'private'},
    {id: 'buzz.todos', bundled: true});
  const result = plan(value);
  assert.deepEqual(result.preservedExtras, ['other.personal']);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('tampered baseline pins, duplicate IDs and traversal paths are refused', () => {
  for (const patch of [{reviewSource: {...baseline.targets[0].reviewSource, commit: 'main'}},
    {reviewSource: {...baseline.targets[0].reviewSource, repository: 'other/repo'}},
    {sourcePath: 'plugins/../private'}, {revision: 'unknown'}, {id: 'buzz.todos'}]) {
    const value = clone(baseline); Object.assign(value.targets[0], patch);
    assert.throws(() => validateBaseline(value));
  }
  const value = clone(baseline); value.targets.push(clone(value.targets[0]));
  assert.throws(() => validateBaseline(value));
});

test('baseline records agree with the registry and exact package bytes', async () => {
  const registry = JSON.parse(await readFile(new URL('../REGISTRY.json', import.meta.url)));
  for (const target of baseline.targets) {
    const entry = registry.entries.find(row => row.id === target.id && row.version === target.version);
    assert(entry, target.id);
    assert.deepEqual(entry.reviewSource, target.reviewSource);
    for (const [file, expected] of [[`${target.sourcePath}/plugin.js`, target.codeSha256],
      [`${target.sourcePath}/manifest.json`, target.manifestSha256], [target.downloadPath, target.archiveSha256]]) {
      assert.equal(createHash('sha256').update(await readFile(new URL('../' + file, import.meta.url))).digest('hex'), expected, file);
    }
  }
});

test('CLI reads stdin offline, prints a plan, rejects bad input and never mutates installation', () => {
  const cli = new URL('../scripts/plan_plugin_sync.mjs', import.meta.url);
  const args = [cli.pathname, '--installed', '-', '--platform', 'macos', '--host-version', '1.0.2'];
  const result = spawnSync(process.execPath, args, {input: JSON.stringify(installed()), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).counts.aligned, 17);
  const invalid = spawnSync(process.execPath, args, {input: '{', encoding: 'utf8'});
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /比对失败/);
});
