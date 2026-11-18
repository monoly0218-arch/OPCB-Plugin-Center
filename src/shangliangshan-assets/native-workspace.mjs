import {roleBinding} from '../media-workspace/role-binding.mjs';
import {assetAllowed,assetMediaUrl} from './model.mjs';
// One original-site session per current Buzz identity, retained briefly across visits.
// It neither copies nor reads the browser's storage; no cookies leave Python.
export function createAssetWorkspace(ctx) {
  let connection, epoch = 0, client, opening, connecting, disposed = false;
  let confirmed, idleTimer, attached = 0, trashQueue = Promise.resolve();
  const pendingTrash = new Set();
  const idleMs = 30000;
  let state = {data: null, members: [], loading: false, error: '', media: {}, base: ''};
  const listeners = new Set(), images = new Map();
  let imageBytes = 0;
  const publish = patch => { state = {...state, ...patch}; listeners.forEach(fn => fn()); };
  const updateData = (patch = {}) => {
    const data = confirmed && pendingTrash.size
      ? {...confirmed, assets: confirmed.assets.filter(a => !pendingTrash.has(a.id))}
      : confirmed;
    publish({...patch, data, pendingTrash: pendingTrash.size});
  };
  function closeWhenIdle() {
    clearTimeout(idleTimer);
    if (!attached && !pendingTrash.size && !connecting && !state.loading && client) idleTimer = setTimeout(close, idleMs);
  }
  const check = (version = epoch) => {
    const now = ctx.relay.snapshot();
    if (disposed || version !== epoch || now.status !== 'ready' || now.cached || now.session !== connection?.session || now.session?.viewer !== connection?.session?.viewer || now.scope !== connection?.scope || now.generation !== connection?.generation) throw Error('账号、社区或资产页面已变化');
  };
  const close = () => {
    clearTimeout(idleTimer);
    epoch++; client?.close(); client = undefined; opening = undefined; connecting = undefined;
    pendingTrash.clear(); confirmed = null; trashQueue = Promise.resolve();
    images.clear(); imageBytes = 0;
    updateData({members: [], media: {}, base: '', loading: false, error: ''});
  };
  async function start() {
    check(); if (client) return client; if (opening) return opening;
    const version = epoch;
    opening = (async () => {
      if (typeof ctx.host?.spawn !== 'function') throw Error('此设备暂不支持原生资产会话');
      let child, buffer = '', ready, fail, base = '', stopped = false, next = 0;
      const pending = new Map();
      const started = new Promise((resolve, reject) => { ready = resolve; fail = reject; }); started.catch(() => {});
      const stop = () => {
        if (stopped) return; stopped = true; fail(Error('资产会话已关闭'));
        pending.forEach(item => { clearTimeout(item.timer); item.reject(Error('资产会话已关闭')); }); pending.clear();
        if (child) void child.kill().catch(() => {});
      };
      const timer = setTimeout(() => { fail(Error('资产会话启动超时，请检查 Python 3')); stop(); }, 15000);
      try {
        child = await ctx.host.spawn('asset-session', {onStdout(chunk) {
          if (stopped) return; buffer += chunk;
          if (buffer.length > 24 * 1024 * 1024) { stop(); return; }
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
            try {
              const result = JSON.parse(line);
              if (result.ready) {
                if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{43}\/$/.test(result.base)) throw Error();
                base = result.base; ready(); continue;
              }
              const item = pending.get(result.id); if (!item) continue;
              pending.delete(result.id); clearTimeout(item.timer);
              if (result.error) {
                if (result.authExpired && version === epoch) { images.clear(); imageBytes = 0; confirmed = null; updateData({media: {}, error: result.error}); }
                item.reject(Object.assign(Error(result.error), {rejected: result.rejected === true}));
              } else item.resolve(result.result);
            } catch { stop(); }
          }
        }});
        check(version); if (stopped) throw Error('资产会话已关闭');
        const exited=()=>{stop();if(version===epoch){client=undefined;confirmed=null;updateData({media:{},base:'',error:'资产会话已结束，请重新进入'});}};
        child.exited.then(exited, exited);
        const code = typeof OPCB_ASSET_SESSION_SOURCE === 'string' ? OPCB_ASSET_SESSION_SOURCE : '';
        if (!code) throw Error('原生资产会话未打包');
        const input = JSON.stringify(code) + '\n';
        for (let offset = 0; offset < input.length; offset += 16384) { check(version); await child.write(input.slice(offset, offset + 16384)); }
        await started; check(version);
        const api = {base, close: stop, call(action, args = {}) {
          check(version); if (stopped) return Promise.reject(Error('资产会话已关闭，请重新进入'));
          const id = String(++next);
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(Error('资产读取超时，请重试')); }, 75000);
            pending.set(id, {resolve, reject, timer});
            child.write(JSON.stringify({id, action, ...args}) + '\n').catch(() => {
              const item = pending.get(id); pending.delete(id); clearTimeout(timer); item?.reject(Error('资产会话不可用，请重新进入'));
            });
          });
        }};
        client = api; return api;
      } catch (e) { stop(); throw e; }
      finally { clearTimeout(timer); if (version === epoch) opening = undefined; }
    })();
    return opening;
  }
  async function run(action) {
    check(); if(state.loading)throw Error('上一项资产读取尚未完成'); const version = epoch; publish({loading: true, error: ''});
    try { return await action(version); }
    catch (error) { if (version === epoch) publish({error: error.message}); throw error; }
    finally { if (version === epoch) {publish({loading: false});closeWhenIdle();} }
  }
  function accept(value, base) {
    if (!value || !Array.isArray(value.data?.assets) || !Array.isArray(value.data.files) || !value.data.user?.id || !value.media || typeof value.media !== 'object' || Array.isArray(value.media) || !value.data.assets.every(a=>a&&typeof a.id==='string'&&typeof a.title==='string'&&Array.isArray(a.versions))) throw Error('资产数据回读不完整');
    if(value.data.user.id!==roleBinding(connection,'assets').member){close();throw Error('资产身份已变化，请重新连接');}
    confirmed = value.data;
    updateData({media: value.media, base, error: ''});
  }
  async function trash(ids) {
    check();
    const data = confirmed;
    const assets = new Map(data?.assets.map(a => [a.id, a]));
    const batch = [...new Set(ids)];
    if (!batch.length || batch.some(id => {
      const asset = assets.get(id);
      return !asset || asset.trashed || pendingTrash.has(id) || !assetAllowed(data, 'delete', asset);
    })) throw Error('素材已变化或无删除权限，请重新选择');
    const items = batch.map(id => ({id, revision: assets.get(id).revision}));
    const version = epoch;
    for (const id of batch) pendingTrash.add(id);
    updateData({error: ''});
    const completion = trashQueue.then(async () => {
      check(version);
      const api = await start();
      try {
        const value = await api.call('lifecycle', {args: {operation: 'trash', items}});
        check(version);
        accept(value, api.base);
        return value.mutation.result;
      } catch (error) {
        check(version);
        // A lost response does not tell us whether the write committed. Read once
        // before rolling back the local view; never send the deletion again.
        if (!error.rejected && confirmed) {
          try {
            const value = await api.call('state');
            check(version);
            accept(value, api.base);
            const current = new Map(confirmed.assets.map(a => [a.id, a]));
            if (items.every(item => {
              const asset = current.get(item.id);
              return asset?.trashed && asset.trashedById === confirmed.user.id && asset.revision === item.revision + 1;
            })) return {count: batch.length, items: items.map(({id}) => ({id, revision: current.get(id).revision}))};
          } catch { /* Keep the last confirmed list if the connection is unavailable. */ }
        }
        if (version === epoch) publish({error: '未能确认删除：' + error.message});
        throw error;
      }
    }).finally(() => {
      if (version !== epoch) return;
      for (const id of batch) pendingTrash.delete(id);
      updateData();
      closeWhenIdle();
    });
    trashQueue = completion.catch(() => {});
    return completion;
  }
  return {
    snapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    bind(next) {
      if (next.status !== 'ready' || next.cached || connection?.session !== next.session || connection?.session?.viewer !== next.session?.viewer || connection?.scope !== next.scope || connection?.generation !== next.generation) close();
      connection = next;
    },
    attach() {
      attached++;
      clearTimeout(idleTimer);
      return () => { attached--; closeWhenIdle(); };
    },
    connect() {
      if (connecting) return connecting;
      const version = epoch;
      const task = run(async () => {
        const binding = roleBinding(connection, 'assets');
        const api = await start();
        const value = confirmed ? await api.call('state') : await api.call('login', {member: binding.member});
        check(version);
        accept(value, api.base);
      });
      connecting = task.finally(() => {
        if (version === epoch) { connecting = undefined; closeWhenIdle(); }
      });
      return connecting;
    },
    async refresh() { return run(async version => { const api = await start(); const value = await api.call('state'); check(version); accept(value, api.base); }); },
    async copy(asset, platform) { const version = epoch, api = await start(); const value = await api.call('copy', {asset, platform}); check(version); if(!state.data||!value?.copy||typeof value.copy.caption!=='string')throw Error('平台文案回读无效'); return value; },
    async createFolder(name,collection='') {return run(async version=>{const api=await start(),value=await api.call('folder',{args:{name,collection}});check(version);accept(value,api.base);return value.mutation.folder;});},
    async assignFolder(ids,folderId) {return run(async version=>{const api=await start();const items=ids.map(id=>{const a=state.data.assets.find(a=>a.id===id);return {id,revision:a.revision,version:a.versions.at(-1).number};});const value=await api.call('assign',{args:{folderId,revision:state.data.folderRevision,items}});check(version);accept(value,api.base);return value.mutation;});},
    async share(ids,validity) {return run(async version=>{const api=await start();const items=ids.map(id=>{const a=state.data.assets.find(a=>a.id===id);return {id,revision:a.revision,version:a.versions.at(-1).number};});const value=await api.call('share',{args:{items,validity}});check(version);return value.mutation;});},
    async lifecycle(operation,ids,snapshot) {
      if(operation==='trash')return trash(ids);
      if(pendingTrash.size&&['purge','empty'].includes(operation))throw Error('素材仍在同步，请稍后再永久删除');
      return run(async version=>{const api=await start();const args=snapshot||{operation,items:ids.map(id=>{const a=state.data.assets.find(a=>a.id===id);return {id,revision:a.revision};})};const value=await api.call('lifecycle',{args});check(version);accept(value,api.base);return value.mutation.result;});},
    mediaUrl(raw) { const source = assetMediaUrl(raw), token = source && state.media[source]; return token && /^[A-Za-z0-9_-]{24}$/.test(token) && state.base ? state.base + token : undefined; },
    async image(raw) {
      check(); const source = assetMediaUrl(raw); if (!source || !state.media[source]) throw Error('当前图片不可访问');
      if (images.has(source)) return images.get(source).promise;
      const version = epoch, entry = {bytes: 0};
      const promise = (async () => { const api = await start(); const value = await api.call('image', {source}); check(version);
        if (typeof value !== 'string' || !/^data:image\/(?:jpeg|png|webp|gif|avif);base64,/.test(value) || value.length > 12 * 1024 * 1024) throw Error('图片数据无效');
        if(!state.data||!state.media[source])throw Error('资产权限已变化，请重新读取');
        if(images.get(source)===entry){entry.bytes = value.length; imageBytes += entry.bytes;}
        while (images.size && (images.size > 36 || imageBytes > 48 * 1024 * 1024)) { const key = images.keys().next().value; const old = images.get(key); images.delete(key); imageBytes -= old.bytes; }
        return value;
      })();
      entry.promise = promise; images.set(source, entry);
      promise.catch(() => { if (images.get(source) === entry) images.delete(source); }); return promise;
    },
    close,
    dispose() { close(); disposed = true; listeners.clear(); },
  };
}
