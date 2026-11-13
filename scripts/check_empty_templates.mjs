// Component smoke check with inert host/React facades. No browser, effects, network or business access.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
let states = [], cursor = 0;
const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    const all = { ...props, children };
    return typeof type === 'function' ? type(all) : { type, props: all, children };
  },
  useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], value => { states[index] = value; }];
  },
  useRef: initial => ({ current: initial }),
  useEffect() {},
  useMemo: fn => fn(),
  useCallback: fn => fn,
  useSyncExternalStore: (_, snapshot) => snapshot(),
};
async function load(id) {
  const path = new URL(`../plugins/${id}/${id === "opcb.results-report" ? "2026-11-13-brand" : "2026-11-13"}/plugin.js`, import.meta.url);
  return import(`data:text/javascript;base64,${Buffer.from(await readFile(path)).toString('base64')}`);
}
let page;
const session = { viewer: 'fixture-viewer', channels: { list: () => ({ status: 'ready', channels: [] }) }, agentChoices: { snapshot: () => ({ selectable: [], pending: false }) } };
const ctx = { react: React, pages: { register: p => { page = p; } }, relay: { subscribe() {}, snapshot: () => ({ status: 'ready', cached: false, session }) }, browser: { available: false } };
const reset = () => { states = []; cursor = 0; };
const report = await load('opcb.results-report');
report.apply(ctx); reset();
let tree = page.component();
assert(JSON.stringify(tree).includes('公开分发包不含团队样片'));
function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    if (Array.isArray(child)) { for (const entry of child) { const found = find(entry, predicate); if (found) return found; } }
    else { const found = find(child, predicate); if (found) return found; }
  }
}
const toggle = find(tree, n => n.props?.['data-mode-toggle']);
assert(toggle); toggle.props.onClick(); cursor = 0; tree = page.component();
assert(JSON.stringify(tree).includes('示例预演：以下数字与复盘均为模拟'));
const assets = await load('opcb.shangliangshan-assets');
assets.apply(ctx); reset(); tree = page.component();
assert(JSON.stringify(tree).includes('上粮山资产库'));
assets.apply(ctx, { owner: session.viewer, count: 0, items: [], capturedAt: 'fixture' });
reset(); tree = page.component();
assert(JSON.stringify(tree).includes('0 组样本'));
console.log('PASS: report blank/default/example and assets generic/empty-preview component smoke checks (host facade only).');
