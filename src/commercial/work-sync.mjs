export const FACTORY_CHANNEL = '778996be-f459-4188-bac9-6303a1355dda';
export const WORK_SYNC_PATH = '/opcb-plugins/work-sync/api/v1';

const hex64 = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
const toHex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const toBase64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const bounded = (value, limit) => typeof value === 'string' && value.length <= limit;
const timestamp = value => bounded(value, 40) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const statuses = new Set(['pending_review', 'accepted', 'changes_requested']);

function messageLink(value) {
  if (!bounded(value, 500)) throw Error('模版回执链接无效');
  const url = new URL(value);
  if (url.protocol !== 'buzz:' || url.hostname !== 'message' || url.username || url.password ||
      url.searchParams.get('channel') !== FACTORY_CHANNEL || !hex64.test(url.searchParams.get('id') || '')) {
    throw Error('模版回执必须来自模版工厂频道');
  }
  const thread = url.searchParams.get('thread');
  return `buzz://message?channel=${FACTORY_CHANNEL}&id=${url.searchParams.get('id')}${hex64.test(thread || '') ? `&thread=${thread}` : ''}`;
}

export function readWorkSyncSnapshot(value) {
  if (value?.schema !== 1 || value.channelId !== FACTORY_CHANNEL ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 || !timestamp(value.updatedAt) ||
      !Array.isArray(value.items) || value.items.length > 100) throw Error('模版工厂快照格式无效');
  const items = value.items.map(item => {
    if (!item || !bounded(item.taskId, 128) || !item.taskId ||
        !(Number.isSafeInteger(item.version) && item.version > 0 || bounded(item.version, 128) && item.version.trim()) ||
        !statuses.has(item.status) || !bounded(item.title, 240) || !item.title.trim() ||
        !Array.isArray(item.attachmentUrls) || item.attachmentUrls.length > 32 ||
        !item.attachmentUrls.every(url => bounded(url, 4096))) throw Error('模版交付记录格式无效');
    const {review, taskId, version, status, title} = item;
    if (status === 'pending_review' ? review !== null : !review || !hex64.test(review.reviewerId || '') ||
        !timestamp(review.reviewedAt) || !bounded(review.reason ?? '', 3000)) throw Error('模版验收记录格式无效');
    return {taskId, version, status, title, submissionUrl:messageLink(item.submissionUrl),
      attachmentUrls:item.attachmentUrls.slice(), review:review && {reviewerId:review.reviewerId,
        reviewedAt:review.reviewedAt, reason:review.reason ?? '', messageUrl:messageLink(review.messageUrl)}};
  });
  return {schema:1, channelId:FACTORY_CHANNEL, revision:value.revision, updatedAt:value.updatedAt, items};
}

export function createWorkSyncClient(host, api, {now = Date.now} = {}) {
  const endpoint = new URL(api);
  if (endpoint.protocol !== 'https:' || endpoint.pathname !== WORK_SYNC_PATH || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash) throw Error('模版同步服务地址无效');
  const base = endpoint.href;
  async function post(action, payload, signal) {
    signal?.throwIfAborted();
    const response = await host.request({url:`${base}/${action}`, method:'POST', timeoutMs:8000,
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    signal?.throwIfAborted();
    let result;
    try { result = JSON.parse(response.body); } catch { result = null; }
    if (response.status !== 200) throw Object.assign(Error('模版工厂数据读取失败'), {status:response.status});
    return result;
  }
  return {
    async bind({owner, community}, publish, signal) {
      if (!hex64.test(owner) || !hex64.test(community)) throw Error('Buzz 身份尚未就绪');
      const keys = await crypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, false, ['sign', 'verify']);
      const {kty, crv, x, y} = await crypto.subtle.exportKey('jwk', keys.publicKey);
      const deviceKey = {kty, crv, x, y};
      const fingerprint = toHex(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(deviceKey))));
      const challenge = await post('challenge', {fingerprint}, signal);
      if (!hex64.test(challenge?.nonce || '') || challenge.community !== community) throw Error('模版同步服务社区校验失败');
      const content = JSON.stringify({version:1, purpose:'opcb.work-sync.device-binding', audience:base,
        community, deviceKey, nonce:challenge.nonce, role:'read'});
      const event = await publish(content, signal);
      if (event?.pubkey !== owner || event?.content !== content) throw Error('Buzz 签名身份不匹配');
      const binding = await post('bind', {event}, signal);
      if (binding?.owner !== owner || binding.device !== fingerprint || binding.delegated !== false) {
        throw Error('模版同步返回的身份绑定无效');
      }
      return {device:fingerprint, key:keys.privateKey};
    },
    async snapshot(binding, signal) {
      if (!hex64.test(binding?.device || '') || !binding?.key) throw Error('请先连接模版工厂');
      const body = JSON.stringify({channelId:FACTORY_CHANNEL});
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      const timestamp = Math.floor(now() / 1000);
      const message = JSON.stringify(['opcb.work-sync.request.v1', `${base}/snapshot`, body, nonce, timestamp]);
      const signature = toBase64Url(await crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, binding.key, encoder.encode(message)));
      return readWorkSyncSnapshot(await post('snapshot', {body, proof:{device:binding.device, nonce, timestamp, signature}}, signal));
    }
  };
}

export function workSyncStorage() {
  let opening;
  async function run(mode, operation) {
    const db = await (opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('opcb.results-report.work-sync', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('private');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
      request.onerror = request.onblocked = () => reject(Error('模版同步的本机存储不可用'));
    }));
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('private', mode);
      const request = operation(transaction.objectStore('private'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(Error('模版同步的本机读写未完成'));
    });
  }
  return {
    get:key => run('readonly', store => store.get(key)),
    put:(key, value) => run('readwrite', store => store.put(value, key))
  };
}

