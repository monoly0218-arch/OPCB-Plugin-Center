import {entryLinks, installSource} from './directory.mjs';
import {pluginIcon, versionLabel} from './visuals.mjs';

const HEADER = 'OPCB 插件安装卡';
const BLOCK = /\n```opcb-plugin-install\n([^`]+)\n```$/;
const HEX = /^[0-9a-f]{40}$/;
const ID = /^[a-z][a-z0-9.-]{0,79}$/;

export function parseInstallCard(message) {
  const text = typeof message === 'string' ? message : message?.content;
  if (typeof text !== 'string' || text.length > 8000 || !text.startsWith(HEADER + '\n')) return null;
  const match = text.match(BLOCK);
  if (!match || match[1].length > 1200) return null;
  try {
    const data = JSON.parse(match[1]);
    if (!data || Object.keys(data).sort().join(',') !== 'commit,id,release,version' || data.version !== 1 ||
        typeof data.id !== 'string' || !ID.test(data.id) || data.id.includes('..') ||
        typeof data.release !== 'string' || !data.release.trim() || data.release.length > 80 ||
        typeof data.commit !== 'string' || !HEX.test(data.commit)) return null;
    return {id: data.id, release: data.release, commit: data.commit};
  } catch { return null; }
}

export function formatInstallCard(entry, catalogCommit) {
  const source = installSource(entry, catalogCommit);
  const data = {version: 1, id: entry.id, release: entry.version, commit: source.commit};
  if (!parseInstallCard(`${HEADER}\n\n\`\`\`opcb-plugin-install\n${JSON.stringify(data)}\n\`\`\``)) throw Error('安装卡版本无效');
  return `${HEADER}\n${entry.name} · ${versionLabel(entry.version)}\n[查看固定版本](${entryLinks(entry, catalogCommit).source})\n\n\`\`\`opcb-plugin-install\n${JSON.stringify(data)}\n\`\`\``;
}

export function resolveInstallCard(payload, directory) {
  if (!payload || directory.status !== 'ready') return null;
  return directory.entries.find(entry => entry.id === payload.id && entry.version === payload.release &&
    installSource(entry, directory.commit).commit === payload.commit) || null;
}

export function installationStatus(installer, id) {
  try {
    const status = installer?.getInstallationStatus?.(id);
    return ['installed', 'absent'].includes(status) ? status : 'unavailable';
  } catch { return 'unavailable'; }
}

export function createInstallCard(React, store, installer, assets, css) {
  const h = React.createElement;
  return function InstallCard({message}) {
    const payload = parseInstallCard(message);
    const directory = React.useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
    const entry = resolveInstallCard(payload, directory);
    const [details, setDetails] = React.useState(false);
    const [notice, setNotice] = React.useState('');
    const [status, setStatus] = React.useState(() => installationStatus(installer, payload?.id));
    const generation = React.useRef(0);
    const identity = payload ? `${payload.id}@${payload.release}:${payload.commit}` : '';
    React.useEffect(() => {
      generation.current++;
      setDetails(false); setNotice('');
      if (directory.status === 'idle') void store.refresh();
      const update = value => setStatus(['installed', 'absent'].includes(value) ? value : 'unavailable');
      let live = true, off;
      try { off = installer?.subscribeInstallationStatus?.(payload?.id, value => {if (live) update(value);}); } catch {}
      update(installationStatus(installer, payload?.id));
      return () => {live = false; generation.current++; if (typeof off === 'function') off();};
    }, [identity]);
    const refresh = () => {setNotice(''); void store.refresh();};
    const review = async () => {
      const current = store.snapshot();
      // Re-resolve after edits/refresh: a same-name version must never change this signed card's pin.
      const target = resolveInstallCard(payload, current);
      if (!target || current.busy) return;
      const token = generation.current;
      setNotice('');
      await store.review(target);
      if (token !== generation.current) return;
      setStatus(installationStatus(installer, payload.id));
      setNotice(store.snapshot().notice);
    };
    if (!payload) return h('p', null, message.content);
    const busy = !!directory.busy || directory.status === 'loading';
    return h(React.Fragment, null, h('style', null, css),
      h('section', {className: 'opcb-v3 pc-message-card', 'data-theme': 'host', 'data-language': 'zh', 'aria-label': '插件安装卡'},
        entry ? h(React.Fragment, null,
          h('div', {className: 'pc-message-identity'},
            h('img', {src: pluginIcon(entry, assets), alt: '', width: 88, height: 88, draggable: false}),
            h('div', null, h('h2', null, entry.name), h('p', {className: 'pc-message-version'}, versionLabel(entry.version)))),
          h('div', {className: 'pc-message-actions'},
            h('button', {type: 'button', className: 'pc-message-details', onClick: () => setDetails(value => !value), 'aria-expanded': details}, details ? '收起' : '详情'),
            h('button', {type: 'button', className: 'pc-message-install', disabled: busy, onClick: review}, directory.busy === `${entry.id}@${entry.version}` ? '审核中' : status === 'installed' ? '查看更新' : '审阅安装')),
          details ? h('div', {className: 'pc-message-body'}, h('p', null, entry.summary), h('h3', null, '使用条件'), h('p', null, entry.requirements),
            h('a', {href: entryLinks(entry, directory.commit).source, target: '_blank', rel: 'noopener noreferrer'}, '查看固定版本')) : null)
          : h('div', {className: 'pc-message-unavailable'},
            h('p', {role: directory.status === 'error' || directory.status === 'ready' ? 'alert' : 'status'}, directory.error || (directory.status === 'ready' ? '此版本已变化或未收录，未发起安装' : '正在读取插件目录')),
            h('button', {type: 'button', className: 'pc-message-details', disabled: busy, onClick: refresh}, '刷新目录')),
        entry && notice ? h('p', {role: 'status', className: 'pc-message-notice'}, notice) : null));
  };
}

export function registerInstallCards(ctx, store, installer, assets, css) {
  // Keep the catalog usable on hosts without a message extension point.
  const conversation = ctx.conversation;
  if (typeof conversation?.registerMessage !== 'function') return false;
  conversation.registerMessage({id: 'plugin-install-card', title: '插件安装卡',
    matches: message => !message.pluginRequest && !!parseInstallCard(message),
    component: createInstallCard(ctx.react, store, installer, assets, css)});
  const agents = ctx.agents;
  agents?.addTool({name: 'opcb_plugin_install_card', description: '从 OPCB 插件中心读取指定插件版本，生成可发到聊天的安装卡文本。只生成卡片，不安装、不发送；安装仍需卡片按钮打开 Buzz 原生审核。',
    inputSchema: {type: 'object', properties: {id: {type: 'string'}, version: {type: 'string'}}, required: ['id'], additionalProperties: false},
    async call(_client, _context, args) {
      if (typeof args?.id !== 'string' || !ID.test(args.id) || (args.version !== undefined && typeof args.version !== 'string')) throw Error('插件ID或版本无效');
      if (store.snapshot().status !== 'ready') await store.refresh();
      const directory = store.snapshot();
      if (directory.status !== 'ready') throw Error(directory.error || '目录尚未就绪，请稍后重试');
      const entries = directory.entries.filter(entry => entry.id === args.id && (args.version ? entry.version === args.version : !entry.legacy));
      if (entries.length !== 1) throw Error('未找到唯一版本，请指定目录中的完整版本');
      return formatInstallCard(entries[0], directory.commit);
    }});
  return true;
}
