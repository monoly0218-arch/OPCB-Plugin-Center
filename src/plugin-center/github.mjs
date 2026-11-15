// Native host requests do not add a User-Agent. GitHub requires one even for
// public repositories; this is a product identifier, not an account credential.
export const GITHUB_HEADERS = Object.freeze({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'OPCB-Plugin-Center',
});

export function githubDirectoryError(response) {
  const headers = Object.fromEntries(Object.entries(response.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const limited = response.status === 429 || response.status === 403 && (
    headers['x-ratelimit-remaining'] === '0' || !!headers['retry-after'] ||
    /(?:API rate limit exceeded|secondary rate limit)/i.test(response.body || '')
  );
  if (limited) return 'GitHub 暂时限制访问，请稍后刷新';
  if (response.status === 403) return 'GitHub 拒绝目录请求（403），请检查插件版本与仓库访问权限';
  return `目录读取失败（${response.status}）`;
}