export function personalBindingChannels(session) {
  const list = session.channels.list();
  if (list.status !== 'ready') return [];
  return list.channels.filter(channel => channel.channelType === 'solo' && (channel.visibility === 'private' || channel.private) &&
    !channel.readOnly && !channel.archived && !channel.pending && !channel.cached &&
    !channel.metadataPending && !channel.metadataCached && channel.members?.includes(session.viewer));
}

export async function publishWorkSyncBinding(session, channelId, content, signal) {
  const outbox = session.outbox;
  if (!outbox?.supports?.(45010)) throw Error('当前 Buzz 版本不支持原生身份绑定');
  await outbox.ready();
  signal.throwIfAborted();
  if (!personalBindingChannels(session).some(channel => channel.id === channelId)) throw Error('请选择个人私有 Solo');
  return new Promise((resolve, reject) => {
    let id, unsubscribe, checking = false, timer;
    const finish = (error, event) => {
      clearTimeout(timer);
      unsubscribe?.();
      signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(event);
    };
    const abort = () => finish(signal.reason);
    const inspect = async () => {
      if (!id || signal.aborted) return;
      const item = outbox.snapshot().find(row => row.event.id === id);
      if (item?.delivery === 'failed') finish(Error('Buzz 拒绝了身份绑定记录'));
      else if (item?.signed && ['accepted', 'seen'].includes(item.delivery)) finish(null, item.signed);
      else if (!item && !checking && session.read) {
        checking = true;
        try {
          const events = await session.read([{ids:[id], kinds:[45010], '#h':[channelId], limit:1}], {signal});
          const event = events.find(row => row.id === id && row.content === content && row.sig);
          if (event && !signal.aborted) finish(null, event);
        } catch { /* Keep listening for the outbox receipt until the timeout. */ }
        finally { checking = false; }
      }
    };
    unsubscribe = outbox.subscribe(inspect);
    signal.addEventListener('abort', abort, {once:true});
    timer = setTimeout(() => finish(Error('Buzz 身份绑定未确认，请稍后重试')), 20000);
    try {
      id = outbox.send({kind:45010, content, tags:[['ar','1'], ['d',crypto.randomUUID()], ['h',channelId],
        ['type','opcb.work-sync.identity'], ['title','模版工厂身份绑定'], ['op','create']]}, undefined, () => !signal.aborted);
      void inspect();
    } catch (error) { finish(error); }
  });
}

export function createWorkSyncFeed({client, storage, key, identity, access, onState}) {
  let binding, snapshot, active, initialized = false, disposed = false, permitted = false;
  let state = {};
  const show = next => {
    state = {snapshot, needsBinding:!binding && permitted, ...next};
    if (!disposed) onState(state);
  };
  const check = signal => {
    signal.throwIfAborted();
    if (disposed || !permitted || !access()) throw Error('模版工厂频道权限已变化');
  };
  async function run(operation) {
    if (active || disposed || !permitted) return;
    const controller = active = new AbortController(), {signal} = controller;
    show({busy:true, notice:'正在读取模版工厂…'});
    try {
      check(signal);
      await operation(signal);
    } catch (error) {
      if (signal.aborted || disposed) return;
      if ([401, 403].includes(error.status)) {
        snapshot = undefined;
        if (error.status === 401) binding = undefined;
        show({notice:error.status === 401 ? '请重新连接模版工厂。' : '当前身份无权读取模版工厂。'});
        try { await storage.put(key, {binding}); } catch { /* The on-screen data has already been cleared. */ }
      } else {
        show({notice:snapshot ? '同步未完成，显示上次成功的数据。' : '模版工厂暂时无法读取。'});
        throw error;
      }
    } finally {
      if (active === controller) active = undefined;
    }
  }
  async function fetchSnapshot(signal) {
    if (!binding) { show({notice:'连接后可读取频道交付。'}); return; }
    const result = await client.snapshot(binding, signal);
    check(signal);
    if (snapshot && result.revision < snapshot.revision) throw Error('模版工厂返回了旧版本');
    snapshot = result;
    show({});
    await storage.put(key, {binding, snapshot}).catch(() => {});
  }
  return {
    roster(allowed) {
      if (disposed || permitted === allowed && (initialized || state.notice)) return;
      permitted = allowed;
      if (!allowed) {
        active?.abort();
        active = undefined;
        if (initialized) void storage.put(key, {binding}).catch(() => {});
        snapshot = undefined;
        show({notice:'当前身份无权读取模版工厂。'});
        return;
      }
      initialized = true;
      void run(async signal => {
        const stored = await storage.get(key);
        check(signal);
        binding = stored?.binding;
        if (binding && stored?.snapshot) snapshot = readWorkSyncSnapshot(stored.snapshot);
        if (snapshot) show({notice:'当前显示本机缓存。'});
        else await fetchSnapshot(signal);
      }).catch(() => {});
    },
    refresh() { return run(fetchSnapshot).catch(() => {}); },
    bind(publish) {
      return run(async signal => {
        const nextBinding = await client.bind(identity, publish, signal);
        check(signal);
        await storage.put(key, {binding:nextBinding});
        check(signal);
        binding = nextBinding;
        await fetchSnapshot(signal);
      });
    },
    status() { return state; },
    dispose() { disposed = true; active?.abort(); }
  };
}
