// No Nostr key, cookie or message body is persisted. Only this plugin's pairing.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const hex = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function scope(value) {
  if (!value || !hex.test(value.viewer)) throw Error('invalid_scope');
  const u = new URL(value.origin);
  if (u.protocol !== 'https:' || u.origin !== value.origin || u.username || u.password) throw Error('invalid_scope');
  return {viewer: value.viewer, origin: value.origin};
}
function pairing(value, binding) {
  if (value?.version !== 1 || !uuid.test(value.deviceId) || value.viewer !== binding.viewer || value.communityOrigin !== binding.origin) throw Error('wrong_pairing_scope');
  const sub = value.subscription, u = new URL(sub?.endpoint);
  if (u.origin !== 'https://ntfy.sh' || u.username || u.password || u.search !== '?up=1' || u.hash || u.pathname.length < 2 || u.href.length > 2048) throw Error('unsupported_endpoint');
  if (typeof sub.p256dh !== 'string' || typeof sub.auth !== 'string' || sub.p256dh.length > 100 || sub.auth.length > 32) throw Error('invalid_keys');
  const pub = Buffer.from(sub.p256dh, 'base64url'), auth = Buffer.from(sub.auth, 'base64url');
  if (pub.length !== 65 || pub[0] !== 4 || auth.length !== 16) throw Error('invalid_keys');
  crypto.ECDH.convertKey(pub, 'prime256v1');
  return {version: 1, viewer: value.viewer, communityOrigin: value.communityOrigin, deviceId: value.deviceId,
    subscription: {endpoint: u.href, p256dh: pub.toString('base64url'), auth: auth.toString('base64url')}};
}
function encrypt(body, subscription) {
  const client = Buffer.from(subscription.p256dh, 'base64url'), auth = Buffer.from(subscription.auth, 'base64url');
  const server = crypto.createECDH('prime256v1'); server.generateKeys();
  const pub = server.getPublicKey(), secret = server.computeSecret(client), salt = crypto.randomBytes(16);
  const hkdf = (ikm, salt, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, n));
  const ikm = hkdf(secret, auth, Buffer.concat([Buffer.from('WebPush: info\0'), client, pub]), 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([body, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([pub.length]), pub, encrypted]);
}
function brief(value, bytes) {
  let result = '';
  for (const char of String(value ?? '')) {if (Buffer.byteLength(result + char) > bytes) break; result += char;}
  return result;
}
function createWorker({root = path.join(os.homedir(), '.buzz', 'plugin-data', 'opcb.android-notifications'), post = fetch} = {}) {
  const file = binding => path.join(root, crypto.createHash('sha256').update(JSON.stringify(binding)).digest('hex') + '.json');
  async function read(binding) {
    let raw;
    try {raw = await fs.readFile(file(binding), 'utf8');} catch (e) {if (e.code === 'ENOENT') return null; throw e;}
    if (Buffer.byteLength(raw) > 16000) throw Error('storage_invalid');
    const state = JSON.parse(raw); pairing(state.pair, binding); return state;
  }
  async function write(binding, value) {
    await fs.mkdir(root, {recursive: true, mode: 0o700});
    const temp = file(binding) + '.tmp-' + crypto.randomUUID();
    try {await fs.writeFile(temp, JSON.stringify(value), {mode: 0o600, flag: 'wx'}); await fs.rename(temp, file(binding));}
    finally {await fs.rm(temp, {force: true});}
  }
  const locks = new Set();
  return async command => {
    const binding = scope(command.scope), key = file(binding);
    if (locks.has(key)) throw Error('busy');
    locks.add(key);
    try {
      if (command.op === 'clear') {await fs.rm(key, {force: true}); return {enabled: false};}
      if (command.op === 'save') {
        const pair = pairing(command.pair, binding), channels = command.channels;
        if (!Array.isArray(channels) || !channels.length || channels.length > 20 || channels.some(id => !uuid.test(id)) || new Set(channels).size !== channels.length) throw Error('invalid_channels');
        await write(binding, {pair, channels, enabled: true, seen: []}); return {enabled: true, deviceId: pair.deviceId, channels};
      }
      const state = await read(binding);
      if (command.op === 'load') return state ? {enabled: true, deviceId: state.pair.deviceId, channels: state.channels} : {enabled: false, channels: []};
      if (command.op !== 'send' || !state?.enabled) throw Error('not_paired');
      const m = command.message, now = Math.floor(Date.now() / 1000);
      if (!hex.test(m?.messageId) || !uuid.test(m.channelId) || !state.channels.includes(m.channelId) || m.authorId === binding.viewer || m.audience === 'agents' ||
          !Number.isInteger(m.createdAt) || m.createdAt < now - 120 || m.createdAt > now + 15) throw Error('ineligible_message');
      if (state.seen.includes(m.messageId)) return {duplicate: true};
      const payload = {version: 1, viewer: binding.viewer, communityOrigin: binding.origin, deviceId: state.pair.deviceId,
        expiresAt: now + 60, eventId: m.messageId, channelId: m.channelId,
        title: brief(command.title || 'Buzz 新消息', 128), body: brief(m.previewContent, 900),
        ...(m.threadRootId && hex.test(m.threadRootId) ? {threadRootId: m.threadRootId} : {})};
      // Mark the immutable event before HTTPS. Unknown outcomes never auto-resend.
      state.seen = [...state.seen.slice(-127), m.messageId]; await write(binding, state);
      const body = encrypt(Buffer.from(JSON.stringify(payload)), state.pair.subscription);
      const response = await post(state.pair.subscription.endpoint, {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
        headers: {'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '60', Urgency: 'normal'}, body});
      if (response.status === 507) throw Error('subscriber_inactive');
      if (response.status < 200 || response.status >= 300) throw Error('send_unconfirmed');
      return {accepted: true, at: now};
    } finally {locks.delete(key);}
  };
}
function run(input) {
  const command = createWorker();
  input.on('line', async line => {
    let request;
    try {
      if (Buffer.byteLength(line) > 16000) throw Error('input_too_large');
      request = JSON.parse(line);
      const value = await command(request);
      process.stdout.write(JSON.stringify({id: request.id, value}) + '\n');
    } catch (error) {process.stdout.write(JSON.stringify({id: request?.id, code: error.message === 'subscriber_inactive' ? 'subscriber_inactive' : 'unconfirmed', error: '通知桥操作未确认，请检查本机依赖、配对和网络；没有自动重发。'}) + '\n');}
  });
}
if (typeof module !== 'undefined') module.exports = {scope, pairing, encrypt, createWorker};
if (typeof input !== 'undefined') run(input);
