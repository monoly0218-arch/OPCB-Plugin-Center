// Read-only synchronization planning. Native Buzz review owns every mutation.
export const SYNC_REPOSITORY = 'monoly0218-arch/OPCB-Plugin-Center';
const isCommit = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const isRevision = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const ID = /^opcb\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const safePath = value => typeof value === 'string' && /^[a-zA-Z0-9._/-]+$/.test(value) &&
  !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..');

export function canonicalRepository(value) {
  if (typeof value !== 'string') return null;
  if (value === SYNC_REPOSITORY) return value;
  // Buzz records both HTTPS and SSH Git URLs; never accept a lookalike host/path.
  if ([`https://github.com/${SYNC_REPOSITORY}`, `https://github.com/${SYNC_REPOSITORY}.git`,
    `git@github.com:${SYNC_REPOSITORY}.git`, `ssh://git@github.com/${SYNC_REPOSITORY}.git`].includes(value)) return SYNC_REPOSITORY;
  return null;
}

export function validateBaseline(value) {
  if (value?.schema !== 1 || value.repository !== SYNC_REPOSITORY ||
    typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,79}$/.test(value.id) ||
    value.platform !== 'macos' || value.pluginApiVersion !== 1 ||
    !Array.isArray(value.targets) || !value.targets.length || value.targets.length > 100) throw Error('整套插件基线格式无效');
  const ids = new Set();
  for (const row of value.targets) {
    const source = row?.reviewSource;
    if (typeof row?.id !== 'string' || row.id.length > 80 || !ID.test(row.id) || ids.has(row.id) ||
      typeof row.name !== 'string' || !row.name || row.name.length > 80 ||
      typeof row.version !== 'string' || !row.version || row.version.length > 80 || typeof row.enabled !== 'boolean' ||
      !isRevision(row.revision) || !isRevision(row.codeSha256) || !isRevision(row.manifestSha256) || !isRevision(row.archiveSha256) ||
      !safePath(row.sourcePath) || !row.sourcePath.startsWith('plugins/') ||
      !safePath(row.downloadPath) || !row.downloadPath.startsWith('releases/') || !row.downloadPath.endsWith('.zip') ||
      source?.repository !== SYNC_REPOSITORY || !/^distribution\/[a-z0-9.-]+$/.test(source.reference) ||
      source.path !== '.' || !isCommit(source.commit)) throw Error('整套插件基线包含重复插件或无效固定来源');
    ids.add(row.id);
  }
  return value;
}

function installedPlugins(value) {
  if (!Array.isArray(value?.plugins) || value.plugins.length > 1000) throw Error('需要 Buzz plugin_list 返回的 plugins 数组');
  const ids = new Set();
  for (const row of value.plugins) {
    if (typeof row?.id !== 'string' || !row.id || ids.has(row.id)) throw Error('本机插件清单包含无效或重复 ID');
    ids.add(row.id);
  }
  return new Map(value.plugins.map(row => [row.id, row]));
}

export function planPluginSync(baseline, installed, {platform, hostVersion} = {}) {
  validateBaseline(baseline);
  const byId = installedPlugins(installed);
  const targets = baseline.targets.map(target => {
    const current = byId.get(target.id);
    const row = {id: target.id, name: target.name, version: target.version, expectedRevision: target.revision,
      expectedCommit: target.reviewSource.commit, expectedEnabled: target.enabled};
    if (platform !== baseline.platform) return {...row, state: 'blocked', reason: platform ? '整套基线仅验证 macOS，当前平台未验证' : '须先核对目标设备平台'};
    if (current?.bundled === true) return {...row, state: 'blocked', reason: '宿主自带插件 ID 冲突'};
    const reason = `对齐 OPCB 整套基线 ${baseline.id}：${target.name} ${target.version}`;
    if (!current) return {...row, state: 'install', request: {action: 'install', id: target.id,
      ...target.reviewSource, reason}, enableAfterReview: target.enabled};
    if (current.bundled !== false || typeof current.enabled !== 'boolean' || !isRevision(current.revision)) {
      return {...row, state: 'blocked', reason: '本机 revision 或启用状态未知，请重新读取原生插件清单'};
    }
    const source = current.source;
    if (source?.kind !== 'git' || !canonicalRepository(source.repository) ||
      (source.path !== undefined && source.path !== '.')) {
      return {...row, state: 'blocked', reason: '旧插件来自其他仓库、文件夹或不同子目录，需要独立核对换源；不自动卸载'};
    }
    if (!isCommit(source.commit) || typeof source.reference !== 'string' || !source.reference) {
      return {...row, state: 'blocked', reason: '已安装来源缺少固定提交或分支，请重新读取原生插件来源'};
    }
    if (current.revision !== target.revision || source.commit !== target.reviewSource.commit || source.reference !== target.reviewSource.reference) {
      // Native update uses the recorded repository and path. Do not pass a new
      // repository pretending that update can migrate an existing plugin.
      return {...row, state: 'update', request: {action: 'update', id: target.id,
        reference: target.reviewSource.reference, commit: target.reviewSource.commit, reason}, enableAfterReview: target.enabled};
    }
    if (current.enabled !== target.enabled) {
      if (!target.enabled) return {...row, state: 'blocked', reason: '此基线要求停用插件，须由本人单独确认'};
      return {...row, state: 'enable', request: {action: 'enable', id: target.id, reason}};
    }
    return {...row, state: 'aligned'};
  });
  const counts = {total: targets.length, aligned: 0, install: 0, update: 0, enable: 0, blocked: 0};
  for (const row of targets) counts[row.state]++;
  const baselineIds = new Set(baseline.targets.map(row => row.id));
  const warnings = [];
  if (!hostVersion) warnings.push('尚未核对目标设备 Buzz 版本；不要自动升级宿主');
  else if (hostVersion !== baseline.hostVersion) warnings.push(`本套实测 Buzz ${baseline.hostVersion}，当前为 ${hostVersion}；需核对 API 与加载情况`);
  return {schema: 1, baseline: baseline.id, repository: baseline.repository,
    platform: platform || 'unknown', hostVersion: hostVersion || 'unknown', counts,
    versionsAligned: counts.aligned === counts.total,
    runtimeVerified: false, businessAccessVerified: false,
    warnings, targets,
    preservedExtras: [...byId.values()].filter(row => !baselineIds.has(row.id) && row.bundled !== true).map(row => row.id),
    next: '逐项使用 request 发起 Buzz 原生审核；批准后重新读取 plugin_list 复算，plugin_status 核对 active 和错误。只生成计划不改变安装。'};
}
