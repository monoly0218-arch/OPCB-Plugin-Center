// Only the native comparison establishes release identity. ID membership cannot.
export function installationStatus(installer, id) {
  try {
    const status = installer?.getInstallationStatus?.(id);
    return ['installed', 'absent'].includes(status) ? status : 'unavailable';
  } catch { return 'unavailable'; }
}

export function releaseState(installer, entry, source, directory) {
  if(directory?.installationStatus==='ready') {
    const installed=directory.installations.find(row=>row.id===entry.id);
    if(!installed)return 'absent';
    if(!entry.release)return 'unknown';
    return installed.revision===entry.release.revision?'current':'different';
  }
  const membership = installationStatus(installer, entry.id);
  if (membership === 'absent') return 'absent';
  if (membership !== 'installed') return 'unavailable';
  if (!entry.release || !source || typeof installer?.compareInstallationRelease !== 'function') return 'unknown';
  try {
    const comparison = installer.compareInstallationRelease(entry.id, {source, release: entry.release});
    return ['current', 'different', 'review'].includes(comparison) ? comparison : 'unknown';
  } catch { return 'unknown'; }
}

export function releaseAction(state) {
  return state === 'current' ? {label: '已安装', disabled: true}
    : state === 'different' || state === 'review' ? {label: '检查更新', disabled: false}
    : state === 'unknown' ? {label: '核对版本', disabled: false}
    : {label: '审阅安装', disabled: false};
}

// Catalog versions are labels, including date versions and rc.N. This selects
// the latest published label only; it never compares a local release/version.
export function compareCatalogVersions(left, right) {
  const parts = value => value.match(/[0-9]+|[^0-9]+/g) || [];
  const a = parts(left), b = parts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined) return /^[-+]/.test(b[i]) ? 1 : -1;
    if (b[i] === undefined) return /^[-+]/.test(a[i]) ? -1 : 1;
    if (/^\d+$/.test(a[i]) && /^\d+$/.test(b[i])) {
      const x = BigInt(a[i]), y = BigInt(b[i]);
      if (x !== y) return x > y ? 1 : -1;
    } else return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export function currentEntries(entries, history = false) {
  if (history) return entries;
  const selected = new Map();
  for (const entry of entries) {
    if (entry.legacy) continue;
    // The two Higgsfield products share an ID; preserve the explicitly separate
    // 1.3 and optional 1.4 lines rather than silently selecting the other product.
    const key = entry.id + (entry.id === 'opcb.higgsfield-mailbox' && /^1\.4(?:[-.]|$)/.test(entry.version) ? ':1.4' : '');
    const previous = selected.get(key);
    if (!previous || compareCatalogVersions(entry.version, previous.version) > 0) selected.set(key, entry);
  }
  return [...selected.values()];
}
