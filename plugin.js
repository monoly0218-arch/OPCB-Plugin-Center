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

export const WORKER = "// No Nostr key, cookie or message body is persisted. Only this plugin's pairing.\nconst fs = require('node:fs/promises');\nconst path = require('node:path');\nconst os = require('node:os');\nconst crypto = require('node:crypto');\nconst hex = /^[a-f0-9]{64}$/;\nconst uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;\nfunction scope(value) {\n  if (!value || !hex.test(value.viewer)) throw Error('invalid_scope');\n  const u = new URL(value.origin);\n  if (u.protocol !== 'https:' || u.origin !== value.origin || u.username || u.password) throw Error('invalid_scope');\n  return {viewer: value.viewer, origin: value.origin};\n}\nfunction pairing(value, binding) {\n  if (value?.version !== 1 || !uuid.test(value.deviceId) || value.viewer !== binding.viewer || value.communityOrigin !== binding.origin) throw Error('wrong_pairing_scope');\n  const sub = value.subscription, u = new URL(sub?.endpoint);\n  if (u.origin !== 'https://ntfy.sh' || u.username || u.password || u.search !== '?up=1' || u.hash || u.pathname.length < 2 || u.href.length > 2048) throw Error('unsupported_endpoint');\n  if (typeof sub.p256dh !== 'string' || typeof sub.auth !== 'string' || sub.p256dh.length > 100 || sub.auth.length > 32) throw Error('invalid_keys');\n  const pub = Buffer.from(sub.p256dh, 'base64url'), auth = Buffer.from(sub.auth, 'base64url');\n  if (pub.length !== 65 || pub[0] !== 4 || auth.length !== 16) throw Error('invalid_keys');\n  crypto.ECDH.convertKey(pub, 'prime256v1');\n  return {version: 1, viewer: value.viewer, communityOrigin: value.communityOrigin, deviceId: value.deviceId,\n    subscription: {endpoint: u.href, p256dh: pub.toString('base64url'), auth: auth.toString('base64url')}};\n}\nfunction encrypt(body, subscription) {\n  const client = Buffer.from(subscription.p256dh, 'base64url'), auth = Buffer.from(subscription.auth, 'base64url');\n  const server = crypto.createECDH('prime256v1'); server.generateKeys();\n  const pub = server.getPublicKey(), secret = server.computeSecret(client), salt = crypto.randomBytes(16);\n  const hkdf = (ikm, salt, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, n));\n  const ikm = hkdf(secret, auth, Buffer.concat([Buffer.from('WebPush: info\\0'), client, pub]), 32);\n  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\\0'), 16);\n  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\\0'), 12);\n  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);\n  const encrypted = Buffer.concat([cipher.update(Buffer.concat([body, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);\n  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);\n  return Buffer.concat([salt, rs, Buffer.from([pub.length]), pub, encrypted]);\n}\nfunction brief(value, bytes) {\n  let result = '';\n  for (const char of String(value ?? '')) {if (Buffer.byteLength(result + char) > bytes) break; result += char;}\n  return result;\n}\nfunction createWorker({root = path.join(os.homedir(), '.buzz', 'plugin-data', 'opcb.android-notifications'), post = fetch} = {}) {\n  const file = binding => path.join(root, crypto.createHash('sha256').update(JSON.stringify(binding)).digest('hex') + '.json');\n  async function read(binding) {\n    let raw;\n    try {raw = await fs.readFile(file(binding), 'utf8');} catch (e) {if (e.code === 'ENOENT') return null; throw e;}\n    if (Buffer.byteLength(raw) > 16000) throw Error('storage_invalid');\n    const state = JSON.parse(raw); pairing(state.pair, binding); return state;\n  }\n  async function write(binding, value) {\n    await fs.mkdir(root, {recursive: true, mode: 0o700});\n    const temp = file(binding) + '.tmp-' + crypto.randomUUID();\n    try {await fs.writeFile(temp, JSON.stringify(value), {mode: 0o600, flag: 'wx'}); await fs.rename(temp, file(binding));}\n    finally {await fs.rm(temp, {force: true});}\n  }\n  const locks = new Set();\n  return async command => {\n    const binding = scope(command.scope), key = file(binding);\n    if (locks.has(key)) throw Error('busy');\n    locks.add(key);\n    try {\n      if (command.op === 'clear') {await fs.rm(key, {force: true}); return {enabled: false};}\n      if (command.op === 'save') {\n        const pair = pairing(command.pair, binding), channels = command.channels;\n        if (!Array.isArray(channels) || !channels.length || channels.length > 20 || channels.some(id => !uuid.test(id)) || new Set(channels).size !== channels.length) throw Error('invalid_channels');\n        await write(binding, {pair, channels, enabled: true, seen: []}); return {enabled: true, deviceId: pair.deviceId, channels};\n      }\n      const state = await read(binding);\n      if (command.op === 'load') return state ? {enabled: true, deviceId: state.pair.deviceId, channels: state.channels} : {enabled: false, channels: []};\n      if (command.op !== 'send' || !state?.enabled) throw Error('not_paired');\n      const m = command.message, now = Math.floor(Date.now() / 1000);\n      if (!hex.test(m?.messageId) || !uuid.test(m.channelId) || !state.channels.includes(m.channelId) || m.authorId === binding.viewer || m.audience === 'agents' ||\n          !Number.isInteger(m.createdAt) || m.createdAt < now - 120 || m.createdAt > now + 15) throw Error('ineligible_message');\n      if (state.seen.includes(m.messageId)) return {duplicate: true};\n      const payload = {version: 1, viewer: binding.viewer, communityOrigin: binding.origin, deviceId: state.pair.deviceId,\n        expiresAt: now + 60, eventId: m.messageId, channelId: m.channelId,\n        title: brief(command.title || 'Buzz 新消息', 128), body: brief(m.previewContent, 900),\n        ...(m.threadRootId && hex.test(m.threadRootId) ? {threadRootId: m.threadRootId} : {})};\n      // Mark the immutable event before HTTPS. Unknown outcomes never auto-resend.\n      state.seen = [...state.seen.slice(-127), m.messageId]; await write(binding, state);\n      const body = encrypt(Buffer.from(JSON.stringify(payload)), state.pair.subscription);\n      const response = await post(state.pair.subscription.endpoint, {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),\n        headers: {'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '60', Urgency: 'normal'}, body});\n      if (response.status === 507) throw Error('subscriber_inactive');\n      if (response.status < 200 || response.status >= 300) throw Error('send_unconfirmed');\n      return {accepted: true, at: now};\n    } finally {locks.delete(key);}\n  };\n}\nfunction run(input) {\n  const command = createWorker();\n  input.on('line', async line => {\n    let request;\n    try {\n      if (Buffer.byteLength(line) > 16000) throw Error('input_too_large');\n      request = JSON.parse(line);\n      const value = await command(request);\n      process.stdout.write(JSON.stringify({id: request.id, value}) + '\\n');\n    } catch (error) {process.stdout.write(JSON.stringify({id: request?.id, code: error.message === 'subscriber_inactive' ? 'subscriber_inactive' : 'unconfirmed', error: '通知桥操作未确认，请检查本机依赖、配对和网络；没有自动重发。'}) + '\\n');}\n  });\n}\nif (typeof module !== 'undefined') module.exports = {scope, pairing, encrypt, createWorker};\nif (typeof input !== 'undefined') run(input);\n";

