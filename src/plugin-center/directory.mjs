export const inject = ["react", "pages", "host"];
const PUBLISHED=[];
// Official released catalog: resolve this branch head before reading its registry.
export const CATALOG_REFERENCE='distribution/3dicons-catalog-20261115';
import {CONTRIBUTIONS,createContributionReader} from './contributors.mjs';
import {GITHUB_HEADERS,githubDirectoryError} from './github.mjs';
export const REPOSITORY = "monoly0218-arch/OPCB-Plugin-Center";
export const CATEGORIES = ["全部", "工作协作", "内容创作", "资料与资产", "账号与连接", "工具"];
export const categoryLabel = category => category === '工作协作' ? '团队协作' : category;

// Launch an existing installation without publishing its private device setup.
export function validateInstalledEntrypoints(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) throw Error('已安装入口格式无效');
  const ids = new Set();
  return value.map(row => {
    const id = bounded(row.id, 80), pageId = bounded(row.pageId, 80);
    if (!/^[a-z][a-z0-9.-]*$/.test(id) || id.includes('..') || id.endsWith('.') || ids.has(id) || !/^[a-z0-9][a-z0-9._-]*$/.test(pageId)) throw Error('已安装入口标识无效');
    ids.add(id);
    const category = bounded(row.category, 30);
    if (!CATEGORIES.includes(category) || category === '全部') throw Error('已安装入口分类无效');
    return {id, pageId, category, name: bounded(row.name, 80), summary: bounded(row.summary), requirements: bounded(row.requirements, 1200), version: 'installed', installedEntrypoint: true};
  });
}

