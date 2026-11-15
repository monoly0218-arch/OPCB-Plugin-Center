import {roleBinding} from '../media-workspace/role-binding.mjs';
import {assetMediaUrl} from './model.mjs';
// One fresh original-site session per current Buzz identity and mounted page.
// It neither copies nor reads the browser's storage; no cookies leave Python.
export function createAssetWorkspace(ctx) {
  let connection, epoch = 0, client, opening, disposed = false;
  let state = {data: null, members: [], loading: false, error: '', media: {}, base: ''};
  const listeners = new Set(), images = new Map();
  let imageBytes = 0;
  const publish = patch => { state = {...state, ...patch}; listeners.forEach(fn => fn()); };
  const check = (version = epoch) => {
    const now = ctx.relay.snapshot();
    if (disposed || version !== epoch || now.status !== 'ready' || now.cached || now.session !== connection?.session || now.session?.viewer !== connection?.session?.viewer || now.scope !== connection?.scope || now.generation !== connection?.generation) throw Error('账号、社区或资产页面已变化');
  };
  const close = () => {
    epoch++; client?.close(); client = undefined; opening = undefined;
    images.clear(); imageBytes = 0;
    publish({data: null, members: [], media: {}, base: '', loading: false, error: ''});
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
                if (result.authExpired && version === epoch) { images.clear(); imageBytes = 0; publish({data: null, media: {}, error: result.error}); }
                item.reject(Error(result.error));
              } else item.resolve(result.result);
            } catch { stop(); }
          }
        }});
        check(version); if (stopped) throw Error('资产会话已关闭');
        const exited=()=>{stop();if(version===epoch){client=undefined;publish({data:null,media:{},base:'',error:'资产会话已结束，请重新进入'});}};
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
    finally { if (version === epoch) publish({loading: false}); }
  }
  function accept(value, base) {
    if (!value || !Array.isArray(value.data?.assets) || !Array.isArray(value.data.files) || !value.data.user?.id || !value.media || typeof value.media !== 'object' || Array.isArray(value.media) || !value.data.assets.every(a=>a&&typeof a.id==='string'&&typeof a.title==='string'&&Array.isArray(a.versions))) throw Error('资产数据回读不完整');
    if(value.data.user.id!==roleBinding(connection,'assets').member){close();throw Error('资产身份已变化，请重新连接');}
    publish({data: value.data, media: value.media, base, error: ''});
  }
  return {
    snapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    bind(next) {
      if (connection?.session !== next.session || connection?.session?.viewer !== next.session?.viewer || connection?.scope !== next.scope || connection?.generation !== next.generation) { close(); connection = next; }
    },
    async connect() { return run(async version => {
      const binding=roleBinding(connection,'assets');
      const api=await start(), rows=await api.call('members'); check(version);
      if(!Array.isArray(rows)||rows.filter(r=>r.id===binding.member).length!==1)throw Error('原站尚未分配当前 Buzz 角色，请联系管理员开通');
      const value=await api.call('login',{member:binding.member});check(version);
      if(value?.data?.user?.id!==binding.member){close();throw Error('资产返回的成员与当前 Buzz 角色不一致');}
      images.clear();imageBytes=0;accept(value,api.base);
    }); },
    async refresh() { return run(async version => { const api = await start(); const value = await api.call('state'); check(version); accept(value, api.base); }); },
    async copy(asset, platform) { const version = epoch, api = await start(); const value = await api.call('copy', {asset, platform}); check(version); if(!state.data||!value?.copy||typeof value.copy.caption!=='string')throw Error('平台文案回读无效'); return value; },
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
