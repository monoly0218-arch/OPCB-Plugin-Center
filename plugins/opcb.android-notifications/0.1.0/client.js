export function eligible(session, message, now = Date.now()) {
  if (!message || message.authorId === session.viewer || message.audience === 'agents' ||
      !Number.isInteger(message.createdAt) || now - message.createdAt * 1000 > 120000 || message.createdAt * 1000 > now + 15000) return false;
  const roster = session.channels.list();
  if (roster.status !== 'ready') return 'wait';
  const channel = roster.channels.find(c => c.id === message.channelId);
  if (!channel || channel.readOnly || channel.archived) return false;
  if (channel.cached || channel.metadataPending) return 'wait';
  const attention = session.unread.attention(message.channelId, message.messageId), sync = session.unread.sync();
  if (attention.status === 'ineligible' || attention.viewing) return false;
  if (!attention.mentioned) {
    const prefs = session.sidebarPreferences.snapshot();
    if (prefs.data?.muted?.includes(message.channelId)) return false;
    if (!['ready', 'unsupported'].includes(prefs.status)) return 'wait';
  }
  if (attention.status === 'unknown' || attention.pending || ['loading', 'error'].includes(sync.status) ||
      (sync.capability !== 'unsupported' && sync.completeness === 'unknown')) return 'wait';
  return attention.unread === true;
}

export function nativeClient(host, worker) {
  let proc, boot, sequence = 0, generation = 0, buffer = '';
  const pending = new Map();
  function close() {
    generation++;
    const old = proc; proc = undefined; boot = undefined; buffer = '';
    for (const task of pending.values()) {clearTimeout(task.timer); task.reject(Error('通知发送端已停止；未自动重发'));}
    pending.clear(); old?.kill();
  }
  async function launch() {
    if (boot) return boot;
    const epoch = generation;
    if (typeof host.spawn !== 'function') throw Error('需要支持进程能力的 Buzz 桌面版及 Node.js 18+');
    boot = host.spawn('sender', {onStdout(chunk) {
      if (epoch !== generation) return;
      buffer += chunk;
      if (buffer.length > 32000) {close(); return;}
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        let response;
        try {response = JSON.parse(buffer.slice(0, end));} catch {close(); return;}
        buffer = buffer.slice(end + 1);
        const task = pending.get(response.id);
        if (!task) continue;
        clearTimeout(task.timer); pending.delete(response.id);
        response.error ? task.reject(Object.assign(Error(response.error), {code: response.code})) : task.resolve(response.value);
      }
    }}).then(async active => {
      if (epoch !== generation) {active.kill(); throw Error('通知发送端已退役');}
      proc = active;
      active.exited.then(() => {if (proc === active) close();}, () => {if (proc === active) close();});
      await active.write(JSON.stringify(worker) + '\n'); return active;
    }).catch(error => {if (epoch === generation) boot = undefined; throw error;});
    return boot;
  }
  return {close, async call(command) {
    const active = await launch(), id = ++sequence;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {pending.delete(id); reject(Error('通知操作超时，结果未确认；没有自动重发')); close();}, 20000);
      pending.set(id, {resolve, reject, timer});
    });
    result.catch(() => {});
    try {await active.write(JSON.stringify({...command, id}) + '\n');} catch {close();}
    return result;
  }};
}

