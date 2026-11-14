// Built with the confirmed OPCB v3 fonts; no runtime imports.
export const inject = ["react", "pages", "panels", "conversation", "navigation", "browser", "host"];
export const MAX_BYTES = 50 * 1024 * 1024;
export function isHtml(file) {
  return file?.mime?.toLowerCase().split(';')[0].trim() === 'text/html' || /\.html?$/i.test(file?.name || '') || /\.html?(?:[?#]|$)/i.test(file?.url || '');
}
export function validateFile(file) {
  if (!isHtml({ name: file.name, mime: file.type })) throw new Error('请选择 .html 或 .htm 文件');
  if (!file.size || file.size > MAX_BYTES) throw new Error('HTML 文件须大于 0 且不超过 50 MB');
}
export async function readSource(source, signal, request = fetch) {
  const response = await request(source, { signal, redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '无权读取此 HTML，请确认原聊天与登录状态' : `读取失败（${response.status}）`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('HTML 文件超过 50 MB');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('当前客户端不支持读取附件内容');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) throw new Error('HTML 文件超过 50 MB');
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
  } finally { await reader.cancel().catch(() => {}); }
  if (!length) throw new Error('HTML 文件为空');
  return { html: parts.join(''), size: length };
}
export async function startPreview(host, html, source, signal) {
  let child, buffer = '', settle, fail;
  const ready = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
  ready.catch(() => {});
  const stop = () => { fail(new Error('预览已关闭')); if (child) void child.kill().catch(() => {}); };
  signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => { fail(new Error('预览启动超时，请检查 Python 3')); if (child) void child.kill().catch(() => {}); }, 20000);
  try {
    if (signal.aborted) throw new Error('预览已关闭');
    child = await host.spawn('preview', { onStdout(data) {
      buffer += data;
      if (buffer.length > 2048) { fail(new Error('预览进程返回异常')); return; }
      if (!buffer.includes('\n')) return;
      try {
        const result = JSON.parse(buffer.trim());
        if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{43}\/$/.test(result.url)) throw new Error();
        settle(result.url);
      } catch { fail(new Error('预览地址无效')); }
    }});
    if (signal.aborted) throw new Error('预览已关闭');
    child.exited.then(() => fail(new Error('预览进程已退出，请检查 Python 3')));
    const input = JSON.stringify(source) + '\n' + JSON.stringify({ html }) + '\n';
    for (let offset = 0; offset < input.length; offset += 65536) {
      if (signal.aborted) throw new Error('预览已关闭');
      await child.write(input.slice(offset, offset + 65536));
    }
    const url = await ready;
    return { url, close: stop, exited: child.exited };
  } catch (error) { stop(); throw error; }
  finally { clearTimeout(timer); /* signal retains stop for the mounted lifetime */ }
}

