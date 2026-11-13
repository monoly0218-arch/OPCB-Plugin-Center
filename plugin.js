export const inject = ["react", "pages", "host"];
export const REPOSITORY = "monoly0218-arch/OPCB-Plugin-Center";
export const CATEGORIES = ["全部", "工作协作", "内容创作", "资料与资产", "账号与连接", "工具"];

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
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("目录尚未固定版本，请刷新后重试");
  return entry.reviewSource || { repository: `https://github.com/${REPOSITORY}.git`, reference: "main", path: entry.sourcePath, commit };
}
export async function loadDirectory(request, alive = () => true) {
  async function read(url) {
    const response = await request({ url, method: "GET", timeoutMs: 15000, headers: { Accept: "application/vnd.github+json" } });
    if (!alive()) throw new Error("插件已关闭");
    if (response.status !== 200) throw new Error(response.status === 403 || response.status === 429 ? "GitHub 暂时限制访问，请稍后刷新" : `目录读取失败（${response.status}）`);
    if (typeof response.body !== "string" || response.body.length > 800000) throw new Error("目录响应超出限制");
    try { return JSON.parse(response.body); } catch { throw new Error("目录响应不是有效 JSON"); }
  }
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  const head = await read(`${base}/commits/main`);
  if (!/^[0-9a-f]{40}$/.test(head.sha)) throw new Error("无法核对仓库版本");
  const file = await read(`${base}/contents/REGISTRY.json?ref=${head.sha}`);
  if (file.encoding !== "base64" || typeof file.content !== "string") throw new Error("插件目录文件不可用");
  let json;
  try { json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(file.content.replace(/\s/g, "")), c => c.charCodeAt(0)))); } catch { throw new Error("插件目录内容损坏"); }
  return { commit: head.sha, entries: validateRegistry(json) };
}
export function createDirectoryStore(request, installer) {
  let state = { status: "idle", entries: [], commit: "", error: "", busy: "", notice: "" }, disposed = false, loading = false;
  const listeners = new Set();
  const set = patch => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(fn => fn()); } };
  return {
    snapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    dispose() { disposed = true; listeners.clear(); },
    async refresh() {
      if (disposed || loading || state.busy) return;
      loading = true; set({ status: "loading", error: "", notice: "" });
      try { const directory = await loadDirectory(request, () => !disposed); set({ ...directory, status: "ready" }); }
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

export function apply(ctx) {
  const React = ctx.react, h = React.createElement;
  const installer = ctx.reflect.get("pluginInstaller");
  const store = createDirectoryStore(options => ctx.host.request(options), installer);
  ctx.effect(() => () => store.dispose());
  const muted = { color: "var(--text-subtle, #666)", fontSize: 14, lineHeight: 1.6 };
  const line = "1px solid var(--border-standard, rgba(127,127,127,.22))";
  const control = { minHeight: 40, borderRadius: 8, padding: "8px 12px", border: line, color: "var(--text-standard, #171717)", background: "var(--surface-panel, #fff)", font: "inherit", cursor: "pointer" };
  function Page() {
    const directory = React.useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
    const [query, setQuery] = React.useState(""), [category, setCategory] = React.useState("全部"), [filter, setFilter] = React.useState("all"), [history, setHistory] = React.useState(false), [statuses, setStatuses] = React.useState({});
    React.useEffect(() => { if (store.snapshot().status === "idle") void store.refresh(); }, []);
    React.useEffect(() => {
      let live = true;
      const off = [], current = {};
      const valid = status => ["installed", "absent", "unavailable"].includes(status) ? status : "unavailable";
      for (const id of new Set(directory.entries.map(e => e.id))) {
        if (typeof installer?.subscribeInstallationStatus === "function") off.push(installer.subscribeInstallationStatus(id, status => { if (live) setStatuses(previous => ({ ...previous, [id]: valid(status) })); }));
        current[id] = typeof installer?.getInstallationStatus === "function" ? valid(installer.getInstallationStatus(id)) : "unavailable";
      }
      setStatuses(current);
      return () => { live = false; off.forEach(fn => { if (typeof fn === "function") fn(); }); };
    }, [directory.entries]);
    const active = directory.entries.filter(e => !e.legacy);
    const entries = directory.entries.filter(e => (history || !e.legacy) && (category === "全部" || category === e.category) && (filter === "all" || (filter === "installed" && statuses[e.id] === "installed") || (filter === "absent" && statuses[e.id] === "absent")) && `${e.name} ${e.summary} ${e.requirements}`.toLowerCase().includes(query.trim().toLowerCase()));
    const url = suffix => `https://github.com/${REPOSITORY}/${suffix}`;
    const link = (label, href) => h("a", { href, target: "_blank", rel: "noopener noreferrer", style: { color: "inherit", textUnderlineOffset: 4, fontSize: 14 } }, label);
    return h("main", { "data-plugin-center": true, style: { boxSizing: "border-box", width: "100%", maxWidth: 1440, margin: "0 auto", padding: "clamp(20px, 4vw, 40px)", fontFamily: "inherit", fontSize: 16, lineHeight: 1.6, color: "var(--text-standard, #171717)", overflowY: "auto", minWidth: 0 } },
      h("header", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 20, marginBottom: 28 } },
        h("div", null, h("p", { style: { ...muted, margin: "0 0 4px" } }, "OPCB / 共用工具"), h("h1", { style: { margin: 0, fontSize: 28, lineHeight: 1.4, fontWeight: 500 } }, "插件中心"), h("p", { style: { ...muted, margin: "8px 0 0" } }, "找到工具，核对依赖，审阅后安装")),
        h("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16 } }, link("仓库与提交", `https://github.com/${REPOSITORY}`), h("button", { type: "button", style: control, disabled: directory.status === "loading" || !!directory.busy, onClick: () => store.refresh() }, directory.status === "loading" ? "刷新中…" : "刷新目录"))),
      h("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 24px", borderTop: line, borderBottom: line, padding: "16px 0", marginBottom: 24 } },
        h("span", null, h("strong", { style: { fontWeight: 500, fontSize: 24, fontVariantNumeric: "tabular-nums" } }, directory.commit ? new Set(active.map(e => e.id)).size : "—"), " 项工具"),
        h("span", { style: muted }, directory.commit ? `来源版本 ${directory.commit.slice(0, 7)}` : "正在读取仓库目录"), h("span", { style: muted }, "安装状态来自本机宿主；具体版本请在审核中核对")),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 } },
        h("input", { type: "search", "aria-label": "搜索插件", placeholder: "搜索插件或用途", value: query, onChange: e => setQuery(e.target.value), style: { ...control, flex: "1 1 240px", minWidth: 0, cursor: "text" } }),
        h("select", { "aria-label": "安装状态", value: filter, onChange: e => setFilter(e.target.value), style: control }, h("option", { value: "all" }, "全部状态"), h("option", { value: "installed" }, "已安装"), h("option", { value: "absent" }, "未安装"))),
      h("nav", { "aria-label": "插件分类", style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 } }, ...CATEGORIES.map(name => h("button", { key: name, type: "button", "aria-pressed": category === name, onClick: () => setCategory(name), style: { ...control, minHeight: 36, padding: "4px 12px", borderColor: category === name ? "var(--text-standard, #171717)" : "transparent", background: category === name ? "var(--surface-inset, #f1f1f2)" : "transparent" } }, name))),
      directory.error ? h("p", { role: "alert", style: { ...muted, padding: 16, border: line, borderRadius: 8 } }, `${directory.error}。${directory.entries.length ? "下方保留上次目录，刷新成功后再安装。" : "点击刷新目录重试。"}`) : null,
      directory.notice ? h("p", { role: "status", style: { padding: 16, borderLeft: "2px solid var(--border-standard, #888)", background: "var(--surface-inset, #f1f1f2)" } }, directory.notice) : null,
      h("div", { "aria-busy": directory.status === "loading", style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16 } }, ...entries.map(entry => {
        const status = statuses[entry.id] || "unavailable", busy = directory.busy === `${entry.id}@${entry.version}`;
        return h("article", { key: `${entry.id}@${entry.version}`, "data-entry": entry.id, style: { display: "flex", flexDirection: "column", padding: 24, border: line, borderRadius: 12, minWidth: 0, background: "var(--surface-panel, #fff)" } },
          h("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 } }, h("span", { style: muted }, entry.category), h("span", { style: muted }, status === "installed" ? "已安装" : status === "absent" ? "未安装" : "状态待核")),
          h("h2", { style: { margin: "12px 0 8px", fontSize: 20, fontWeight: 500, lineHeight: 1.4, overflowWrap: "anywhere" } }, entry.name),
          h("p", { style: { margin: "0 0 16px", flex: 1 } }, entry.summary),
          h("p", { style: { ...muted, margin: "0 0 12px" } }, `${entry.version}${entry.legacy ? " · 历史版本" : ""}`),
          h("details", { style: { ...muted, marginBottom: 20 } }, h("summary", { style: { cursor: "pointer" } }, "依赖与使用条件"), h("p", { style: { margin: "8px 0 0", overflowWrap: "anywhere" } }, entry.requirements)),
          h("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, borderTop: line, paddingTop: 16 } },
            h("button", { type: "button", disabled: !!directory.busy || directory.status !== "ready", onClick: () => store.review(entry), style: { ...control, background: "var(--surface-inverse, #202020)", color: "var(--text-inverse, #fff)" } }, busy ? "等待宿主审核…" : status === "installed" ? "查看 / 更新" : "审阅安装"),
            link("源码", url(`tree/${directory.commit}/${entry.sourcePath}`)), link("下载", url(`raw/${directory.commit}/${entry.downloadPath}`))));
      })),
      !entries.length && directory.status !== "loading" ? h("p", { role: "status", style: { ...muted, padding: "40px 0" } }, directory.entries.length ? "没有符合条件的插件，试试其他关键词或分类" : "尚未载入插件目录") : null,
      h("footer", { style: { ...muted, marginTop: 28, paddingTop: 20, borderTop: line } }, h("label", { style: { display: "inline-flex", alignItems: "center", gap: 8 } }, h("input", { type: "checkbox", checked: history, onChange: e => setHistory(e.target.checked) }), "显示历史版本"), h("p", { style: { marginBottom: 0 } }, "插件安装与更新由 Buzz 宿主审核确认。业务账号、知识源和外部服务仍需本人授权。")));
  }
  ctx.pages.register({ id: "catalog", title: "插件中心", primary: true, placement: "dock", layout: "document", component: Page });
}