export function createBridge(ctx, worker) {
  let state = {status: '未连接社区', channels: [], selected: [], enabled: false, busy: false, error: '', lastAccepted: 0};
  let active, client, retired = false, offs = [], timer, sending = false, operation = 0;
  const listeners = new Set(), queue = new Map(), seen = new Set();
  const emit = patch => {if (!retired) {state = {...state, ...patch}; for (const fn of listeners) fn();}};
  const scope = c => ({viewer: c.session.viewer, origin: c.origin.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')});
  function stop() {operation++; for (const off of offs) off(); offs = []; clearTimeout(timer); timer = undefined; queue.clear(); seen.clear(); client?.close(); client = undefined; active = undefined; sending = false;}
  const current = c => !retired && active === c && ctx.relay.snapshot().status === 'ready' && !ctx.relay.snapshot().cached && ctx.relay.snapshot().session === c.session && ctx.relay.snapshot().generation === c.generation;
  async function flush(c) {
    if (!current(c) || !state.enabled || sending) return;
    sending = true;
    const token = operation;
    try {
      for (const [channelId, item] of queue) {
        if (!current(c) || !state.enabled) break;
        if (Date.now() > item.until) {queue.delete(channelId); continue;}
        const allow = eligible(c.session, item.message);
        if (allow === 'wait') continue;
        queue.delete(channelId);
        if (!allow) continue;
        const channel = c.session.channels.list().channels.find(row => row.id === channelId);
        try {
          const root = c.session.unread.attention(channelId, item.message.messageId).rootId;
          const result = await client.call({op: 'send', scope: scope(c), message: {...item.message, ...(root ? {threadRootId: root} : {})}, title: channel?.name || 'Buzz 新消息'});
          if (current(c) && token === operation && result.accepted) emit({error: '', lastAccepted: result.at, status: '已提交发送，手机送达待确认'});
        } catch (error) {if (current(c) && token === operation) emit({error: error.code === 'subscriber_inactive' ? '请先打开手机 ntfy 并允许后台运行，再等待下一条新消息。' : '发送未确认，请检查电脑依赖、网络及手机；未自动重发。'});}
      }
    } finally {
      if (current(c) && token === operation) {sending = false; if (queue.size) timer = setTimeout(() => {timer = undefined; void flush(c);}, 1000);}
    }
  }
  function bind() {
    const c = ctx.relay.snapshot();
    if (c.status === 'ready' && !c.cached && active?.session === c.session && active?.generation === c.generation) return;
    stop(); emit({enabled: false, busy: false, selected: [], channels: [], lastAccepted: 0, error: '', status: '未连接社区'});
    if (c.status !== 'ready' || c.cached || !c.session?.viewer || !c.origin) return;
    const s = c.session;
    if (!s.subscribeIncoming || !s.unread?.attention || !s.unread?.sync || !s.sidebarPreferences?.snapshot) {emit({status: '当前桌面缺少通知桥所需的实时消息／已读接口'}); return;}
    active = c; client = nativeClient(ctx.host, worker);
    const token = operation;
    emit({busy: true});
    const roster = () => {if (current(c)) emit({channels: s.channels.list().channels.filter(row => !row.readOnly && !row.cached && !row.archived && !row.metadataPending && row.channelType !== 'system')});};
    roster();
    offs.push(s.channels.subscribeList(roster));
    offs.push(s.subscribeIncoming(messages => {
      if (!current(c) || !state.enabled) return;
      for (const message of messages) {
        if (!state.selected.includes(message.channelId) || seen.has(message.messageId)) continue;
        seen.add(message.messageId); if (seen.size > 2048) seen.delete(seen.values().next().value);
        queue.set(message.channelId, {message, until: Date.now() + 20000});
      }
      if (!timer && queue.size) timer = setTimeout(() => {timer = undefined; void flush(c);}, 500);
    }));
    void client.call({op: 'load', scope: scope(c)}).then(saved => {
      if (current(c) && token === operation) emit({busy: false, enabled: saved.enabled, selected: saved.channels || [], status: saved.enabled ? '已启用，等待新消息' : '未配对'});
    }).catch(() => {if (current(c) && token === operation) emit({busy: false, error: '无法读取通知桥，请检查 Node.js 18+ 和宿主进程权限。', status: '发送端不可用'});});
  }
  const offRelay = ctx.relay.subscribe(bind); bind();
  return {
    snapshot: () => state, subscribe(fn) {listeners.add(fn); return () => listeners.delete(fn);},
    async save(code, selected) {
      const c = active; if (!c || !current(c) || state.busy) return;
      const token = ++operation;
      emit({busy: true, error: ''});
      try {
        if (typeof code !== 'string' || code.length > 6000) throw Error('配对码无效');
        const result = await client.call({op: 'save', scope: scope(c), pair: JSON.parse(code), channels: selected});
        if (current(c) && token === operation) emit({enabled: true, selected: result.channels, status: '配对已保存，等待新消息'});
      } catch {if (current(c) && token === operation) emit({error: '配对未保存：请核对账号、社区、配对码和所选会话。'});}
      finally {if (current(c) && token === operation) emit({busy: false});}
    },
    async clear() {
      const c = active; if (!c || !current(c)) return;
      const token = ++operation;
      emit({enabled: false, busy: true, error: ''}); queue.clear(); client.close(); client = nativeClient(ctx.host, worker);
      try {await client.call({op: 'clear', scope: scope(c)}); if (current(c) && token === operation) emit({selected: [], status: '配对已移除', lastAccepted: 0});}
      catch {if (current(c) && token === operation) emit({error: '当前已停止转发，但本机配对删除未确认；请重试。'});}
      finally {if (current(c) && token === operation) emit({busy: false});}
    },
    dispose() {retired = true; stop(); offRelay(); listeners.clear();},
  };
}
