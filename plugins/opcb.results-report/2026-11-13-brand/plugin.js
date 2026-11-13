// Pure helpers are exported for validation; activation owns all host access.
export function brandCategories() {
  return [
    { id: "texture", title: "产品质感展示", hint: "材质、光影、产品特写" },
    { id: "usage", title: "产品使用场景", hint: "饮用、穿搭、日常使用" },
    { id: "story", title: "品牌故事／工艺", hint: "品牌来历、制作过程、工艺细节" },
    { id: "launch", title: "上新促销", hint: "新品、活动、品牌倒计时" },
    { id: "other", title: "其他／待归类", hint: "保留生日等已有内容" },
  ];
}
export function normalizeLibrary(input) {
  if (!input || !Array.isArray(input.templates) || !Array.isArray(input.screens)) throw Error("文件需要包含 templates 和 screens 数组");
  const categories = brandCategories().map(row => row.id);
  const existing = { washer: "usage", wipe: "texture", car: "usage", cinema: "texture", birthday: "other" };
  const safeURL = (value, media) => {
    if (!value) return "";
    if (typeof value !== "string") throw Error("素材地址格式不正确");
    if (media && value.startsWith("data:" + media + "/") && /^data:(?:image\/(?:png|jpeg|webp)|video\/mp4);base64,[A-Za-z0-9+/=\s]+$/.test(value)) return value;
    const url = new URL(value);
    if (url.protocol === "https:" || (!media && url.protocol === "buzz:")) return value;
    throw Error("仅支持 HTTPS 素材、内嵌图片/MP4 和 Buzz 记录链接");
  };
  const string = value => typeof value === "string" ? value.slice(0, 4000) : "";
  const keys = new Set();
  const templates = input.templates.map((row, i) => {
    if (!row || typeof row !== "object" || !string(row.name).trim()) throw Error("每个模板需要名称");
    const key = string(row.key) || `import-${i}`;
    if (keys.has(key)) throw Error("模板编号重复，请先检查文件");
    keys.add(key);
    return { key, name: string(row.name).trim(), category: categories.includes(row.category) ? row.category : existing[key] || "other",
      status: string(row.status) || "待确认", description: string(row.description), note: string(row.note),
      source: safeURL(row.source), poster: safeURL(row.poster, "image"), video: safeURL(row.video, "video") };
  });
  const screens = input.screens.map(row => ({ title: string(row.title), note: string(row.note), image: safeURL(row.image, "image") }));
  return { schema: 1, templates, screens };
}
export function filterTemplates(library, category) {
  const order = brandCategories().map(row => row.id);
  return library.templates.filter(row => category === "all" || row.category === category)
    .slice().sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
}

