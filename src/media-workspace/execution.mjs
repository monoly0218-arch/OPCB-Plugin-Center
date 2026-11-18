// Same access predicate and complete native reader/composer as Task Center.
export function canExecuteInChannel(channel, viewer) {
  return Boolean(viewer && channel && !channel.archived && !channel.readOnly &&
    !channel.cached && !channel.pending && !channel.metadataPending && !channel.metadataCached &&
    channel.members?.includes(viewer) && ['solo', 'stream', 'forum'].includes(channel.channelType));
}
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
export function executionPreference(pluginId, connection) {
  return `opcb.execution.v1:${pluginId}:${connection.scope}:${connection.session.viewer}`;
}
export function readExecutionPreference(key, storage = globalThis.localStorage) {
  try {
    const record = JSON.parse(storage.getItem(key));
    return record && typeof record.channel === 'string' && record.channel.length <= 240 &&
      (!record.solo || uuid(record.solo)) ? record : {channel: ''};
  } catch { return {channel: ''}; }
}
async function waitActive(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(Error('执行栏已关闭，保留原会话编号'));
    signal.addEventListener('abort', abort, {once: true});
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
// Reserve a stable ID before any write. Uncertain results retain it; Continue
// refreshes that exact Solo, never creates a second conversation or sends text.
export async function openExecutionSolo({session, check, record, save, title, signal}) {
  const active = () => { signal?.throwIfAborted(); check(); if (!session.channelWrites?.available) throw Error('当前宿主不能建立 Solo'); };
  const bound = id => {
    const roster = session.channels.list(), c = roster.channels.find(c => c.id === id);
    return roster.status === 'ready' && canExecuteInChannel(c, session.viewer) &&
      c.channelType === 'solo' && c.private === true && c.creator === session.viewer ? c : null;
  };
  active(); let route = record.solo ? record : {...record, solo: crypto.randomUUID(), phase: 'reserved', operation: ''};
  const fresh = !record.solo;
  if (fresh) save(route);
  if (bound(route.solo)) { save({...route, channel: route.solo, phase: 'ready'}); return route.solo; }
  if (!fresh) {
    await waitActive(session.channelWrites.refresh(route.solo, {member: session.viewer}), signal); active();
    if (bound(route.solo)) { save({...route, channel: route.solo, phase: 'ready'}); return route.solo; }
    const starting = session.channelWrites.starting?.(route.solo);
    if (starting) { await waitActive(starting, signal); active(); }
    if (!bound(route.solo)) throw Error('原 Solo 尚未确认或不可访问；保留原编号，不重复创建');
  } else {
    active();
    const created = session.channelWrites.start(route.solo, Array.from(title).slice(0, 120).join(''), [], undefined, true, undefined, {active: () => { try { active(); return true; } catch { return false; } }});
    Promise.resolve(created.ready).catch(() => {});
    route = {...route, phase: 'submitted', operation: created.create}; save(route);
    await waitActive(created.ready, signal); active();
    if (!bound(route.solo)) { await waitActive(session.channelWrites.refresh(route.solo, {member: session.viewer}), signal); active(); }
    if (!bound(route.solo)) throw Error('Solo 创建尚未确认；保留原编号，请稍后续接');
  }
  active(); save({...route, channel: route.solo, phase: 'ready'}); return route.solo;
}

export function createExecutionPanel(ctx, {pluginId, title, onChannel}) {
  const R = ctx.react, h = R.createElement, Context = R.createContext(null);
  function ContextTool(props) {
    const value = R.useContext(Context), [error, setError] = R.useState('');
    if (!value?.text) return null;
    return h('div', {className: 'mw-context-tool'}, h('button', {type: 'button', disabled: props.disabled,
      'aria-label': '将当前素材填入执行草稿', onClick: () => {
        if (props.insertText('\n' + value.text + '\n')) { setError(''); props.focus(); }
        else setError('未能填入，原草稿保留');
      }}, '当前素材'), error && h('span', {role: 'alert'}, error));
  }
  ctx.conversation.registerTool({id: 'media-context', title: '当前素材', component: ContextTool});
  return function ExecutionPanel({connection, contextText = '', visible = true}) {
    const session = connection.session;
    const roster = R.useSyncExternalStore(session.channels.subscribeList, session.channels.list, session.channels.list);
    const key = executionPreference(pluginId, connection);
    const [record, setRecord] = R.useState(() => readExecutionPreference(key));
    const [busy, setBusy] = R.useState(false), [error, setError] = R.useState('');
    const creating = R.useRef(false), alive = R.useRef(true);
    const lifetime = R.useMemo(() => new AbortController(), [session, connection.scope, connection.generation]);
    R.useEffect(() => { alive.current = true; session.channels.ensureList(); return () => { alive.current = false; lifetime.abort(); }; }, [session, lifetime]);
    const check = () => {
      const c = ctx.relay.snapshot();
      if (!alive.current || c.status !== 'ready' || c.cached || c.session !== session || c.scope !== connection.scope || c.generation !== connection.generation) throw Error('账号、社区或页面已变化，请重新打开');
    };
    const save = next => { check(); localStorage.setItem(key, JSON.stringify(next)); setRecord(next); };
    const candidates = roster.status === 'ready' ? roster.channels.filter(c => canExecuteInChannel(c, session.viewer)) : [];
    const channel = candidates.find(c => c.id === record.channel);
    R.useEffect(() => { onChannel?.(channel?.id || ''); return () => onChannel?.(''); }, [channel?.id, onChannel]);
    const newSolo = async () => {
      if (creating.current) return;
      creating.current = true; setBusy(true); setError('');
      try { await openExecutionSolo({session, check, record, save, signal: lifetime.signal, title: `${title} · 执行会话`}); }
      catch (e) { if (alive.current) setError(e.message || 'Solo 未确认，请检查原会话'); }
      finally { creating.current = false; if (alive.current) setBusy(false); }
    };
    const Workspace = ctx.conversation.ui?.Workspace;
    return h('aside', {className: 'mw-execution-panel', 'aria-label': `${title}执行会话`},
      h('div', {className: 'mw-session-bar'}, h('select', {value: channel?.id || '', 'aria-label': '执行会话', disabled: busy,
        onChange: e => { try { save({...record, channel: e.target.value}); setError(''); } catch (err) { setError(err.message); } }},
        h('option', {value: ''}, roster.status === 'loading' ? '正在读取会话…' : 'Choose conversation'),
        candidates.map(c => h('option', {key: c.id, value: c.id}, (c.channelType === 'solo' ? 'Solo · ' : '频道 · ') + c.name))),
        h('button', {type: 'button', 'aria-label': '新建或打开专属执行Solo', disabled: busy || !session.channelWrites?.available, onClick: newSolo},
          busy ? 'Creating…' : record.phase === 'ready' ? 'Open Solo' : record.solo ? 'Continue Solo' : 'New Solo')),
      error && h('p', {role: 'alert', className: 'mw-execution-notice'}, error),
      record.channel && !channel && roster.status === 'ready' && h('p', {role: 'status', className: 'mw-execution-notice'}, '原执行会话当前不可访问，请重新选择'),
      channel && visible ? h(Context.Provider, {value: {text: contextText}},
        h('div', {className: 'mw-native-conversation'}, Workspace ? h(Workspace, {
          key: channel.id, id: `${pluginId}.execution:${channel.id}`, session, scope: connection.scope,
          target: {channelId: channel.id}, label: channel.name,
        }) : h('p', {role: 'status'}, '完整原生会话不可用，请检查 Channels 插件'))) :
        h('div', {className: 'mw-execution-empty'}, h('h2', null, '选择执行会话'), h('p', null, '选择已有 Solo 或频道，或新建专属 Solo'),
          h('p', null, '在原生输入框选择 Agent，确认后发送')));
  };
}
