import {canonicalRepository} from './sync-plan.mjs';

const HEX = /^[0-9a-f]{64}$/;
export function validateInstallations(value) {
  if (!Array.isArray(value?.plugins) || value.plugins.length > 1000) throw Error('本机插件清单不可用');
  const ids = new Set();
  return value.plugins.map(row => {
    if (typeof row?.id !== 'string' || ids.has(row.id) || typeof row.bundled !== 'boolean' || typeof row.enabled !== 'boolean' || (row.bundled ? row.revision !== 'bundled' : !HEX.test(row.revision))) throw Error('本机插件版本信息不完整');
    ids.add(row.id);
    return {id:row.id,revision:row.revision,bundled:row.bundled,enabled:row.enabled,source:row.source,pendingRequest:row.pendingRequest};
  });
}

// The official architecture documents pluginRequests as reachable from trusted
// plugin scopes. Use forAgent.list ONLY, attributed to the real current viewer.
// All changes stay in pluginInstaller.requestInstall, with explicit native review.
// Never call request, disable, settle or management APIs through this service.
export function createNativeReview(requests, relay, navigation, installer) {
  const supported = typeof requests?.forAgent === 'function';
  function connection() {
    const snapshot = relay?.snapshot?.();
    if (snapshot?.status !== 'ready' || !HEX.test(snapshot.viewer)) throw Error('请先连接当前社区，再核对本机版本');
    const viewer = snapshot.viewer, scope = snapshot.scope;
    const profile = snapshot.session?.profiles?.snapshot?.().get(viewer);
    const live = () => {const next=relay.snapshot();return next.status==='ready'&&next.viewer===viewer&&next.scope===scope;};
    return {api:requests.forAgent({pubkey:viewer,name:profile?.display_name||profile?.name||'本人（插件中心）',live}),live};
  }
  async function openReview() {
    const result = await navigation?.open?.({version:1,kind:'settings',section:'plugins'});
    return result?.status === 'opened';
  }
  return {
    supported,
    subscribe(listener) {return typeof requests?.subscribe === 'function' ? requests.subscribe(listener) : ()=>{};},
    async list() {
      if (!supported) throw Error('当前 Buzz 不提供本机版本读取');
      const {api,live} = connection();
      const result = validateInstallations(await api.list());
      if (!live()) throw Error('账号或社区已切换，请重新核对版本');
      return result;
    },
    async review(entry, source) {
      const {api,live} = connection();
      const rows = validateInstallations(await api.list());
      if (!live()) throw Error('账号或社区已切换，未发起审核');
      const installed = rows.find(row=>row.id===entry.id);
      if (installed?.revision === entry.release?.revision) return `${entry.name}已安装，与线上此版本一致`;
      if (installed?.pendingRequest) {
        await openReview();
        return `${entry.name}已有待审核操作，请先在原生审核中处理`;
      }
      if (installed?.bundled) throw Error('宿主自带插件随 Buzz 更新');
      if (installed && (installed.source?.kind !== 'git' || !canonicalRepository(installed.source.repository))) throw Error('此插件来自其他来源，请在原生插件管理中核对来源后更新');
      if(typeof installer?.requestInstall!=='function')throw Error('当前 Buzz 无法打开原生安装审核');
      // Use the saved spelling (including .git) and the catalog's immutable
      // release pin. Native review enforces the existing folder/source match.
      const target = installed ? {...source,repository:installed.source.repository} : source;
      const outcome = await installer.requestInstall(target);
      if(outcome==='cancelled')return '审核已关闭，未确认新的安装操作';
      if(outcome!=='installed'&&outcome!=='updated')return '原生审核暂不可用，请先关闭其他审核后重试';
      if(!live())return '原生审核已完成；账号或社区已切换，请重新核对本机版本';
      const latest=validateInstallations(await api.list()).find(row=>row.id===entry.id);
      if(latest?.revision!==entry.release?.revision)return '原生审核已完成，尚未核验到目标版本，请刷新本机状态';
      return outcome==='updated'?`${entry.name}已更新`:`${entry.name}已安装`;

    },
  };
}
