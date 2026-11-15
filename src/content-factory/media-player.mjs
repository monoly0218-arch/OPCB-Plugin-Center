import {createAdaptiveVideo} from '../media-workspace/adaptive-video.mjs';
export async function startMediaStream(host, source, signal) {
  let child, buffer = '', ready, fail, settled = false;
  const promise = new Promise((resolve, reject) => { ready = resolve; fail = reject; });
  promise.catch(() => {});
  const stop = () => { fail(Error('预览已关闭')); if (child) void child.kill().catch(() => {}); };
  signal.addEventListener('abort', stop, {once: true});
  const timer = setTimeout(() => { fail(Error('视频预览启动超时，请检查 Python 3')); stop(); }, 15000);
  try {
    signal.throwIfAborted();
    child = await host.spawn('factory-media', {onStdout(data) {
      if (settled) return;
      buffer += data;
      if (buffer.length > 2048) { fail(Error('视频预览返回异常')); return; }
      if (!buffer.includes('\n')) return;
      try {
        const result = JSON.parse(buffer.trim());
        if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{43}\/media$/.test(result.url)) throw Error();
        settled = true; ready(result.url);
      } catch { fail(Error('视频预览地址无效')); }
    }});
    signal.throwIfAborted();
    child.exited.then(() => fail(Error('视频预览进程已退出')), () => fail(Error('视频预览进程失败')));
    const code = typeof OPCB_FACTORY_MEDIA_SOURCE === 'string' ? OPCB_FACTORY_MEDIA_SOURCE : '';
    if (!code) throw Error('视频预览组件未打包');
    const input = JSON.stringify(code) + '\n' + JSON.stringify({url: source}) + '\n';
    for (let offset = 0; offset < input.length; offset += 16384) {
      signal.throwIfAborted(); await child.write(input.slice(offset, offset + 16384));
    }
    const url = await promise;
    signal.throwIfAborted();
    return {url, close: stop};
  } catch (error) { stop(); signal.removeEventListener('abort', stop); throw error; }
  finally { clearTimeout(timer); }
}
export function createFactoryPlayer(ctx) {
  const R = ctx.react, h = R.createElement, AdaptiveVideo = createAdaptiveVideo(R);
  return function FactoryPlayer({source, poster, onOpenWebsite}) {
    const [url, setUrl] = R.useState(''), [error, setError] = R.useState(''), [attempt, retry] = R.useState(0);
    R.useEffect(() => {
      const controller = new AbortController(); let current;
      setUrl(''); setError('');
      if (typeof ctx.host.spawn !== 'function') { setError('此设备尚不支持内嵌视频'); return () => controller.abort(); }
      startMediaStream(ctx.host, source, controller.signal).then(value => {
        current = value;
        if (controller.signal.aborted) value.close(); else setUrl(value.url);
      }, e => { if (!controller.signal.aborted) setError(e.message); });
      return () => { controller.abort(); current?.close(); };
    }, [source, attempt]);
    return error ? h('div', {className: 'mw-media-unavailable', role: 'status'}, h('p', null, error),
      h('button', {type: 'button', onClick: () => retry(n => n + 1)}, '重试预览'),
      h('button', {type: 'button', onClick: onOpenWebsite}, '在完整工厂播放')) : url ?
      h(AdaptiveVideo, {key: url, src: url, poster,
        onError: () => setError('视频暂未加载，请刷新素材后重试')}) :
      h('div', {className: 'mw-media-unavailable', role: 'status'}, '正在读取视频…');
  };
}