function bounded(value, max = 600) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("目录字段缺失或超出长度限制");
  return value.trim();
}
function path(value) {
  const text = bounded(value, 240);
  if (text.startsWith("/") || !/^[a-zA-Z0-9._/-]+$/.test(text) || text.split("/").some(p => !p || p === "." || p === "..")) throw new Error("插件目录路径无效");
  return text;
}
export function validateRegistry(value) {
  if (value?.schema !== 1 || value.repository !== REPOSITORY || !Array.isArray(value.entries) || !value.entries.length || value.entries.length > 100) throw new Error("插件目录格式不受支持");
  const keys = new Set();
  return value.entries.map(row => {
    const id = bounded(row.id, 80), version = bounded(row.version, 80);
    if (!/^[a-z][a-z0-9.-]*$/.test(id) || id.includes("..") || id.endsWith(".") || keys.has(`${id}@${version}`)) throw new Error("目录包含无效或重复版本");
    keys.add(`${id}@${version}`);
    const entry = { id, version, name: bounded(row.name, 80), summary: bounded(row.summary), requirements: bounded(row.requirements, 1200), category: bounded(row.category, 30), sourcePath: path(row.sourcePath), downloadPath: path(row.downloadPath), legacy: row.legacy === true };
    if (row.icon !== undefined) {
      if (typeof row.icon !== 'string' || row.icon.length > 150000 || !/^data:image\/(?:png|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(row.icon)) throw new Error('插件图标必须是本地内嵌图片');
      entry.icon = row.icon;
    }
    if (!CATEGORIES.includes(entry.category) || entry.category === "全部" || !entry.sourcePath.startsWith("plugins/") || !entry.downloadPath.startsWith("releases/") || !entry.downloadPath.endsWith(".zip")) throw new Error("插件分类或分发路径无效");
    if (row.reviewSource) {
      const source = row.reviewSource;
      if (source.repository !== REPOSITORY || !/^distribution\/[a-z0-9.-]+$/.test(source.reference) || source.path !== "." || !/^[0-9a-f]{40}$/.test(source.commit)) throw new Error("独立安装来源无效");
      entry.reviewSource = { repository: `https://github.com/${REPOSITORY}.git`, reference: source.reference, path: ".", commit: source.commit };
    }
    return entry;
  });
}
export function installSource(entry, commit) {
  if (entry.installedEntrypoint) throw Error('此入口使用本机已安装插件，不发起安装');
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("目录尚未固定版本，请刷新后重试");
  return entry.reviewSource || { repository: `https://github.com/${REPOSITORY}.git`, reference: "main", path: entry.sourcePath, commit };
}
// The central main catalog can lag an independently published release. Only
// replace its known old snapshot; never override an unknown newer release.
export function withPublishedReleases(entries) { return entries; }
export function entryLinks(entry, commit) {
  const published=PUBLISHED.some(e=>e.id===entry.id&&e.version===entry.version&&e.reviewSource.commit===entry.reviewSource?.commit);
  const base=`https://github.com/${REPOSITORY}`;
  return published?{source:`${base}/tree/${entry.reviewSource.commit}`,download:`${base}/archive/${entry.reviewSource.commit}.zip`}
    :{source:`${base}/tree/${commit}/${entry.sourcePath}`,download:`${base}/raw/${commit}/${entry.downloadPath}`};
}
export async function loadDirectory(request, alive = () => true) {
  async function read(url) {
    const response = await request({ url, method: "GET", timeoutMs: 15000, headers: GITHUB_HEADERS });
    if (!alive()) throw new Error("插件已关闭");
    if (response.status !== 200) throw new Error(githubDirectoryError(response));
    if (typeof response.body !== "string" || response.body.length > 800000) throw new Error("目录响应超出限制");
    try { return JSON.parse(response.body); } catch { throw new Error("目录响应不是有效 JSON"); }
  }
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  const head = await read(`${base}/commits/${encodeURIComponent(CATALOG_REFERENCE)}`);
  if (!/^[0-9a-f]{40}$/.test(head.sha)) throw new Error("无法核对仓库版本");
  const file = await read(`${base}/contents/REGISTRY.json?ref=${head.sha}`);
  if (file.encoding !== "base64" || typeof file.content !== "string") throw new Error("插件目录文件不可用");
  let json;
  try { json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), c => c.charCodeAt(0)))); } catch { throw new Error("插件目录内容损坏"); }
  return { commit: head.sha, entries: withPublishedReleases(validateRegistry(json)), installedEntrypoints: validateInstalledEntrypoints(json.installedEntrypoints) };
}
export function createDirectoryStore(request, installer, navigation) {
  let state = { status: "idle", entries: [], installedEntrypoints: [], commit: "", error: "", busy: "", notice: "", contributions:CONTRIBUTIONS, creditError:'' }, disposed = false, loading = false, creditGeneration=0;
  const readContributions=createContributionReader(request);
  const listeners = new Set();
  const set = patch => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); } };
  return {
    snapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { disposed = true;creditGeneration++;listeners.clear(); },
    async open(entry) {
      if (disposed || state.busy || !state.installedEntrypoints.includes(entry)) return;
      try {
        if (installer?.getInstallationStatus?.(entry.id) !== 'installed') { set({notice:'请先完成团队日历的设备安装与授权，再刷新目录。'}); return; }
        if (typeof navigation?.open !== 'function') { set({notice:'当前 Buzz 无法从插件中心打开日历，请使用团队日历原有入口。'}); return; }
        set({busy:`${entry.id}@${entry.version}`, notice:''});
        const result = await navigation.open({version:1, kind:'plugin', pluginId:entry.id, pageId:entry.pageId});
        if (result?.status !== 'opened') set({notice:'日历尚未打开，请在插件管理中核对它是否已启用。'});
      } catch { set({notice:'日历尚未打开，请在插件管理中核对它是否已启用。'}); }
      finally { set({busy:''}); }
    },
    async refresh() {
      if (disposed || loading || state.busy) return;
      loading = true;const generation=++creditGeneration; set({ status: "loading", error: "", notice: "" });
      try { const directory = await loadDirectory(request, () => !disposed); set({ ...directory, status: "ready" });
        void readContributions(directory.entries,()=>!disposed&&generation===creditGeneration,directory.commit).then(contributions=>{if(!disposed&&generation===creditGeneration)set({contributions,creditError:''});},()=>{if(!disposed&&generation===creditGeneration)set({creditError:'贡献记录暂未刷新'});});
      }
      catch (error) { set({ status: "error", error: error.message || "目录读取失败，请重试" }); }
      finally { loading = false; }
    },
    async review(entry) {
      if (disposed || state.status !== "ready" || state.busy || !state.entries.includes(entry)) return;
      if (typeof installer?.requestInstall !== "function") { set({ notice: "当前宿主不支持安装审核，请更新 Buzz 后重试。你仍可查看源码和下载包。" }); return; }
      set({ busy: `${entry.id}@${entry.version}`, notice: "" });
      try {
        const result = await installer.requestInstall(installSource(entry, state.commit));
        set({ notice: result === "installed" ? `${entry.name}已安装` : result === "updated" ? `${entry.name}已更新` : result === "cancelled" ? "审核已关闭，未确认新的安装操作" : "宿主暂时无法打开审核，请先关闭其他安装审核后重试" });
      } catch { set({ notice: "安装审核未完成。仓库版本可能已变化，请刷新目录后重试；也可在宿主中查看具体原因。" }); }
      finally { set({ busy: "" }); }
    },
  };
}