export function apply(ctx) {
  const R = ctx.react, h = R.createElement;
  const descriptors = new Map(), listeners = new Set(), processes = new Set();
  let current = null, alive = true;
  const targetPrefix = 'opcb-html:';
  const setCurrent = item => { current = item; for (const listener of listeners) listener(); };
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const destination = () => ({ version: 1, kind: 'plugin', pluginId: 'opcb.html-reader', pageId: 'reader' });
  const addDescriptor = descriptor => {
    const target = targetPrefix + crypto.randomUUID();
    descriptors.set(target, descriptor);
    // URLs only; no document bytes retained in this bounded handoff table.
    if (descriptors.size > 100) descriptors.delete(descriptors.keys().next().value);
    return target;
  };
  ctx.effect(() => () => { alive = false; processes.forEach(close => close()); processes.clear(); descriptors.clear(); setCurrent(null); listeners.clear(); });
  function Icon({ type }) {
    const paths = { file: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12l-2 2 2 2 M15 12l2 2-2 2', expand: 'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M3 16v5h5', close: 'M6 6l12 12 M18 6L6 18', upload: 'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6' };
    return h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[type] || paths.file }));
  }
  function Reader({ item, panel = false }) {
    const [local, setLocal] = R.useState(null), [status, setStatus] = R.useState('empty'), [error, setError] = R.useState(''), [url, setUrl] = R.useState(''), [full, setFull] = R.useState(false), [size, setSize] = R.useState(0), [compact, setCompact] = R.useState(false), [previewItem, setPreviewItem] = R.useState(null);
    const root = R.useRef(null), input = R.useRef(null), fullscreenButton = R.useRef(null);
    const selected = local || item;
    const available = ctx.browser.available && typeof ctx.host.spawn === 'function';
    R.useEffect(() => {
      const observer = new ResizeObserver(entries => setCompact(entries[0].contentRect.width < 620));
      observer.observe(root.current); return () => observer.disconnect();
    }, []);
    R.useEffect(() => {
      const node = root.current, doc = node.ownerDocument;
      const changed = () => { const active = (doc.fullscreenElement || doc.webkitFullscreenElement) === node; setFull(active); if (!active) fullscreenButton.current?.focus(); };
      doc.addEventListener('fullscreenchange', changed); doc.addEventListener('webkitfullscreenchange', changed);
      return () => { doc.removeEventListener('fullscreenchange', changed); doc.removeEventListener('webkitfullscreenchange', changed); if ((doc.fullscreenElement || doc.webkitFullscreenElement) === node) void (doc.exitFullscreen?.() || doc.webkitExitFullscreen?.()); };
    }, []);
    R.useEffect(() => {
      setError(''); setUrl(''); setSize(0); setPreviewItem(null);
      if (!selected || !available) { setStatus('empty'); return; }
      const controller = new AbortController(); let close;
      setStatus('loading');
      (async () => {
        const loaded = selected.file ? { html: await selected.file.text(), size: selected.file.size } : await readSource(selected.source, controller.signal);
        if (controller.signal.aborted || !alive) return;
        if (!loaded.html || new TextEncoder().encode(loaded.html).byteLength > MAX_BYTES) throw new Error('HTML 文件为空或超过 50 MB');
        const preview = await startPreview(ctx.host, loaded.html, VIEWER_SOURCE, controller.signal);
        close = preview.close; processes.add(close);
        if (controller.signal.aborted || !alive) { close(); processes.delete(close); return; }
        setSize(loaded.size); setPreviewItem(selected); setUrl(preview.url); setStatus('ready');
        preview.exited.then(() => { processes.delete(close); if (!controller.signal.aborted && alive) { setUrl(''); setStatus('error'); setError('预览进程已停止，请重新打开文件'); } });
      })().catch(error => { if (!controller.signal.aborted && alive) { setStatus('error'); setError(error.message || '无法读取 HTML'); } });
      return () => { controller.abort(); if (close) { processes.delete(close); close(); } };
    }, [selected, available]);
    async function choose(file) {
      if (!file) return;
      try { validateFile(file); setError(''); setLocal({ file, name: file.name }); }
      catch (error) { setError(error.message); }
    }
    async function toggleFullscreen() {
      const node = root.current, doc = node.ownerDocument;
      try {
        if (full) await (doc.exitFullscreen?.() || doc.webkitExitFullscreen?.());
        else if (node.requestFullscreen) await node.requestFullscreen();
        else if (node.webkitRequestFullscreen) node.webkitRequestFullscreen();
        else throw new Error('此客户端未提供全屏 API，可用系统窗口全屏');
      } catch (error) { setError(error.message === '此客户端未提供全屏 API，可用系统窗口全屏' ? error.message : '客户端未能进入全屏，可使用系统窗口全屏'); }
    }
    const button = (text, type, onClick, extra = {}) => h('button', { type: 'button', onClick, ...extra }, h(Icon, { type }), text);
    return h('section', { ref: root, className: 'opcb-html-reader opcb-v3', 'data-fullscreen': full, 'data-compact': compact, onDragOver: e => { e.preventDefault(); }, onDrop: e => { e.preventDefault(); if (available) void choose(e.dataTransfer.files[0]); } },
      h('style', null, READER_CSS),
      h('div', { className: 'html-tools' },
        h('div', { className: 'html-title' }, h(Icon, { type: 'file' }), h('div', null, h(panel ? 'h2' : 'h1', null, selected?.name || 'HTML 阅读器'), h('p', null, selected ? (status === 'ready' ? `自包含预览 · ${(size / 1048576).toFixed(1)} MB` : 'HTML 文件') : '打开文件，专心看内容'))),
        h('div', { className: 'html-actions' },
          button('打开文件', 'upload', () => input.current?.click(), { disabled: !available }),
          button(full ? '退出全屏' : '全屏', 'expand', toggleFullscreen, { ref: fullscreenButton, disabled: !url }),
          selected && button('关闭文件', 'close', () => { setLocal(null); if (!panel) setCurrent(null); else void ctx.navigation.open(destination()); }))),
      h('input', { ref: input, type: 'file', accept: '.html,.htm,text/html', hidden: true, onChange: e => { void choose(e.target.files[0]); e.target.value = ''; } }),
      error && h('p', { className: 'html-error', role: 'alert' }, error),
      h('div', { className: 'html-viewport', 'aria-busy': status === 'loading' },
        !available ? h('div', { className: 'html-empty' }, h(Icon, { type: 'file' }), h('h2', null, '需要 Mac 桌面版'), h('p', null, '当前客户端未提供内嵌浏览器或进程 API。请在 Mac 版 Buzz 中打开，并确保已安装 Python 3。')) :
        url && selected && previewItem === selected ? h(ctx.browser.View, { url, label: selected.name }) :
        h('div', { className: 'html-empty' }, h(Icon, { type: 'file' }), h('h2', null, status === 'loading' ? '正在打开 HTML' : status === 'error' ? '未能打开文件' : '在这里打开 HTML'), h('p', null, status === 'loading' ? '读取文件并准备预览' : '选择或拖入 .html 文件，也可在聊天附件中点开预览'), !selected && button('选择 HTML 文件', 'upload', () => input.current?.click()))),
      h('p', { className: 'html-footnote' }, '支持不超过 50 MB 的自包含 HTML；外部脚本、图片与同目录资源不加载。关闭预览后释放内容。'));
  }
  function Page() { const item = R.useSyncExternalStore(subscribe, () => current); return h(Reader, { key: item?.key || 'local', item }); }
  function Panel({ target }) { const item = descriptors.get(target); return h(Reader, { key: target, item }); }
  function Attachment(props) {
    const { attachment, source, FileCard, placement, open } = props;
    const target = R.useMemo(() => addDescriptor({ source, name: attachment.name || 'HTML 文件' }), [source, attachment.name]);
    R.useEffect(() => () => { descriptors.delete(target); }, [target]);
    const preview = placement === 'message' ? () => open(target) : undefined;
    return FileCard ? h(FileCard, { attachment, source, onOpenLink: open, onPreview: preview, typeLabel: 'HTML' }) : h('span', null, h('a', { href: source }, attachment.name || 'HTML 文件'), preview && h('button', { type: 'button', onClick: preview }, '侧栏预览'));
  }
  ctx.pages.register({ id: 'reader', title: 'HTML 阅读器', primary: true, placement: 'sidebar', layout: 'workspace', component: Page });
  ctx.panels.register({ id: 'html-preview', title: 'HTML 阅读器', matches: target => target.startsWith(targetPrefix), order: 0, keepOpen: true, component: Panel,
    channelPlacement: 'tab', channelLauncher: ({ toggle, available }) => h('button', { type: 'button', disabled: !available(), onClick: () => toggle('opcb-html:open'), title: '打开 HTML 阅读器' }, h(Icon, { type: 'file' }), 'HTML') });
  if (typeof ctx.conversation.registerAttachment === 'function') ctx.conversation.registerAttachment({ id: 'html-file', title: 'HTML 侧栏预览', matches: isHtml, order: -10, component: Attachment });
}
