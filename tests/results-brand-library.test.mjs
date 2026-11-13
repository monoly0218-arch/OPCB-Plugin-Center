import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, brandCategories, normalizeLibrary, filterTemplates } from '../plugins/opcb.results-report/2026-11-13-brand/plugin.js';

const library = templates => ({ templates, screens: [] });
test('keeps the four priorities, classifies legacy records, and preserves non-brand work', () => {
  assert.deepEqual(brandCategories().map(row => row.id), ['texture', 'usage', 'story', 'launch', 'other']);
  const value = normalizeLibrary(library(['washer', 'wipe', 'car', 'cinema', 'birthday'].map(key => ({ key, name: key }))));
  assert.deepEqual(value.templates.map(row => row.category), ['usage', 'texture', 'usage', 'texture', 'other']);
  const edited = normalizeLibrary(library([{ key: 'wipe', name: '测试', category: 'story' }]));
  assert.equal(edited.templates[0].category, 'story');
});
test('more than ten templates survive normalization and filters without mutating the library', () => {
  const value = normalizeLibrary(library(Array.from({ length: 14 }, (_, i) => ({ key: `t${i}`, name: `方向${i}`, category: i % 2 ? 'launch' : 'texture' }))));
  const before = JSON.stringify(value);
  assert.equal(filterTemplates(value, 'all').length, 14);
  assert.equal(filterTemplates(value, 'launch').length, 7);
  assert.equal(filterTemplates(value, 'story').length, 0);
  assert.equal(JSON.stringify(value), before);
});
test('migration refuses corrupt, duplicate and unsafe records; keeps MP4/images and evidence links', () => {
  for (const input of [null, {}, library([{ name: '' }]), library([{ key: 'x', name: '一' }, { key: 'x', name: '二' }]), library([{ name: 'x', source: 'javascript:alert(1)' }]), library([{ name: 'x', poster: 'data:image/svg+xml;base64,AAAA' }])]) assert.throws(() => normalizeLibrary(input));
  const value = normalizeLibrary(library([{ name: '样片', video: 'data:video/mp4;base64,AAAA', poster: 'data:image/png;base64,AAAA', source: 'buzz://message?channel=fixture' }]));
  assert.equal(value.templates[0].video, 'data:video/mp4;base64,AAAA');
});
function harness() {
  let hooks = [], cursor = 0, effects = [], page, saved, fail = false;
  const listeners = new Set();
  const React = {
    createElement(type, props, ...children) { return typeof type === 'function' ? type(props || {}) : { type, props: props || {}, children }; },
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }]; },
    useRef(value) { const i = cursor++; return hooks[i] ??= { current: value }; },
    useEffect(effect, deps) { const i = cursor++; if (!hooks[i] || deps.some((v, n) => v !== hooks[i][n])) { hooks[i] = deps; effects.push(effect); } },
    useSyncExternalStore(_, snapshot) { return snapshot(); },
  };
  apply({ react: React, pages: { register(value) { page = value; } }, relay: { subscribe() {}, snapshot: () => ({ status: 'ready', scope: 'test', session: { viewer: 'fixture' } }) }, artifactStorage: { open() { return {
    preferences: { async get() { return saved; }, async update(_, change) { if (fail) throw Error('disk full'); saved = change(saved); for (const listener of listeners) listener(); } },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, close() {},
  }; } } });
  return { async render() { cursor = 0; const tree = page.component(); const pending = effects; effects = []; for (const effect of pending) effect(); await new Promise(resolve => setImmediate(resolve)); return tree; }, get saved() { return saved; }, set saved(value) { saved = value; }, set fail(value) { fail = value; } };
}
function find(node, predicate) {
  if (Array.isArray(node)) { for (const entry of node) { const match = find(entry, predicate); if (match) return match; } return; }
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  return find(node.children, predicate);
}
test('adding the eleventh candidate persists, filters correctly and does not claim completion; failed save retains data', async () => {
  const runtime = harness(); runtime.saved = normalizeLibrary(library(Array.from({ length: 10 }, (_, i) => ({ key: `t${i}`, name: `方向${i}`, category: 'texture' }))));
  await runtime.render(); let tree = await runtime.render();
  find(tree, n => n.props['aria-label'] === '模板名称').props.onChange({ target: { value: '品牌倒计时' } });
  tree = await runtime.render();
  find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await runtime.render(); tree = await runtime.render();
  assert.equal(runtime.saved.templates.length, 11);
  assert.equal(runtime.saved.templates.at(-1).status, '候选 · 待确认');
  assert(JSON.stringify(tree).includes('已收录 11 个 · 阶段目标 10 个 · 可继续新增'));
  find(tree, n => n.props['data-category'] === 'story').props.onClick(); tree = await runtime.render();
  assert(!find(tree, n => n.props['data-template']));
  runtime.fail = true;
  find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  await runtime.render(); tree = await runtime.render();
  assert.equal(runtime.saved.templates.length, 11);
  assert(JSON.stringify(tree).includes('保存失败'));
});