export const inject = ["react", "pages", "relay", "artifactStorage"];

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const report = {"templates":[],"screens":[],"demo":{"posts":10,"views":1200,"arrivals":120,"codeUsers":80,"starts":60,"successes":42,"saves":30,"registrations":12,"paidUsers":6,"willingToShare":8,"repeatUsers":5,"revenue":179.4,"refunds":0,"generationCost":126,"acquisitionCost":60},"actual":{"posts":null,"views":null,"arrivals":null,"codeUsers":null,"starts":null,"successes":null,"saves":null,"registrations":null,"paidUsers":null,"willingToShare":null,"repeatUsers":null,"revenue":null,"refunds":null,"generationCost":null,"acquisitionCost":null},"reviewExample":{"summary":"预演结论：已有用户完成并付费；计入获客投入后，本轮收支尚未覆盖。","result":"42位用户生成成功，6位付费；8位反馈愿意发布，5位再次使用。付费与体验意愿分别有小样本信号。","gap":"到站120人，60人提交，入口到提交损失50%；生成成功用户比例70%。获客投入后差额为−¥6.60，仍未计人工与固定费用。","next":"先简化口令与上传；保留小批量预算继续测试；观察提交率、成功率、付费人数和测试收支能否改善。"},"dictionary":[["内容","发布篇数、曝光、原帖链接","按统计期内原帖去重；曝光按平台定义，不等于去重用户。","周洋"],["体验","到站、有效口令、提交、成功、保存","按用户去重，排除团队测试；成功绑定原任务；保存需设备或回访确认，下载点击另记。","周洋 · Steven"],["转化","注册、付费、愿意发布、再次使用","注册单列；付费排除测试订单；愿意发布取自反馈，实际发布另存原帖；复用需第二次生成记录。","周洋 · Steven"],["收支","实收、退款、生成消耗、获客投入","沿真实订单与账单；生成费用包含收费失败和重试；差额不包含人工及固定费用。","Steven"]]};
  const c = {
    text: "var(--text-standard, #171717)",
    sub: "var(--text-subtle, #686868)",
    paper: "var(--surface-panel, #ffffff)",
    inset: "var(--surface-inset, #f1f1f2)",
    inverse: "var(--surface-inverse, #202020)",
    inverseText: "var(--text-inverse, #ffffff)",
    line: "var(--border-standard, rgba(127,127,127,.22))",
    warning: "var(--text-warning, #946000)",
  };
  const format = (value, money = false) => {
    if (value === null || value === undefined) return "—";
    const n = Number(value);
    if (!money) return n.toLocaleString("zh-CN");
    return `${n < 0 ? "−" : ""}¥${Math.abs(n).toFixed(2)}`;
  };
  const text = { margin: 0, fontSize: 16, lineHeight: 1.7, color: c.sub };
  const meta = { ...text, fontSize: 14 };
  const number = { fontSize: 32, fontWeight: 500, lineHeight: 1.2, fontVariantNumeric: "tabular-nums", color: c.text };
  const card = { border: `1px solid ${c.line}`, borderRadius: 16, background: c.paper, padding: 24, minWidth: 0 };
  const button = { minHeight: 40, padding: "8px 16px", borderRadius: 8, border: `1px solid ${c.line}`, background: c.paper, color: c.text, fontSize: 14, fontWeight: 500, cursor: "pointer" };
  const link = (label, url) => h("a", { href: url, target: "_blank", rel: "noopener noreferrer", style: { color: c.sub, fontSize: 14 } }, label);

  function SampleVideo({ item, compact }) {
    const player = React.useRef(null);
    const [url, setUrl] = React.useState(undefined);
    const [failed, setFailed] = React.useState(false);
    const [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => {
      const element = player.current;
      let objectUrl;
      setFailed(false);
      try {
        // Buzz permits blob: media, while its media CSP excludes data: URLs.
        if (!item.video.startsWith("data:")) { setUrl(item.video); return undefined; }
        const separator = item.video.indexOf(",");
        const binary = atob(item.video.slice(separator + 1));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        setUrl(objectUrl);
      } catch {
        setUrl(undefined);
        setFailed(true);
      }
      return () => {
        element?.pause();
        element?.removeAttribute("src");
        element?.load();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }, [item.video, attempt]);
    return h("div", { style: { minWidth: 0 } },
      h("video", { ref: player, controls: true, playsInline: true, preload: "metadata", src: url, poster: item.poster,
        onError: () => setFailed(true), "aria-label": `${item.name}实际样片`,
        style: { display: "block", width: "100%", height: compact ? 240 : 256, objectFit: "contain", borderRadius: 8, background: "#111111" } }),
      failed ? h("div", { role: "status", style: { marginTop: 12 } },
        h("p", { style: meta }, "样片暂时无法播放，请重新加载。"),
        h("button", { type: "button", style: { ...button, marginTop: 8 }, onClick: () => setAttempt((value) => value + 1) }, "重新加载样片")) : null);
  }

  function ReportPage() {
    const [library, setLibrary] = React.useState({ templates: [], screens: [] });
    const [category, setCategory] = React.useState("all");
    const [notice, setNotice] = React.useState("");
    const [ready, setReady] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [draft, setDraft] = React.useState({ name: "", category: "texture" });
    const storage = React.useRef(null);
    const alive = React.useRef(true);
    const writing = React.useRef(false);
    React.useEffect(() => {
      let collection, unsubscribe, disposed = false;
      alive.current = true;
      async function read() {
        try {
          const saved = await collection.preferences.get("library");
          if (disposed) return;
          setLibrary(saved ? normalizeLibrary(saved) : { templates: [], screens: [] });
          setReady(true);
        } catch { if (!disposed) { setReady(false); setNotice("模板库读取失败，请重新打开页面；原有数据未改动。"); } }
      }
      try {
        collection = ctx.artifactStorage.open({ name: "brand-library", type: "opcb.results-report.library", version: 1, project: () => [] });
        storage.current = collection;
        unsubscribe = collection.subscribe(read);
        void read();
      } catch { setNotice("请先连接社区身份，再重新打开模板库。"); }
      return () => { disposed = true; alive.current = false; storage.current = null; unsubscribe?.(); collection?.close(); };
    }, []);
    async function changeLibrary(change, message) {
      if (!ready || writing.current || !storage.current) return;
      writing.current = true; setBusy(true);
      try {
        await storage.current.preferences.update("library", current => normalizeLibrary(change(current ? normalizeLibrary(current) : { templates: [], screens: [] })));
        const saved = await storage.current.preferences.get("library");
        if (alive.current) { setLibrary(normalizeLibrary(saved)); setNotice(message); }
      } catch { if (alive.current) setNotice("保存失败，原有数据未改动；请重试或导出备份。"); }
      finally { writing.current = false; if (alive.current) setBusy(false); }
    }
    async function importLibrary(event) {
      const file = event.target.files?.[0]; event.target.value = "";
      if (!file) return;
      try {
        if (file.size > 50 * 1024 * 1024) throw Error("文件超过50MB，请拆分素材");
        const incoming = normalizeLibrary(JSON.parse(await file.text()));
        if (!alive.current) return;
        await changeLibrary(current => {
          const known = new Set(current.templates.map(row => row.key));
          const screenNames = new Set(current.screens.map(row => row.title));
          return { templates: [...current.templates, ...incoming.templates.filter(row => !known.has(row.key))],
            screens: [...current.screens, ...incoming.screens.filter(row => !screenNames.has(row.title))] };
        }, "导入完成，同编号模板保留当前版本；样片为历史记录，验收状态以最新回执为准。");
      } catch (error) { if (alive.current) setNotice(`未导入：${error.message}`); }
    }
    function exportLibrary() {
      const url = URL.createObjectURL(new Blob([JSON.stringify(library)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "OPCB_TEMPLATE_LIBRARY.json"; anchor.click();
      URL.revokeObjectURL(url);
    }
    const root = React.useRef(null);
    const rail = React.useRef(null);
    const preview = React.useRef(null);
    const [width, setWidth] = React.useState(1100);
    const [example, setExample] = React.useState(false);
    const [selected, setSelected] = React.useState("");
    const [phone, setPhone] = React.useState(null);
    React.useEffect(() => {
      const el = root.current;
      if (!el || typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver((entries) => {
        const next = entries[0]?.contentRect?.width;
        if (next) setWidth(next);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);
    React.useEffect(() => {
      if (phone !== null) { preview.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); preview.current?.focus({ preventScroll: true }); }
    }, [phone !== null]);
    const compact = width < 760;
    const columns = width < 520 ? 2 : width < 900 ? 3 : 5;
    const data = example ? report.demo : report.actual;
    const shown = filterTemplates(library, category);
    const active = shown.find(row => row.key === selected) || shown[0];
    const known = (...keys) => keys.every((key) => data[key] !== null && data[key] !== undefined);
    const balance = known("revenue", "refunds", "generationCost") ? data.revenue - data.refunds - data.generationCost : null;
    const experiment = balance !== null && known("acquisitionCost") ? balance - data.acquisitionCost : null;

    function sectionTitle(index, title, note) {
      return h("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 } },
        h("h2", { style: { margin: 0, fontSize: compact ? 22 : 24, lineHeight: 1.4, fontWeight: 500, color: c.text } },
          h("span", { style: { display: "inline-block", width: 32, fontSize: 14, color: c.sub, fontVariantNumeric: "tabular-nums" } }, index), title),
        note ? h("p", { style: meta }, note) : null);
    }
    function metric(label, key, foot) {
      return h("div", { key, style: { minWidth: 0 } },
        h("p", { style: meta }, label),
        h("p", { "data-metric": key, style: { ...number, fontSize: 26, margin: "8px 0" } }, format(data[key])),
        h("p", { style: { ...meta, fontSize: 13 } }, foot));
    }
    function moneyRow(label, value, emphasis = false) {
      return h("div", { key: label, style: { display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderTop: `1px solid ${c.line}`, fontSize: 15, color: emphasis ? c.text : c.sub } },
        h("span", null, label), h("span", { "data-money": label, style: { fontWeight: emphasis ? 600 : 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }, format(value, true)));
    }
    const templates = h("section", { "data-section": "templates" },
      sectionTitle("01", "品牌模板库", `已收录 ${library.templates.length} 个 · 阶段目标 10 个 · 可继续新增`),
      h("p", { style: { ...meta, marginBottom: 16 } }, "优先顺序：产品质感展示 → 产品使用场景 → 品牌故事／工艺 → 上新促销。方向收录、效果通过、网站可用分别验收。"),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }, "aria-label": "模板分类" },
        ...[{ id: "all", title: "全部" }, ...brandCategories()].map(row => h("button", { key: row.id, type: "button", "data-category": row.id,
          "aria-pressed": category === row.id, style: { ...button, borderColor: category === row.id ? c.text : c.line },
          onClick: () => { setCategory(row.id); setSelected(""); } }, `${row.title} · ${row.id === "all" ? library.templates.length : library.templates.filter(t => t.category === row.id).length}`))),
      h("p", { style: { ...meta, marginBottom: 16 } }, category === "all" ? "四个品牌方向按优先顺序排列；生日等内容在其他分类保留。" : brandCategories().find(row => row.id === category)?.hint),
      h("div", { style: { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 12 } },
        ...shown.map((item, index) => h("button", { key: item.key, type: "button", "data-template": item.key, "aria-pressed": item.key === active?.key,
          onClick: () => setSelected(item.key), style: { padding: 0, border: `1px solid ${item.key === active?.key ? c.text : c.line}`, borderRadius: 12,
          background: c.paper, color: c.text, overflow: "hidden", textAlign: "left", cursor: "pointer", minWidth: 0 } },
          item.poster ? h("img", { src: item.poster, alt: `${item.name}样片画面`, style: { width: "100%", height: compact ? 92 : 104, display: "block", objectFit: "cover" } }) : null,
          h("div", { style: { padding: "12px 12px 14px" } },
            h("p", { style: { margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.4 } }, `${String(index + 1).padStart(2, "0")} ${item.name}`),
            h("p", { style: { ...meta, fontSize: 13, marginTop: 4 } }, item.status))))),
      !shown.length ? h("p", { style: { ...text, marginBlock: 20 } }, "此分类暂无模板。可新增候选，或导入原有模板备份。公开分发包不含团队样片。") : null,
      active ? h("div", { style: { ...card, marginTop: 20, display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(240px, 0.7fr) minmax(0, 1.3fr)", gap: 24, alignItems: "center" } },
        active.video ? h(SampleVideo, { key: active.key, item: active, compact }) : h("p", { style: meta }, "样片待补充"),
        h("div", null,
          h("p", { style: { ...meta, fontSize: 13 } }, `制作记录 / ${active.status}`),
          h("h3", { style: { margin: "8px 0 12px", fontSize: 24, fontWeight: 500 } }, active.name),
          h("p", { style: text }, active.description),
          h("p", { style: { ...meta, marginTop: 16, marginBottom: 8 } }, active.note),
          active.source ? link("制作与验收记录 ↗", active.source) : null,
          h("label", { style: { ...meta, display: "block", marginTop: 16 } }, "调整分类 ",
            h("select", { "aria-label": "调整模板分类", value: active.category, disabled: !ready || busy, style: { ...button, maxWidth: "100%" },
              onChange: event => { const next = event.target.value; void changeLibrary(current => ({ ...current, templates: current.templates.map(row => row.key === active.key ? { ...row, category: next } : row) }), "分类已保存。"); } },
              ...brandCategories().map(row => h("option", { key: row.id, value: row.id }, row.title)))))) : null,
      h("form", { style: { ...card, marginTop: 20 }, onSubmit: event => {
        event.preventDefault(); const name = draft.name.trim(); if (!name) return;
        const item = { key: `template-${globalThis.crypto.randomUUID()}`, name, category: draft.category, status: "候选 · 待确认", description: "", note: "尚未制作与验收", source: "", poster: "", video: "" };
        void changeLibrary(current => ({ ...current, templates: [...current.templates, item] }), "候选模板已保存，尚未算作通过。");
      } },
        h("h3", { style: { margin: "0 0 12px", fontSize: 18, fontWeight: 500 } }, "新增模板方向"),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 12 } },
          h("input", { "aria-label": "模板名称", placeholder: "例如：品牌上新倒计时", required: true, maxLength: 120, value: draft.name, style: { ...button, minWidth: 0, flex: "1 1 200px", cursor: "text" }, onChange: event => setDraft({ ...draft, name: event.target.value }) }),
          h("select", { "aria-label": "新增模板分类", value: draft.category, style: { ...button, maxWidth: "100%" }, onChange: event => setDraft({ ...draft, category: event.target.value }) },
            ...brandCategories().map(row => h("option", { key: row.id, value: row.id }, row.title))),
          h("button", { type: "submit", style: button, disabled: !ready || busy }, busy ? "保存中…" : "加入候选"))),
      h("details", { style: { marginTop: 20 } }, h("summary", { style: { ...meta, cursor: "pointer" } }, "原有模板迁移与备份"),
        h("p", { style: { ...meta, marginBlock: 12 } }, "导入只合并未收录的编号，不覆盖现有分类。数据由 Buzz 按当前身份和社区保存在本机；不会自动上传或跨设备同步。卸载前请导出。"),
        h("label", { style: { ...meta, display: "block", marginBlock: 12 } }, "导入模板备份（JSON） ", h("input", { type: "file", accept: ".json,application/json", disabled: !ready || busy, style: { maxWidth: "100%" }, onChange: importLibrary })),
        h("button", { type: "button", style: button, disabled: !ready || busy, onClick: exportLibrary }, "导出本机模板备份")),
      h("p", { role: "status", "aria-live": "polite", style: { ...meta, marginTop: 12 } }, notice || (ready ? "模板库已读取" : "正在读取本机模板库…")));

    const phonePreview = phone === null ? null : h("div", { ref: preview, tabIndex: -1, "data-phone-preview": true,
      onKeyDown: (event) => {
        if (event.key === "ArrowLeft") { setPhone((phone + library.screens.length - 1) % library.screens.length); event.preventDefault(); }
        if (event.key === "ArrowRight") { setPhone((phone + 1) % library.screens.length); event.preventDefault(); }
        if (event.key === "Escape") setPhone(null);
      }, style: { ...card, marginTop: 20 } },
      h("div", { style: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 } },
        h("div", null, h("h3", { style: { margin: 0, fontSize: 20, fontWeight: 500 } }, `${String(phone + 1).padStart(2, "0")} ${library.screens[phone].title}`), h("p", { style: meta }, library.screens[phone].note)),
        h("button", { type: "button", style: button, onClick: () => setPhone(null) }, "收起大图")),
      h("img", { src: library.screens[phone].image, alt: library.screens[phone].title, style: { display: "block", maxWidth: "100%", width: "auto", maxHeight: 800, margin: "0 auto", objectFit: "contain", borderRadius: 8 } }),
      h("div", { style: { display: "flex", gap: 12, justifyContent: "center", marginTop: 20 } },
        h("button", { type: "button", style: button, onClick: () => setPhone((phone + library.screens.length - 1) % library.screens.length) }, "← 上一屏"),
        h("span", { style: { ...meta, alignSelf: "center" } }, `${phone + 1} / ${library.screens.length}`),
        h("button", { type: "button", style: button, onClick: () => setPhone((phone + 1) % library.screens.length) }, "下一屏 →")));
    const journey = h("section", { "data-section": "journey" },
      sectionTitle("02", "用户用手机，怎样做出自己的作品", `已收录 ${library.screens.length} 屏 · 原页面记录，非真实API验收`),
      h("p", { style: { ...text, marginBottom: 20 } }, "看到内容与口令 → Safari打开模板 → 上传并生成 → 保存／可选注册 → 首页与再次使用"),
      h("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12 } },
        h("button", { type: "button", style: button, "aria-label": "向前浏览手机页面", onClick: () => rail.current?.scrollBy({ left: -rail.current.clientWidth * 0.75, behavior: "auto" }) }, "←"),
        h("button", { type: "button", style: button, "aria-label": "向后浏览手机页面", onClick: () => rail.current?.scrollBy({ left: rail.current.clientWidth * 0.75, behavior: "auto" }) }, "→")),
      h("div", { ref: rail, tabIndex: 0, "aria-label": `${library.screens.length}屏手机页面，横向滚动`, style: { display: "flex", overflowX: "auto", gap: 16, padding: "0 0 16px" } },
        ...library.screens.map((screen, index) => h("button", { key: screen.title, type: "button", "data-screen": index, onClick: () => setPhone(index), style: { padding: 0, border: 0, borderRadius: 12, background: "transparent", color: c.text, flex: `0 0 ${compact ? Math.max(220, width * 0.68) : 192}px`, textAlign: "left", cursor: "pointer" } },
          h("img", { src: screen.image, alt: `iPhone 15 Pro Max带壳页面：${screen.title}`, loading: "lazy", style: { display: "block", width: "100%", borderRadius: 12 } }),
          h("p", { style: { ...text, fontSize: 15, fontWeight: 500, color: c.text, marginTop: 12 } }, `${String(index + 1).padStart(2, "0")} ${screen.title}`),
          h("p", { style: { ...meta, fontSize: 13, marginTop: 4 } }, screen.note)))),
      h("p", { style: { ...meta, marginTop: 12 } }, "请补充获授权的手机页面截图；真实生成、权益与相册保存须另外验证。"),
      phonePreview);

    const steps = [["arrivals", "到站用户"], ["codeUsers", "有效口令"], ["starts", "发起生成"], ["successes", "生成成功"], ["saves", "确认保存"]];
    const results = h("section", { "data-section": "results" },
      sectionTitle("03", "来了多少人，做成多少，花了多少钱", example ? "示例数据，用于检查呈现" : "缺失数据留空"),
      h("div", { style: { display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 20 } },
        h("div", { style: card },
          h("h3", { style: { margin: "0 0 20px", fontSize: 18, fontWeight: 500 } }, "使用路径"),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 24 } },
            h("p", { style: meta }, "发布内容 ", h("span", { "data-metric": "posts", style: { color: c.text, fontWeight: 500 } }, format(data.posts)), " 篇"),
            h("p", { style: meta }, "内容曝光 ", h("span", { "data-metric": "views", style: { color: c.text, fontWeight: 500 } }, format(data.views)), " 次")),
          h("div", { "aria-label": example ? "示例使用转化，非实际结果" : "使用数据待填", style: { display: "flex", flexDirection: "column", gap: 16 } },
            ...steps.map(([key, label], index) => {
              const previous = index ? data[steps[index - 1][0]] : null;
              const ratio = data[key] !== null && previous ? `${(100 * data[key] / previous).toFixed(1)}% / 上一步` : "—";
              return h("div", { key, style: { display: "grid", gridTemplateColumns: compact ? "76px 44px minmax(0,1fr)" : "88px 56px minmax(0,1fr)", columnGap: 12, alignItems: "center" } },
                h("span", { style: { ...meta, fontSize: 15 } }, label),
                h("span", { "data-metric": key, style: { ...number, fontSize: compact ? 26 : 30 } }, format(data[key])),
                h("div", null,
                  h("div", { style: { height: 6, borderRadius: 3, background: c.inset, overflow: "hidden" } },
                    h("div", { style: { height: "100%", width: data[key] !== null && data.arrivals ? `${Math.min(100, 100 * data[key] / data.arrivals)}%` : 0, background: c.text, borderRadius: 3 } })),
                  h("p", { style: { ...meta, fontSize: 12, marginTop: 6 } }, index ? ratio : "去重到站用户")));
            })),
          h("div", { style: { display: "grid", gridTemplateColumns: compact ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: 16, borderTop: `1px solid ${c.line}`, marginTop: 24, paddingTop: 20 } },
            metric("注册账号", "registrations", "保存与注册单列"), metric("真实付费", "paidUsers", "排除团队测试"), metric("愿意发布", "willingToShare", "反馈意愿，非发帖"), metric("再次使用", "repeatUsers", "第二次发起生成"))),
        h("div", { style: card },
          h("h3", { style: { margin: "0 0 20px", fontSize: 18, fontWeight: 500 } }, "测试收支"),
          h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 } },
            h("div", null, h("p", { style: meta }, "实际收入"), h("p", { "data-money": "revenue", style: { ...number, margin: "12px 0 0", fontSize: compact ? 28 : 34 } }, format(data.revenue, true))),
            h("div", null, h("p", { style: meta }, "生成消耗"), h("p", { "data-money": "generationCost", style: { ...number, margin: "12px 0 0", fontSize: compact ? 28 : 34 } }, format(data.generationCost, true)))),
          moneyRow("退款", data.refunds), moneyRow("生成收支差额", balance), moneyRow("获客投入", data.acquisitionCost), moneyRow("测试收支差额", experiment, true),
          h("p", { style: { ...meta, fontSize: 13, marginTop: 16 } }, "收入 − 退款 − 生成消耗 − 获客投入；未计人工与固定费用。生成消耗包含收费失败与重试。"))),
      h("details", { style: { marginTop: 20, fontSize: 14, color: c.sub } },
        h("summary", { style: { cursor: "pointer" } }, "数据从哪里来、怎样统计"),
        h("div", { style: { display: "grid", gap: 12, marginTop: 16 } }, ...report.dictionary.map((row) => h("p", { key: row[0], style: meta }, h("span", { style: { color: c.text, fontWeight: 500 } }, `${row[0]} · `), `${row[1]}。${row[2]} 来源：${row[3]}`))),
        h("p", { style: { ...meta, marginTop: 12 } }, "统一统计截止时间待填写。人数按同一窗口去重；保存需设备或回访确认，下载点击另记。未知不是0。")));

    const reviewText = example ? [report.reviewExample.result, report.reviewExample.gap, report.reviewExample.next] : ["完成作品与付费结果 —；愿意发布、再次使用 —", "主要流失环节 —；失败原因 —；收支差额 —", "优先动作 —；负责人 —；复测范围与预算 —；下一次观察指标 —"];
    const review = h("section", { "data-section": "review" },
      sectionTitle("04", "这次验证了什么，下一轮怎么做", example ? "示例复盘，非实际结论" : "待真实结果填写"),
      h("p", { "data-review-summary": true, style: { margin: "0 0 24px", fontSize: compact ? 20 : 22, lineHeight: 1.7, color: c.text } }, example ? report.reviewExample.summary : "本轮结论：待真实用户与收支数据填写"),
      h("div", { style: { display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 24 } },
        ...["验证结果", "主要问题", "下一轮动作"].map((title, index) => h("article", { key: title, style: { borderTop: `1px solid ${c.line}`, paddingTop: 16 } },
          h("h3", { style: { margin: "0 0 12px", fontSize: 18, fontWeight: 500 } }, title), h("p", { style: text }, reviewText[index])))),
      h("p", { style: { ...meta, marginTop: 24 } }, "公开分发模板不附团队成果，页面稿、成片效果、网站可用和商业结果需分别填写与验收。"));

    return h("div", { ref: root, style: { width: "100%", minWidth: 0, overflowY: "auto", padding: compact ? 20 : 32, color: c.text, fontFamily: "inherit", boxSizing: "border-box" } },
      h("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 } },
        h("div", null, h("h1", { style: { margin: 0, fontSize: compact ? 28 : 32, fontWeight: 500, lineHeight: 1.3 } }, "15号成果报告"), h("p", { style: { ...meta, marginTop: 8 } }, "内容方向、手机体验、测试结果与复盘")),
        h("button", { type: "button", "data-mode-toggle": true, "aria-pressed": example, onClick: () => setExample(!example), style: { ...button, background: example ? c.inverse : c.paper, color: example ? c.inverseText : c.text } }, example ? "示例预演 · 切回留空" : "查看示例数据")),
      h("p", { role: "status", "aria-live": "polite", "data-mode-status": true, style: { ...meta, borderLeft: `2px solid ${example ? c.warning : c.line}`, paddingLeft: 12, marginBottom: 32, color: example ? c.warning : c.sub } }, example ? "示例预演：以下数字与复盘均为模拟；公开包不附样片和手机页面。" : "交付视图：缺失的用户数据、账务和复盘结论留空"),
      h("div", { style: { display: "flex", flexDirection: "column", gap: 44 } }, templates, journey, results, review),
      h("details", { style: { marginTop: 36, paddingTop: 20, borderTop: `1px solid ${c.line}`, color: c.sub, fontSize: 14 } },
        h("summary", { style: { cursor: "pointer" } }, "来源与视觉参考"),
        h("div", { style: { display: "grid", gap: 12, marginTop: 16 } },
                              link("手机页面原工作", "buzz://message?channel=507c2186-9889-44e0-b6a9-189ff96a98cc&id=3766239581703c375a51a34d6a91196ce85656076ca187b157c47cd9e4e67224"),
          h("p", { style: meta }, "视觉方向从已收藏的ChatGPT重设计、Flow AI工具界面、支付卡片归纳，尚非已获确认的个人风格规范。"),
                                        h("p", { style: { ...meta, fontSize: 13 } }, "界面方法参考 Damir Sokolovsky / Unslop，CC BY 4.0；潘涛 Studio 制作"),
          link("Unslop · CC BY 4.0", "https://github.com/heydamir/unslop"))));
  }

  ctx.pages.register({
    id: "report",
    title: "15号成果报告",
    primary: true,
    layout: "document",
    component: function ScopedReportPage() {
      const connection = React.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot);
      if (connection.status !== "ready" || !connection.session?.viewer) return h("p", { style: meta }, "请连接社区后打开成果报告。");
      return h(ReportPage, { key: `${connection.scope}:${connection.generation}:${connection.session.viewer}` });
    },
  });
}