export const inject = ['react', 'pages', 'relay', 'host'];
export function apply(ctx) {
  const R = ctx.react, h = R.createElement, bridge = createBridge(ctx, WORKER);
  ctx.effect(() => () => bridge.dispose());
  function Page() {
    const state = R.useSyncExternalStore(bridge.subscribe, bridge.snapshot, bridge.snapshot);
    const [code, setCode] = R.useState(''), [selected, select] = R.useState([]);
    R.useEffect(() => select(state.selected), [state.selected]);
    const button = {font: 'inherit', minHeight: 44, borderRadius: 8, padding: '8px 16px', cursor: 'pointer'};
    return h('main', {style:{padding:24, maxWidth:900, margin:'0 auto', color:'var(--text-standard)', fontFamily:'inherit'}},
      h('h1', null, '安卓通知桥'),
      h('p', {role:'status'}, state.status),
      h('p', null, '电脑在线时转发；手机需安装 ntfy 无 Firebase 版并允许后台通知。'),
      state.error && h('p', {role:'alert'}, state.error),
      h('label', null, '安卓配对码', h('textarea', {value:code, onChange:e=>setCode(e.target.value), maxLength:6000, rows:4, autoComplete:'off', spellCheck:false,
        style:{display:'block', width:'100%', boxSizing:'border-box', font:'inherit', marginTop:8}, 'aria-label':'安卓配对码'})),
      h('h2', null, '允许提醒的会话'),
      h('div', {style:{maxHeight:400, overflowY:'auto'}}, state.channels.map(channel => h('label', {key:channel.id, style:{display:'flex', alignItems:'center', minHeight:44, gap:12}},
        h('input', {type:'checkbox', checked:selected.includes(channel.id), disabled:state.busy || (!selected.includes(channel.id) && selected.length>=20),
          onChange:e=>select(e.target.checked?[...selected,channel.id]:selected.filter(id=>id!==channel.id))}), channel.name))),
      h('div', {style:{display:'flex', gap:12, flexWrap:'wrap', marginTop:20}},
        h('button', {style:button, disabled:state.busy || !code.trim() || !selected.length, onClick:async()=>{await bridge.save(code,selected); if(bridge.snapshot().enabled) setCode('');}}, '保存配对并启用'),
        h('button', {style:button, disabled:state.busy, onClick:()=>bridge.clear()}, '停用并移除配对')),
      state.lastAccepted>0 && h('p', null, '最近提交：'+new Date(state.lastAccepted*1000).toLocaleString()),
      h('p', null, '遵循静音和已读规则，仅转发新消息；服务接受发送不代表手机已经收到。'));
  }
  ctx.pages.register({id:'android-notifications', title:'安卓通知桥', primary:true, placement:'dock', layout:'document', component:Page});
}
