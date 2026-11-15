// src/plugin-icons/bases/opcb.results-report/plugin.js
var REPORT_TITLE = "OPCB 平台商业化计划与报告";
var COMMERCIAL_METRICS = ["posts", "views", "arrivals", "codeUsers", "starts", "successes", "saves", "registrations", "paidUsers", "willingToShare", "repeatUsers", "qualifiedOutputs", "attempts", "revenue", "refunds", "generationCost", "acquisitionCost", "subsidyCost", "otherCost"];
function emptyCommercialPlan() {
  return { schema: 1, title: REPORT_TITLE, timezone: "Asia/Shanghai", launchDate: "2026-11-17", launchStatus: "方案待确认", updatedAt: "", intro: "请导入经授权的计划JSON；日期切换只用于排期，不代表实际已经上线。", goals: [], people: [], tasks: [], content: [], references: [], assumptions: [], sources: [], costNotes: [], metricDefinitions: [], researchGap: "", budget: { unitCost: 40, freeTimes: 1, trialUsers: 20, paidGoal: 20, paidConversion: 20, mediaBudget: 100, approved: false }, metrics: {}, metricsAsOf: "", metricsEvidence: "" };
}
function shiftCommercialDate(date, offset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error("日期格式应为YYYY-MM-DD");
  const value = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(value.valueOf()) || value.toISOString().slice(0, 10) !== date) throw Error("日期无效");
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
function normalizeCommercialPlan(input) {
  if (!input || input.schema !== 1 || !Array.isArray(input.tasks) || !Array.isArray(input.content)) throw Error("需要schema=1及tasks/content数组");
  const defaults = emptyCommercialPlan();
  const str = (v, n = 4e3) => typeof v === "string" ? v.slice(0, n) : "";
  const url = (v) => {
    if (!v) return "";
    if (typeof v !== "string") throw Error("链接格式无效");
    const x = new URL(v);
    if (!["https:", "buzz:"].includes(x.protocol)) throw Error("仅允许HTTPS和Buzz证据链接");
    return v.slice(0, 4e3);
  };
  const number = (v, max = 1e9) => {
    if (v === "" || v === null || v === void 0) return null;
    if (typeof v === "boolean") throw Error("数值无效");
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) throw Error("数值超出范围");
    return n;
  };
  const date = str(input.launchDate) || defaults.launchDate;
  shiftCommercialDate(date, 0);
  if (input.tasks.length > 200 || input.content.length > 200) throw Error("最多200条任务或内容");
  const ids = /* @__PURE__ */ new Set();
  const tasks = input.tasks.map((t) => {
    const id = str(t.id, 100);
    if (!id || ids.has(id) || !str(t.title)) throw Error("任务编号重复或标题为空");
    ids.add(id);
    const a = number(t.fromDay < 0 ? -t.fromDay : t.fromDay, 365), b2 = number(t.toDay < 0 ? -t.toDay : t.toDay, 365);
    if (a === null || b2 === null || !Number.isInteger(t.fromDay) || !Number.isInteger(t.toDay) || t.fromDay > t.toDay) throw Error("任务日期范围无效");
    return { id, title: str(t.title), owner: str(t.owner), fromDay: t.fromDay, toDay: t.toDay, time: str(t.time), deliverable: str(t.deliverable), acceptance: str(t.acceptance), note: str(t.note), status: str(t.status) || "计划待执行", evidence: url(t.evidence) };
  });
  const metrics = {};
  for (const k of COMMERCIAL_METRICS) metrics[k] = number(input.metrics?.[k]);
  const b = input.budget || defaults.budget;
  const budget = {};
  for (const k of ["unitCost", "freeTimes", "trialUsers", "paidGoal", "paidConversion", "mediaBudget"]) budget[k] = number(b[k]) ?? defaults.budget[k];
  if (budget.unitCost <= 0 || ![1, 2].includes(budget.freeTimes) || budget.paidConversion <= 0 || budget.paidConversion > 100 || !Number.isInteger(budget.trialUsers) || !Number.isInteger(budget.paidGoal)) throw Error("成本须大于0，免费1或2次，人数须为整数，付费转化率须在0至100之间");
  budget.approved = b.approved === true;
  const strings = (key) => Array.isArray(input[key]) ? input[key].slice(0, 100).map((v) => str(v)) : [];
  return {
    ...defaults,
    title: str(input.title) || REPORT_TITLE,
    timezone: "Asia/Shanghai",
    launchDate: date,
    launchStatus: str(input.launchStatus),
    updatedAt: str(input.updatedAt),
    intro: str(input.intro),
    goals: strings("goals"),
    assumptions: strings("assumptions"),
    costNotes: strings("costNotes"),
    tasks,
    budget,
    metrics,
    metricsAsOf: str(input.metricsAsOf),
    metricsEvidence: url(input.metricsEvidence),
    researchGap: str(input.researchGap),
    people: (input.people || []).slice(0, 40).map((x) => ({ name: str(x.name), role: str(x.role), boundary: str(x.boundary) })),
    content: input.content.map((x) => {
      if (!Number.isInteger(x.day) || x.day < 0 || x.day > 365) throw Error("内容日期无效");
      return { id: str(x.id), day: x.day, time: str(x.time), title: str(x.title), format: str(x.format), tags: str(x.tags), topic: str(x.topic), owner: str(x.owner), route: str(x.route), status: str(x.status), url: url(x.url) };
    }),
    references: (input.references || []).slice(0, 100).map((x) => ({ name: str(x.name), kind: str(x.kind), url: url(x.url), why: str(x.why), verified: str(x.verified) })),
    sources: (input.sources || []).slice(0, 50).map((x) => ({ title: str(x.title), url: url(x.url), note: str(x.note) })),
    metricDefinitions: (input.metricDefinitions || []).slice(0, 40).map((x) => [str(x[0]), str(x[1]), str(x[2])])
  };
}
function commercialScenario(budget) {
  const b = normalizeCommercialPlan({ ...emptyCommercialPlan(), budget }).budget;
  const subsidy = b.unitCost * b.freeTimes * b.trialUsers;
  const needed = Math.ceil(b.paidGoal / (b.paidConversion / 100));
  return { subsidy, total: subsidy + b.mediaBudget, expectedPaid: b.trialUsers * b.paidConversion / 100, neededTrials: needed, neededSubsidy: needed * b.freeTimes * b.unitCost, markupPrice: b.unitCost * 1.15, markupMargin: 0.15 / 1.15, margin15Price: b.unitCost / 0.85 };
}
function brandCategories() {
  return [
    { id: "texture", title: "产品质感展示", hint: "材质、光影、产品特写" },
    { id: "usage", title: "产品使用场景", hint: "饮用、穿搭、日常使用" },
    { id: "story", title: "品牌故事／工艺", hint: "品牌来历、制作过程、工艺细节" },
    { id: "launch", title: "上新促销", hint: "新品、活动、品牌倒计时" },
    { id: "other", title: "其他／待归类", hint: "保留生日等已有内容" }
  ];
}
function normalizeLibrary(input) {
  if (!input || !Array.isArray(input.templates) || !Array.isArray(input.screens)) throw Error("文件需要包含 templates 和 screens 数组");
  const categories = brandCategories().map((row) => row.id);
  const existing = { washer: "usage", wipe: "texture", car: "usage", cinema: "texture", birthday: "other" };
  const safeURL = (value, media) => {
    if (!value) return "";
    if (typeof value !== "string") throw Error("素材地址格式不正确");
    if (media && value.startsWith("data:" + media + "/") && /^data:(?:image\/(?:png|jpeg|webp)|video\/mp4);base64,[A-Za-z0-9+/=\s]+$/.test(value)) return value;
    const url = new URL(value);
    if (url.protocol === "https:" || !media && url.protocol === "buzz:") return value;
    throw Error("仅支持 HTTPS 素材、内嵌图片/MP4 和 Buzz 记录链接");
  };
  const string = (value) => typeof value === "string" ? value.slice(0, 4e3) : "";
  const keys = /* @__PURE__ */ new Set();
  const templates = input.templates.map((row, i) => {
    if (!row || typeof row !== "object" || !string(row.name).trim()) throw Error("每个模板需要名称");
    const key = string(row.key) || `import-${i}`;
    if (keys.has(key)) throw Error("模板编号重复，请先检查文件");
    keys.add(key);
    return {
      key,
      name: string(row.name).trim(),
      category: categories.includes(row.category) ? row.category : existing[key] || "other",
      status: string(row.status) || "待确认",
      description: string(row.description),
      note: string(row.note),
      source: safeURL(row.source),
      poster: safeURL(row.poster, "image"),
      video: safeURL(row.video, "video")
    };
  });
  const screens = input.screens.map((row) => ({ title: string(row.title), note: string(row.note), image: safeURL(row.image, "image") }));
  return { schema: 1, templates, screens };
}
function filterTemplates(library, category) {
  const order = brandCategories().map((row) => row.id);
  return library.templates.filter((row) => category === "all" || row.category === category).slice().sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
}
var inject = ["react", "pages", "relay", "artifactStorage"];
function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const report = { "templates": [], "screens": [], "demo": { "posts": 10, "views": 1200, "arrivals": 120, "codeUsers": 80, "starts": 60, "successes": 42, "saves": 30, "registrations": 12, "paidUsers": 6, "willingToShare": 8, "repeatUsers": 5, "revenue": 179.4, "refunds": 0, "generationCost": 126, "acquisitionCost": 60 }, "actual": { "posts": null, "views": null, "arrivals": null, "codeUsers": null, "starts": null, "successes": null, "saves": null, "registrations": null, "paidUsers": null, "willingToShare": null, "repeatUsers": null, "revenue": null, "refunds": null, "generationCost": null, "acquisitionCost": null }, "reviewExample": { "summary": "预演结论：已有用户完成并付费；计入获客投入后，本轮收支尚未覆盖。", "result": "42位用户生成成功，6位付费；8位反馈愿意发布，5位再次使用。付费与体验意愿分别有小样本信号。", "gap": "到站120人，60人提交，入口到提交损失50%；生成成功用户比例70%。获客投入后差额为−¥6.60，仍未计人工与固定费用。", "next": "先简化口令与上传；保留小批量预算继续测试；观察提交率、成功率、付费人数和测试收支能否改善。" }, "dictionary": [["内容", "发布篇数、曝光、原帖链接", "按统计期内原帖去重；曝光按平台定义，不等于去重用户。", "周洋"], ["体验", "到站、有效口令、提交、成功、保存", "按用户去重，排除团队测试；成功绑定原任务；保存需设备或回访确认，下载点击另记。", "周洋 · Steven"], ["转化", "注册、付费、愿意发布、再次使用", "注册单列；付费排除测试订单；愿意发布取自反馈，实际发布另存原帖；复用需第二次生成记录。", "周洋 · Steven"], ["收支", "实收、退款、生成消耗、获客投入", "沿真实订单与账单；生成费用包含收费失败和重试；差额不包含人工及固定费用。", "Steven"]] };
  const c = {
    text: "var(--text-standard, #171717)",
    sub: "var(--text-subtle, #686868)",
    paper: "var(--surface-panel, #ffffff)",
    inset: "var(--surface-inset, #f1f1f2)",
    inverse: "var(--surface-inverse, #202020)",
    inverseText: "var(--text-inverse, #ffffff)",
    line: "var(--border-standard, rgba(127,127,127,.22))",
    warning: "var(--text-warning, #946000)"
  };
  const format = (value, money = false) => {
    if (value === null || value === void 0) return "—";
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
    const [url, setUrl] = React.useState(void 0);
    const [failed, setFailed] = React.useState(false);
    const [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => {
      const element = player.current;
      let objectUrl;
      setFailed(false);
      try {
        if (!item.video.startsWith("data:")) {
          setUrl(item.video);
          return void 0;
        }
        const separator = item.video.indexOf(",");
        const binary = atob(item.video.slice(separator + 1));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }));
        setUrl(objectUrl);
      } catch {
        setUrl(void 0);
        setFailed(true);
      }
      return () => {
        element?.pause();
        element?.removeAttribute("src");
        element?.load();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }, [item.video, attempt]);
    return h(
      "div",
      { style: { minWidth: 0 } },
      h("video", {
        ref: player,
        controls: true,
        playsInline: true,
        preload: "metadata",
        src: url,
        poster: item.poster,
        onError: () => setFailed(true),
        "aria-label": `${item.name}实际样片`,
        style: { display: "block", width: "100%", height: compact ? 240 : 256, objectFit: "contain", borderRadius: 8, background: "#111111" }
      }),
      failed ? h(
        "div",
        { role: "status", style: { marginTop: 12 } },
        h("p", { style: meta }, "样片暂时无法播放，请重新加载。"),
        h("button", { type: "button", style: { ...button, marginTop: 8 }, onClick: () => setAttempt((value) => value + 1) }, "重新加载样片")
      ) : null
    );
  }
  function CommercialPanel() {
    const [plan, setPlan] = React.useState(emptyCommercialPlan);
    const [tab, setTab] = React.useState("schedule");
    const [day, setDay] = React.useState(0);
    const [person, setPerson] = React.useState("全部");
    const [ready, setReady] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [notice, setNotice] = React.useState("");
    const [dirty, setDirty] = React.useState(false);
    const storage = React.useRef(null);
    const lock = React.useRef(false);
    const current = React.useRef(plan);
    current.current = plan;
    const dirtyRef = React.useRef(dirty);
    dirtyRef.current = dirty;
    React.useEffect(() => {
      let collection, unsubscribe, disposed = false;
      const read = async () => {
        try {
          const saved = await collection.preferences.get("commercial-plan");
          if (!disposed) {
            setPlan(saved ? normalizeCommercialPlan(saved) : emptyCommercialPlan());
            setReady(true);
          }
        } catch {
          if (!disposed) {
            setReady(false);
            setNotice("计划读取失败；已有模板数据未改动。");
          }
        }
      };
      try {
        collection = ctx.artifactStorage.open({ name: "brand-library", type: "opcb.results-report.library", version: 1, project: () => [] });
        storage.current = collection;
        unsubscribe = collection.subscribe(() => {
          if (!lock.current && !dirtyRef.current) void read();
        });
        void read();
      } catch {
        setNotice("请连接社区后重开计划。");
      }
      return () => {
        disposed = true;
        unsubscribe?.();
        collection?.close();
        storage.current = null;
      };
    }, []);
    async function save(value) {
      if (!ready || lock.current || !storage.current) return;
      lock.current = true;
      setBusy(true);
      try {
        const normalized = normalizeCommercialPlan(value);
        await storage.current.preferences.update("commercial-plan", () => normalized);
        const saved = await storage.current.preferences.get("commercial-plan");
        setPlan(normalizeCommercialPlan(saved));
        setDirty(false);
        setNotice("计划已保存到本机当前身份与社区；未自动同步群或其他设备。");
      } catch (error) {
        setNotice(`未保存：${error.message}。原数据保留，可先导出。`);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    }
    const edit = (fn) => {
      setPlan((p2) => fn(p2));
      setDirty(true);
    };
    const exportPlan = () => {
      const blob = new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "OPCB_COMMERCIAL_PLAN.json";
      a.click();
      URL.revokeObjectURL(url);
    };
    async function importPlan(event) {
      const f = event.target.files?.[0];
      event.target.value = "";
      if (!f) return;
      try {
        if (f.size > 2 * 1024 * 1024) throw Error("计划文件最大2MB，不含媒体");
        const value = normalizeCommercialPlan(JSON.parse(await f.text()));
        await save(value);
      } catch (error) {
        setNotice(`未导入：${error.message}`);
      }
    }
    const field = { ...button, width: "100%", boxSizing: "border-box", minWidth: 0, fontFamily: "inherit" };
    const p = (value, style = {}) => h("p", { style: { ...text, fontSize: 16, ...style } }, value);
    const detail = (title, body, open = false) => h("details", { open, style: { borderTop: `1px solid ${c.line}`, paddingBlock: 16 } }, h("summary", { style: { cursor: "pointer", fontWeight: 500, fontSize: 17 } }, title), h("div", { style: { marginTop: 12 } }, body));
    const section = (title, body) => h("section", { style: { marginTop: 28 } }, h("h3", { style: { fontSize: 22, fontWeight: 500, margin: "0 0 16px" } }, title), body);
    const anchor = (title, url) => url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer", style: { color: c.text, overflowWrap: "anywhere" } }, title) : h("span", null, title);
    const scenario = (() => {
      try {
        return commercialScenario(plan.budget);
      } catch {
        return null;
      }
    })();
    const dates = Array.from({ length: 6 }, (_, i) => shiftCommercialDate(plan.launchDate, i - 1));
    const dateLabel = (d) => shiftCommercialDate(plan.launchDate, d).slice(5).replace("-", "/");
    const taskList = plan.tasks.filter((t) => t.fromDay <= day && t.toDay >= day && (person === "全部" || t.owner.includes(person)));
    const taskView = (t) => h(
      "article",
      { key: t.id, style: { borderTop: `1px solid ${c.line}`, paddingBlock: 18, minWidth: 0 } },
      h("div", { style: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } }, h("strong", { style: { fontSize: 19, fontWeight: 500 } }, `${t.id} ${t.title}`), h("span", { style: { ...meta, fontSize: 15 } }, `${t.owner} · ${t.time}`)),
      p(t.deliverable, { marginTop: 10, color: c.text }),
      p(`验收：${t.acceptance}`, { marginTop: 8 }),
      t.note ? p(t.note, { marginTop: 8, fontSize: 15 }) : null,
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginTop: 14 } },
        h("label", { style: meta }, "进度", h("select", { "aria-label": `${t.id}进度`, value: t.status, style: field, onChange: (e) => edit((v) => ({ ...v, tasks: v.tasks.map((x) => x.id === t.id ? { ...x, status: e.target.value } : x) })) }, ...[.../* @__PURE__ */ new Set(["计划待执行", "进行中", "已交付待验收", "已验收", "阻塞", t.status])].map((x) => h("option", { key: x, value: x }, x)))),
        h("label", { style: meta }, "交付证据链接", h("input", { "aria-label": `${t.id}证据`, value: t.evidence, placeholder: "https:// 或 buzz://", style: field, onChange: (e) => edit((v) => ({ ...v, tasks: v.tasks.map((x) => x.id === t.id ? { ...x, evidence: e.target.value } : x) })) }))
      ),
      t.evidence ? h("div", { style: { marginTop: 10 } }, anchor("查看交付", t.evidence)) : null
    );
    const schedule = h(
      "div",
      null,
      p("先看当天要交什么，再看整段时间。以下具体钟点为本版建议，人员收到计划不等于已承诺或完成。"),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBlock: 18 }, "aria-label": "每日计划" }, ...[-1, 0, 1, 2, 3, 4].map((d) => h("button", { key: d, type: "button", "data-day": d, "aria-pressed": day === d, onClick: () => setDay(d), style: { ...button, borderColor: day === d ? c.text : c.line } }, `${dateLabel(d)} ${d < 0 ? "准备" : d === 0 ? "上线D0" : `商业化D${d}`}`))),
      h("label", { style: { ...meta, display: "block", maxWidth: 320 } }, "按负责人看", h("select", { "aria-label": "负责人筛选", value: person, style: field, onChange: (e) => setPerson(e.target.value) }, ...["全部", "潘涛", "Moo", "Steven", "周洋"].map((x) => h("option", { key: x, value: x }, x)))),
      !plan.tasks.length ? p("尚未导入团队计划；下方可导入计划JSON。", { marginTop: 24 }) : !taskList.length ? p("当天没有匹配任务。", { marginTop: 24 }) : h("div", null, ...taskList.map(taskView)),
      detail("展开甘特图与全部任务", h("div", null, h("div", { style: { overflowX: "auto" }, tabIndex: 0, "aria-label": "准备到商业化第四天甘特图" }, h("div", { style: { minWidth: 760 } }, h("div", { style: { display: "grid", gridTemplateColumns: "minmax(230px,2fr) repeat(6,1fr)", gap: 6, paddingBottom: 14 } }, h("strong", null, "工作 / 负责人"), ...dates.map((d, i) => h("span", { key: d, style: meta }, d.slice(5), h("br"), i === 0 ? "准备" : i === 1 ? "上线" : `D${i - 1}`))), ...plan.tasks.map((t) => h("div", { key: t.id, style: { display: "grid", gridTemplateColumns: "minmax(230px,2fr) repeat(6,1fr)", gap: 6, alignItems: "center", borderTop: `1px solid ${c.line}`, paddingBlock: 10 } }, h("span", { style: { fontSize: 14, lineHeight: 1.5 } }, t.title, h("br"), h("span", { style: { color: c.sub } }, t.owner)), ...[-1, 0, 1, 2, 3, 4].map((d) => h("div", { key: d, style: { minHeight: 28, borderRadius: 4, background: t.fromDay <= d && t.toDay >= d ? c.inverse : c.inset, color: c.inverseText, textAlign: "center", paddingTop: 5, fontSize: 12 } }, t.fromDay <= d && t.toDay >= d ? t.status : "")))))), ...plan.tasks.map((t) => h("div", { key: t.id, style: { borderTop: `1px solid ${c.line}`, paddingBlock: 12 } }, p(`${t.id} ${t.title} · ${t.owner} · ${t.time}`, { color: c.text }), p(t.deliverable, { marginTop: 6 }), p(`验收：${t.acceptance}`, { marginTop: 6 }))))),
      detail("14—17日准备安排与上线门槛", h("div", null, ...plan.assumptions.map((x, i) => p(`${i + 1}. ${x}`, { marginBottom: 12 }))))
    );
    const content = h(
      "div",
      null,
      p("先做品牌真实需求，不走泛娱乐。10篇小红书按唯一原帖累计；视频号是同素材适配，不冒充新增小红书篇数。平台规则、投放最低额以实际账户可用入口为准。"),
      ...plan.content.map((row) => h("article", { key: row.id, style: { borderTop: `1px solid ${c.line}`, paddingBlock: 18 } }, h("p", { style: meta }, `${row.id} · ${dateLabel(row.day)} ${row.time} · ${row.owner}`), h("h4", { style: { fontSize: 20, fontWeight: 500, margin: "8px 0" } }, row.title), p(row.format), p(row.tags, { marginTop: 8, color: c.text }), p(row.route, { marginTop: 8, fontSize: 15 }), h("label", { style: { ...meta, display: "block", marginTop: 12 } }, "原帖链接（留空表示未交）", h("input", { "aria-label": `${row.id}原帖`, value: row.url, style: field, onChange: (e) => edit((v) => ({ ...v, content: v.content.map((x) => x.id === row.id ? { ...x, url: e.target.value } : x) })) })), p(row.status, { fontSize: 14, marginTop: 8 }))),
      section("发布与引流操作", h("ol", { style: { ...text, paddingLeft: 24 } }, ...["先在自有账号发布完整品牌成片，前3秒显示成片；再用产品图和三步操作解释怎么替换，保留价格、时长与局限。", "每篇用1个场景tag＋1个品牌人群tag＋1个工具tag，例：#新品发布 #品牌运营 #AI广告。按当日目标检索校准，不承诺tag带来流量。", "相关笔记评论只做真实有用回答，明确自身身份；用户主动询问后按平台允许方式给主页、私信或社群入口，不刷屏、不假装消费者。作者合作、置顶、引用需对方明确同意。", "视频号用9:16成片＋字幕，标题写具体品牌用途；用平台实际支持的公众号/客服/主页/社群工具承接，不能假定可在评论放外链。", "每条内容独立来源码；入口绑定模板，客服用同一码记录首次到站与后续订单。技术不能跟踪时先补归因，不拿自然与付费混算。", "体验群公告含适用对象、素材要求、每人额度、出片等待、失败处理和反馈方式；周洋每天12:00与20:00答疑，20:30回访未完成用户。朋友圈D4才作为保底，单独归因。"].map((x) => h("li", { key: x, style: { marginBottom: 12 } }, x))))
    );
    const budget = h(
      "div",
      null,
      p("下列是预算情景计算；不是实际成本、正式定价或付款批准。输入改变后需保存；保存不会下单、充值或投放。"),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginTop: 20 } }, ...[["unitCost", "每次体验成本估算（元）"], ["freeTimes", "每人免费次数（1或2）"], ["trialUsers", "首批体验人数"], ["paidGoal", "目标付费人数"], ["paidConversion", "体验到付费假设（%）"], ["mediaBudget", "媒体预算（元）"]].map(([key, label]) => h("label", { key, style: meta }, label, h("input", { type: "number", min: key === "unitCost" ? 0.01 : 0, step: key === "unitCost" ? 0.01 : 1, "aria-label": label, value: plan.budget[key], style: field, onChange: (e) => edit((v) => ({ ...v, budget: { ...v.budget, [key]: e.target.value } })) })))),
      scenario ? section("情景结果", h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 20 } }, ...[[`生成补贴 ¥${scenario.subsidy.toFixed(2)}`, `＋媒体后 ¥${scenario.total.toFixed(2)}`], [`预计付费 ${scenario.expectedPaid.toFixed(1)}人`, "只是假设，实际不能预填"], [`按当前假设需 ${scenario.neededTrials}人体验`, `达目标补贴约 ¥${scenario.neededSubsidy.toFixed(2)}`], [`成本×1.15 = ¥${scenario.markupPrice.toFixed(2)}`, `毛利率13.04%；若要15%为 ¥${scenario.margin15Price.toFixed(2)}`]].map(([title, note]) => h("div", { key: title, style: { borderTop: `1px solid ${c.line}`, paddingTop: 16 } }, h("p", { style: { fontSize: 22, fontWeight: 500, margin: 0 } }, title), p(note, { fontSize: 15, marginTop: 8 }))))) : p("请检查输入：成本须大于0，免费1/2次，人数为整数，转化率大于0且不超过100%。", { marginTop: 20 }),
      section("50／100元投放步骤", h("ol", { style: { ...text, paddingLeft: 24 } }, ...["D1自然发布；D2只选可归因、已有品牌意向与成功出片的1帖，先申请50元；不按播放量最高自动选。", "小红书走账户实际可用的薯条/聚光入口；视频号走实际可用的加热入口。若最低额超50且未批100，不补充值，转自然测试。受众先对齐品牌运营、设计、创意与目标品类，后台无此定向就如实记录。", "18:00回看有效品牌线索、到站、成功、付费和每项成本。若没来源、没有效线索、链路失败则停；满足条件后D3再申请50元，合计100元。两平台各100元是200元备选，不是同一100元重复花。", "媒体费用与免费生成费用分开：900/1700元是800/1600＋100；1000/1800元是＋200。无预算批准回执维持0元实际支出。"].map((x) => h("li", { key: x, style: { marginBottom: 12 } }, x)))),
      h("p", { style: { ...meta, borderLeft: `3px solid ${c.warning}`, paddingLeft: 12 } }, plan.budget.approved ? "文件记录预算已批准；仍须核对批准人、金额及有效期证据。" : "预算状态：未批准。界面不能批准费用。"),
      detail("会议成本、免费次数与旧方案核对", h("div", null, ...plan.costNotes.map((x, i) => p(`${i + 1}. ${x}`, { marginBottom: 14 }))), true)
    );
    const labels = Object.fromEntries(plan.metricDefinitions.map((x) => [x[0], x[1]]));
    const m = plan.metrics, ratio = (a, b) => m[a] !== null && m[a] !== void 0 && m[b] > 0 ? `${(100 * m[a] / m[b]).toFixed(1)}%` : "—";
    const sumKnown = (...keys) => keys.every((k) => m[k] !== null && m[k] !== void 0);
    const cash = sumKnown("revenue", "refunds", "generationCost", "acquisitionCost", "otherCost") ? m.revenue - m.refunds - m.generationCost - m.acquisitionCost - m.otherCost : null;
    const paidCAC = sumKnown("acquisitionCost", "subsidyCost", "paidUsers") && m.paidUsers > 0 ? (m.acquisitionCost + m.subsidyCost) / m.paidUsers : null;
    const qualityCost = sumKnown("generationCost", "qualifiedOutputs") && m.qualifiedOutputs > 0 ? m.generationCost / m.qualifiedOutputs : null;
    const metrics = h(
      "div",
      null,
      p("填写同一窗口的累计、已去重真实值，不把每日人数相加。空白表示未知，0表示有证据的零。排除团队测试；朋友圈熟人另附记录，不混进陌生人漏斗。"),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 16 } }, h("label", { style: meta }, "统计窗口／截止", h("input", { "aria-label": "统计截止", value: plan.metricsAsOf, placeholder: "例如11/18 10:00至11/21 20:30", style: field, onChange: (e) => edit((v) => ({ ...v, metricsAsOf: e.target.value })) })), h("label", { style: meta }, "数据与账单证据", h("input", { "aria-label": "数据证据", value: plan.metricsEvidence, placeholder: "https:// 或 buzz://", style: field, onChange: (e) => edit((v) => ({ ...v, metricsEvidence: e.target.value })) }))),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 16, marginTop: 20 } }, ...COMMERCIAL_METRICS.map((key) => h("label", { key, style: meta }, labels[key] || key, h("input", { "aria-label": labels[key] || key, type: "number", min: 0, step: ["revenue", "refunds", "generationCost", "acquisitionCost", "subsidyCost", "otherCost"].includes(key) ? ".01" : "1", value: m[key] ?? "", placeholder: "未知", style: field, onChange: (e) => edit((v) => ({ ...v, metrics: { ...v.metrics, [key]: e.target.value === "" ? null : Number(e.target.value) } })) })))),
      section("真实数据计算", h("div", null, p(`到站→提交 ${ratio("starts", "arrivals")} · 提交→成功 ${ratio("successes", "starts")} · 成功→保存 ${ratio("saves", "successes")} · 体验成功→付费 ${ratio("paidUsers", "successes")}`, { color: c.text }), p(`陌生付费CAC ${paidCAC === null ? "—" : `¥${paidCAC.toFixed(2)}`} · 合格片供应商成本 ${qualityCost === null ? "—" : `¥${qualityCost.toFixed(2)}`} · 已录项目收支 ${cash === null ? "—" : `¥${cash.toFixed(2)}`}`, { marginTop: 12, color: c.text }), p("CAC=(媒体合作费用＋免费生成补贴)/陌生付费人数；无付费或未知时不计算。补贴是生成实付的子集，总收支不重复扣。合格片完整成本还须加履约项目；账目不齐不称净利润。", { marginTop: 12 }))),
      detail("完整数据字典与责任", h("div", null, ...plan.metricDefinitions.map(([key, title, note]) => p(`${title}：${note}`, { marginBottom: 12 })), p("周洋：发布/来源/用户反馈与熟人分流；Steven：匿名ID与任务/订单/扣退/供应商账单；Moo：视觉合格验收；潘涛：价格与复盘结论。每天20:30封账，21:00群内汇总。"))),
      section("四天后怎样判断", h("ol", { style: { ...text, paddingLeft: 24 } }, ...["强信号：真实陌生品牌用户付费并拿到合格结果；记录复用/愿发布/退款和单位经济性，不能只看点赞。", "仅有注册或免费出片：说明链路/体验有信号，尚未验证付费。先按流失段修入口、模板价值或价格，不据此扩大预算。", "零付费也交完整报告：原帖、到站、任务、成本、反馈和卡点均可核验，明确下一轮继续/调整/停止；不得填模拟付费。"].map((x) => h("li", { key: x, style: { marginBottom: 12 } }, x))))
    );
    const references = h("div", null, p(plan.researchGap || "请补真实账号、原帖与观察时间。"), ...plan.references.map((x, i) => h("article", { key: i, style: { borderTop: `1px solid ${c.line}`, paddingBlock: 18 } }, h("h4", { style: { fontSize: 20, margin: "0 0 8px", fontWeight: 500 } }, anchor(x.name, x.url)), p(x.kind, { fontSize: 14 }), p(x.why, { marginTop: 8 }), p(x.verified, { marginTop: 8, fontSize: 15, color: c.warning }))), section("计划来源与事实边界", h("div", null, ...plan.sources.map((x, i) => h("div", { key: i, style: { marginBottom: 18 } }, anchor(x.title, x.url), p(x.note, { fontSize: 15, marginTop: 6 }))))));
    return h(
      "section",
      { "data-commercial": true, style: { marginBottom: 40 } },
      h("p", { style: { ...meta, marginBottom: 10 } }, "计划 → 每日执行 → 成本与转化 → 成果回执"),
      h("h2", { style: { fontSize: 28, lineHeight: 1.35, fontWeight: 500, margin: "0 0 16px" } }, "上线之后，用4天验证品牌需求"),
      p(plan.intro),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end", marginBlock: 20 } }, h("label", { style: { ...meta, minWidth: 180 } }, "上线日期方案", h("select", { "aria-label": "上线日期方案", value: plan.launchDate, style: field, onChange: (e) => edit((v) => ({ ...v, launchDate: e.target.value })) }, h("option", { value: "2026-11-15" }, "11月15日上线"), h("option", { value: "2026-11-17" }, "11月17日上线"))), h("p", { style: meta }, `商业化窗口：${dateLabel(1)}—${dateLabel(4)} · 北京时间`), h("span", { style: { ...meta, color: c.warning } }, plan.launchStatus)),
      detail("共同目标与分工", h("div", null, ...plan.goals.map((x, i) => p(`${i + 1}. ${x}`, { marginBottom: 14 })), ...plan.people.map((x) => h("div", { key: x.name, style: { borderTop: `1px solid ${c.line}`, paddingBlock: 14 } }, h("strong", { style: { fontSize: 18, fontWeight: 500 } }, x.name), p(x.role, { marginTop: 6, color: c.text }), p(x.boundary, { fontSize: 15, marginTop: 6 }))))),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, borderBottom: `1px solid ${c.line}`, paddingBottom: 16, marginBlock: 20 }, role: "tablist", "aria-label": "商业化模块" }, ...[["schedule", "每日与甘特图"], ["content", "10篇内容与引流"], ["budget", "费用与免费次数"], ["metrics", "真实数据与复盘"], ["references", "对标与来源"]].map(([id, title]) => h("button", { key: id, type: "button", role: "tab", "aria-selected": tab === id, onClick: () => setTab(id), style: { ...button, background: tab === id ? c.inverse : c.paper, color: tab === id ? c.inverseText : c.text } }, title))),
      h("div", { role: "tabpanel" }, { schedule, content, budget, metrics, references }[tab]),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 } }, h("button", { type: "button", style: button, disabled: !ready || busy, onClick: () => void save(current.current) }, busy ? "保存中…" : dirty ? "保存计划与进度（有未保存修改）" : "保存计划与进度"), h("button", { type: "button", style: button, onClick: exportPlan }, "导出计划JSON"), h("label", { style: meta }, "导入团队计划 JSON ", h("input", { type: "file", "aria-label": "导入商业化计划", accept: ".json,application/json", disabled: !ready || busy, onChange: importPlan, style: { maxWidth: "100%" } }))),
      h("p", { role: "status", "aria-live": "polite", style: { ...meta, marginTop: 12 } }, notice || "保留原模板库，计划单独保存；页面进度不自动写回群聊或其他设备。")
    );
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
        } catch {
          if (!disposed) {
            setReady(false);
            setNotice("模板库读取失败，请重新打开页面；原有数据未改动。");
          }
        }
      }
      try {
        collection = ctx.artifactStorage.open({ name: "brand-library", type: "opcb.results-report.library", version: 1, project: () => [] });
        storage.current = collection;
        unsubscribe = collection.subscribe(read);
        void read();
      } catch {
        setNotice("请先连接社区身份，再重新打开模板库。");
      }
      return () => {
        disposed = true;
        alive.current = false;
        storage.current = null;
        unsubscribe?.();
        collection?.close();
      };
    }, []);
    async function changeLibrary(change, message) {
      if (!ready || writing.current || !storage.current) return;
      writing.current = true;
      setBusy(true);
      try {
        await storage.current.preferences.update("library", (current) => normalizeLibrary(change(current ? normalizeLibrary(current) : { templates: [], screens: [] })));
        const saved = await storage.current.preferences.get("library");
        if (alive.current) {
          setLibrary(normalizeLibrary(saved));
          setNotice(message);
        }
      } catch {
        if (alive.current) setNotice("保存失败，原有数据未改动；请重试或导出备份。");
      } finally {
        writing.current = false;
        if (alive.current) setBusy(false);
      }
    }
    async function importLibrary(event) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        if (file.size > 50 * 1024 * 1024) throw Error("文件超过50MB，请拆分素材");
        const incoming = normalizeLibrary(JSON.parse(await file.text()));
        if (!alive.current) return;
        await changeLibrary((current) => {
          const known2 = new Set(current.templates.map((row) => row.key));
          const screenNames = new Set(current.screens.map((row) => row.title));
          return {
            templates: [...current.templates, ...incoming.templates.filter((row) => !known2.has(row.key))],
            screens: [...current.screens, ...incoming.screens.filter((row) => !screenNames.has(row.title))]
          };
        }, "导入完成，同编号模板保留当前版本；样片为历史记录，验收状态以最新回执为准。");
      } catch (error) {
        if (alive.current) setNotice(`未导入：${error.message}`);
      }
    }
    function exportLibrary() {
      const url = URL.createObjectURL(new Blob([JSON.stringify(library)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "OPCB_TEMPLATE_LIBRARY.json";
      anchor.click();
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
      if (!el || typeof ResizeObserver === "undefined") return void 0;
      const observer = new ResizeObserver((entries) => {
        const next = entries[0]?.contentRect?.width;
        if (next) setWidth(next);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);
    React.useEffect(() => {
      if (phone !== null) {
        preview.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
        preview.current?.focus({ preventScroll: true });
      }
    }, [phone !== null]);
    const compact = width < 760;
    const columns = width < 520 ? 2 : width < 900 ? 3 : 5;
    const data = example ? report.demo : report.actual;
    const shown = filterTemplates(library, category);
    const active = shown.find((row) => row.key === selected) || shown[0];
    const known = (...keys) => keys.every((key) => data[key] !== null && data[key] !== void 0);
    const balance = known("revenue", "refunds", "generationCost") ? data.revenue - data.refunds - data.generationCost : null;
    const experiment = balance !== null && known("acquisitionCost") ? balance - data.acquisitionCost : null;
    function sectionTitle(index, title, note) {
      return h(
        "div",
        { style: { display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 } },
        h(
          "h2",
          { style: { margin: 0, fontSize: compact ? 22 : 24, lineHeight: 1.4, fontWeight: 500, color: c.text } },
          h("span", { style: { display: "inline-block", width: 32, fontSize: 14, color: c.sub, fontVariantNumeric: "tabular-nums" } }, index),
          title
        ),
        note ? h("p", { style: meta }, note) : null
      );
    }
    function metric(label, key, foot) {
      return h(
        "div",
        { key, style: { minWidth: 0 } },
        h("p", { style: meta }, label),
        h("p", { "data-metric": key, style: { ...number, fontSize: 26, margin: "8px 0" } }, format(data[key])),
        h("p", { style: { ...meta, fontSize: 13 } }, foot)
      );
    }
    function moneyRow(label, value, emphasis = false) {
      return h(
        "div",
        { key: label, style: { display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderTop: `1px solid ${c.line}`, fontSize: 15, color: emphasis ? c.text : c.sub } },
        h("span", null, label),
        h("span", { "data-money": label, style: { fontWeight: emphasis ? 600 : 500, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }, format(value, true))
      );
    }
    const templates = h(
      "section",
      { "data-section": "templates" },
      sectionTitle("01", "品牌模板库", `已收录 ${library.templates.length} 个 · 阶段目标 10 个 · 可继续新增`),
      h("p", { style: { ...meta, marginBottom: 16 } }, "优先顺序：产品质感展示 → 产品使用场景 → 品牌故事／工艺 → 上新促销。方向收录、效果通过、网站可用分别验收。"),
      h(
        "div",
        { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }, "aria-label": "模板分类" },
        ...[{ id: "all", title: "全部" }, ...brandCategories()].map((row) => h("button", {
          key: row.id,
          type: "button",
          "data-category": row.id,
          "aria-pressed": category === row.id,
          style: { ...button, borderColor: category === row.id ? c.text : c.line },
          onClick: () => {
            setCategory(row.id);
            setSelected("");
          }
        }, `${row.title} · ${row.id === "all" ? library.templates.length : library.templates.filter((t) => t.category === row.id).length}`))
      ),
      h("p", { style: { ...meta, marginBottom: 16 } }, category === "all" ? "四个品牌方向按优先顺序排列；生日等内容在其他分类保留。" : brandCategories().find((row) => row.id === category)?.hint),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 12 } },
        ...shown.map((item, index) => h(
          "button",
          {
            key: item.key,
            type: "button",
            "data-template": item.key,
            "aria-pressed": item.key === active?.key,
            onClick: () => setSelected(item.key),
            style: {
              padding: 0,
              border: `1px solid ${item.key === active?.key ? c.text : c.line}`,
              borderRadius: 12,
              background: c.paper,
              color: c.text,
              overflow: "hidden",
              textAlign: "left",
              cursor: "pointer",
              minWidth: 0
            }
          },
          item.poster ? h("img", { src: item.poster, alt: `${item.name}样片画面`, style: { width: "100%", height: compact ? 92 : 104, display: "block", objectFit: "cover" } }) : null,
          h(
            "div",
            { style: { padding: "12px 12px 14px" } },
            h("p", { style: { margin: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.4 } }, `${String(index + 1).padStart(2, "0")} ${item.name}`),
            h("p", { style: { ...meta, fontSize: 13, marginTop: 4 } }, item.status)
          )
        ))
      ),
      !shown.length ? h("p", { style: { ...text, marginBlock: 20 } }, "此分类暂无模板。可新增候选，或导入原有模板备份。公开分发包不含团队样片。") : null,
      active ? h(
        "div",
        { style: { ...card, marginTop: 20, display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(240px, 0.7fr) minmax(0, 1.3fr)", gap: 24, alignItems: "center" } },
        active.video ? h(SampleVideo, { key: active.key, item: active, compact }) : h("p", { style: meta }, "样片待补充"),
        h(
          "div",
          null,
          h("p", { style: { ...meta, fontSize: 13 } }, `制作记录 / ${active.status}`),
          h("h3", { style: { margin: "8px 0 12px", fontSize: 24, fontWeight: 500 } }, active.name),
          h("p", { style: text }, active.description),
          h("p", { style: { ...meta, marginTop: 16, marginBottom: 8 } }, active.note),
          active.source ? link("制作与验收记录 ↗", active.source) : null,
          h(
            "label",
            { style: { ...meta, display: "block", marginTop: 16 } },
            "调整分类 ",
            h(
              "select",
              {
                "aria-label": "调整模板分类",
                value: active.category,
                disabled: !ready || busy,
                style: { ...button, maxWidth: "100%" },
                onChange: (event) => {
                  const next = event.target.value;
                  void changeLibrary((current) => ({ ...current, templates: current.templates.map((row) => row.key === active.key ? { ...row, category: next } : row) }), "分类已保存。");
                }
              },
              ...brandCategories().map((row) => h("option", { key: row.id, value: row.id }, row.title))
            )
          )
        )
      ) : null,
      h(
        "form",
        { style: { ...card, marginTop: 20 }, onSubmit: (event) => {
          event.preventDefault();
          const name = draft.name.trim();
          if (!name) return;
          const item = { key: `template-${globalThis.crypto.randomUUID()}`, name, category: draft.category, status: "候选 · 待确认", description: "", note: "尚未制作与验收", source: "", poster: "", video: "" };
          void changeLibrary((current) => ({ ...current, templates: [...current.templates, item] }), "候选模板已保存，尚未算作通过。");
        } },
        h("h3", { style: { margin: "0 0 12px", fontSize: 18, fontWeight: 500 } }, "新增模板方向"),
        h(
          "div",
          { style: { display: "flex", flexWrap: "wrap", gap: 12 } },
          h("input", { "aria-label": "模板名称", placeholder: "例如：品牌上新倒计时", required: true, maxLength: 120, value: draft.name, style: { ...button, minWidth: 0, flex: "1 1 200px", cursor: "text" }, onChange: (event) => setDraft({ ...draft, name: event.target.value }) }),
          h(
            "select",
            { "aria-label": "新增模板分类", value: draft.category, style: { ...button, maxWidth: "100%" }, onChange: (event) => setDraft({ ...draft, category: event.target.value }) },
            ...brandCategories().map((row) => h("option", { key: row.id, value: row.id }, row.title))
          ),
          h("button", { type: "submit", style: button, disabled: !ready || busy }, busy ? "保存中…" : "加入候选")
        )
      ),
      h(
        "details",
        { style: { marginTop: 20 } },
        h("summary", { style: { ...meta, cursor: "pointer" } }, "原有模板迁移与备份"),
        h("p", { style: { ...meta, marginBlock: 12 } }, "导入只合并未收录的编号，不覆盖现有分类。数据由 Buzz 按当前身份和社区保存在本机；不会自动上传或跨设备同步。卸载前请导出。"),
        h("label", { style: { ...meta, display: "block", marginBlock: 12 } }, "导入模板备份（JSON） ", h("input", { type: "file", accept: ".json,application/json", disabled: !ready || busy, style: { maxWidth: "100%" }, onChange: importLibrary })),
        h("button", { type: "button", style: button, disabled: !ready || busy, onClick: exportLibrary }, "导出本机模板备份")
      ),
      h("p", { role: "status", "aria-live": "polite", style: { ...meta, marginTop: 12 } }, notice || (ready ? "模板库已读取" : "正在读取本机模板库…"))
    );
    const phonePreview = phone === null ? null : h(
      "div",
      {
        ref: preview,
        tabIndex: -1,
        "data-phone-preview": true,
        onKeyDown: (event) => {
          if (event.key === "ArrowLeft") {
            setPhone((phone + library.screens.length - 1) % library.screens.length);
            event.preventDefault();
          }
          if (event.key === "ArrowRight") {
            setPhone((phone + 1) % library.screens.length);
            event.preventDefault();
          }
          if (event.key === "Escape") setPhone(null);
        },
        style: { ...card, marginTop: 20 }
      },
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 } },
        h("div", null, h("h3", { style: { margin: 0, fontSize: 20, fontWeight: 500 } }, `${String(phone + 1).padStart(2, "0")} ${library.screens[phone].title}`), h("p", { style: meta }, library.screens[phone].note)),
        h("button", { type: "button", style: button, onClick: () => setPhone(null) }, "收起大图")
      ),
      h("img", { src: library.screens[phone].image, alt: library.screens[phone].title, style: { display: "block", maxWidth: "100%", width: "auto", maxHeight: 800, margin: "0 auto", objectFit: "contain", borderRadius: 8 } }),
      h(
        "div",
        { style: { display: "flex", gap: 12, justifyContent: "center", marginTop: 20 } },
        h("button", { type: "button", style: button, onClick: () => setPhone((phone + library.screens.length - 1) % library.screens.length) }, "← 上一屏"),
        h("span", { style: { ...meta, alignSelf: "center" } }, `${phone + 1} / ${library.screens.length}`),
        h("button", { type: "button", style: button, onClick: () => setPhone((phone + 1) % library.screens.length) }, "下一屏 →")
      )
    );
    const journey = h(
      "section",
      { "data-section": "journey" },
      sectionTitle("02", "用户用手机，怎样做出自己的作品", `已收录 ${library.screens.length} 屏 · 原页面记录，非真实API验收`),
      h("p", { style: { ...text, marginBottom: 20 } }, "看到内容与口令 → Safari打开模板 → 上传并生成 → 保存／可选注册 → 首页与再次使用"),
      h(
        "div",
        { style: { display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12 } },
        h("button", { type: "button", style: button, "aria-label": "向前浏览手机页面", onClick: () => rail.current?.scrollBy({ left: -rail.current.clientWidth * 0.75, behavior: "auto" }) }, "←"),
        h("button", { type: "button", style: button, "aria-label": "向后浏览手机页面", onClick: () => rail.current?.scrollBy({ left: rail.current.clientWidth * 0.75, behavior: "auto" }) }, "→")
      ),
      h(
        "div",
        { ref: rail, tabIndex: 0, "aria-label": `${library.screens.length}屏手机页面，横向滚动`, style: { display: "flex", overflowX: "auto", gap: 16, padding: "0 0 16px" } },
        ...library.screens.map((screen, index) => h(
          "button",
          { key: screen.title, type: "button", "data-screen": index, onClick: () => setPhone(index), style: { padding: 0, border: 0, borderRadius: 12, background: "transparent", color: c.text, flex: `0 0 ${compact ? Math.max(220, width * 0.68) : 192}px`, textAlign: "left", cursor: "pointer" } },
          h("img", { src: screen.image, alt: `iPhone 15 Pro Max带壳页面：${screen.title}`, loading: "lazy", style: { display: "block", width: "100%", borderRadius: 12 } }),
          h("p", { style: { ...text, fontSize: 15, fontWeight: 500, color: c.text, marginTop: 12 } }, `${String(index + 1).padStart(2, "0")} ${screen.title}`),
          h("p", { style: { ...meta, fontSize: 13, marginTop: 4 } }, screen.note)
        ))
      ),
      h("p", { style: { ...meta, marginTop: 12 } }, "请补充获授权的手机页面截图；真实生成、权益与相册保存须另外验证。"),
      phonePreview
    );
    const steps = [["arrivals", "到站用户"], ["codeUsers", "有效口令"], ["starts", "发起生成"], ["successes", "生成成功"], ["saves", "确认保存"]];
    const results = h(
      "section",
      { "data-section": "results" },
      sectionTitle("03", "来了多少人，做成多少，花了多少钱", example ? "示例数据，用于检查呈现" : "缺失数据留空"),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: compact ? "1fr" : "minmax(0, 1.4fr) minmax(0, 1fr)", gap: 20 } },
        h(
          "div",
          { style: card },
          h("h3", { style: { margin: "0 0 20px", fontSize: 18, fontWeight: 500 } }, "使用路径"),
          h(
            "div",
            { style: { display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 24 } },
            h("p", { style: meta }, "发布内容 ", h("span", { "data-metric": "posts", style: { color: c.text, fontWeight: 500 } }, format(data.posts)), " 篇"),
            h("p", { style: meta }, "内容曝光 ", h("span", { "data-metric": "views", style: { color: c.text, fontWeight: 500 } }, format(data.views)), " 次")
          ),
          h(
            "div",
            { "aria-label": example ? "示例使用转化，非实际结果" : "使用数据待填", style: { display: "flex", flexDirection: "column", gap: 16 } },
            ...steps.map(([key, label], index) => {
              const previous = index ? data[steps[index - 1][0]] : null;
              const ratio = data[key] !== null && previous ? `${(100 * data[key] / previous).toFixed(1)}% / 上一步` : "—";
              return h(
                "div",
                { key, style: { display: "grid", gridTemplateColumns: compact ? "76px 44px minmax(0,1fr)" : "88px 56px minmax(0,1fr)", columnGap: 12, alignItems: "center" } },
                h("span", { style: { ...meta, fontSize: 15 } }, label),
                h("span", { "data-metric": key, style: { ...number, fontSize: compact ? 26 : 30 } }, format(data[key])),
                h(
                  "div",
                  null,
                  h(
                    "div",
                    { style: { height: 6, borderRadius: 3, background: c.inset, overflow: "hidden" } },
                    h("div", { style: { height: "100%", width: data[key] !== null && data.arrivals ? `${Math.min(100, 100 * data[key] / data.arrivals)}%` : 0, background: c.text, borderRadius: 3 } })
                  ),
                  h("p", { style: { ...meta, fontSize: 12, marginTop: 6 } }, index ? ratio : "去重到站用户")
                )
              );
            })
          ),
          h(
            "div",
            { style: { display: "grid", gridTemplateColumns: compact ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: 16, borderTop: `1px solid ${c.line}`, marginTop: 24, paddingTop: 20 } },
            metric("注册账号", "registrations", "保存与注册单列"),
            metric("真实付费", "paidUsers", "排除团队测试"),
            metric("愿意发布", "willingToShare", "反馈意愿，非发帖"),
            metric("再次使用", "repeatUsers", "第二次发起生成")
          )
        ),
        h(
          "div",
          { style: card },
          h("h3", { style: { margin: "0 0 20px", fontSize: 18, fontWeight: 500 } }, "测试收支"),
          h(
            "div",
            { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 } },
            h("div", null, h("p", { style: meta }, "实际收入"), h("p", { "data-money": "revenue", style: { ...number, margin: "12px 0 0", fontSize: compact ? 28 : 34 } }, format(data.revenue, true))),
            h("div", null, h("p", { style: meta }, "生成消耗"), h("p", { "data-money": "generationCost", style: { ...number, margin: "12px 0 0", fontSize: compact ? 28 : 34 } }, format(data.generationCost, true)))
          ),
          moneyRow("退款", data.refunds),
          moneyRow("生成收支差额", balance),
          moneyRow("获客投入", data.acquisitionCost),
          moneyRow("测试收支差额", experiment, true),
          h("p", { style: { ...meta, fontSize: 13, marginTop: 16 } }, "收入 − 退款 − 生成消耗 − 获客投入；未计人工与固定费用。生成消耗包含收费失败与重试。")
        )
      ),
      h(
        "details",
        { style: { marginTop: 20, fontSize: 14, color: c.sub } },
        h("summary", { style: { cursor: "pointer" } }, "数据从哪里来、怎样统计"),
        h("div", { style: { display: "grid", gap: 12, marginTop: 16 } }, ...report.dictionary.map((row) => h("p", { key: row[0], style: meta }, h("span", { style: { color: c.text, fontWeight: 500 } }, `${row[0]} · `), `${row[1]}。${row[2]} 来源：${row[3]}`))),
        h("p", { style: { ...meta, marginTop: 12 } }, "统一统计截止时间待填写。人数按同一窗口去重；保存需设备或回访确认，下载点击另记。未知不是0。")
      )
    );
    const reviewText = example ? [report.reviewExample.result, report.reviewExample.gap, report.reviewExample.next] : ["完成作品与付费结果 —；愿意发布、再次使用 —", "主要流失环节 —；失败原因 —；收支差额 —", "优先动作 —；负责人 —；复测范围与预算 —；下一次观察指标 —"];
    const review = h(
      "section",
      { "data-section": "review" },
      sectionTitle("04", "这次验证了什么，下一轮怎么做", example ? "示例复盘，非实际结论" : "待真实结果填写"),
      h("p", { "data-review-summary": true, style: { margin: "0 0 24px", fontSize: compact ? 20 : 22, lineHeight: 1.7, color: c.text } }, example ? report.reviewExample.summary : "本轮结论：待真实用户与收支数据填写"),
      h(
        "div",
        { style: { display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(3,minmax(0,1fr))", gap: 24 } },
        ...["验证结果", "主要问题", "下一轮动作"].map((title, index) => h(
          "article",
          { key: title, style: { borderTop: `1px solid ${c.line}`, paddingTop: 16 } },
          h("h3", { style: { margin: "0 0 12px", fontSize: 18, fontWeight: 500 } }, title),
          h("p", { style: text }, reviewText[index])
        ))
      ),
      h("p", { style: { ...meta, marginTop: 24 } }, "公开分发模板不附团队成果，页面稿、成片效果、网站可用和商业结果需分别填写与验收。")
    );
    return h(
      "div",
      { ref: root, style: { width: "100%", minWidth: 0, overflowY: "auto", padding: compact ? 20 : 32, color: c.text, fontFamily: "inherit", boxSizing: "border-box" } },
      h(
        "div",
        { style: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 } },
        h("div", null, h("h1", { style: { margin: 0, fontSize: compact ? 28 : 32, fontWeight: 500, lineHeight: 1.3 } }, REPORT_TITLE), h("p", { style: { ...meta, marginTop: 8 } }, "品牌内容、四天执行、费用与真实转化")),
        h("button", { type: "button", "data-mode-toggle": true, "aria-pressed": example, onClick: () => setExample(!example), style: { ...button, background: example ? c.inverse : c.paper, color: example ? c.inverseText : c.text } }, example ? "示例预演 · 切回留空" : "查看示例数据")
      ),
      h("p", { role: "status", "aria-live": "polite", "data-mode-status": true, style: { ...meta, borderLeft: `2px solid ${example ? c.warning : c.line}`, paddingLeft: 12, marginBottom: 32, color: example ? c.warning : c.sub } }, example ? "示例预演：以下数字与复盘均为模拟；公开包不附样片和手机页面。" : "交付视图：缺失的用户数据、账务和复盘结论留空"),
      h(CommercialPanel),
      h("div", { style: { display: "flex", flexDirection: "column", gap: 44 } }, templates, journey, h("details", null, h("summary", { style: { cursor: "pointer", fontSize: 18 } }, "原报告统计口径与示例预演（实际数据在上方填写）"), results, review)),
      h(
        "details",
        { style: { marginTop: 36, paddingTop: 20, borderTop: `1px solid ${c.line}`, color: c.sub, fontSize: 14 } },
        h("summary", { style: { cursor: "pointer" } }, "来源与视觉参考"),
        h(
          "div",
          { style: { display: "grid", gap: 12, marginTop: 16 } },
          link("手机页面原工作", "buzz://message?channel=507c2186-9889-44e0-b6a9-189ff96a98cc&id=3766239581703c375a51a34d6a91196ce85656076ca187b157c47cd9e4e67224"),
          h("p", { style: meta }, "视觉方向从已收藏的ChatGPT重设计、Flow AI工具界面、支付卡片归纳，尚非已获确认的个人风格规范。"),
          h("p", { style: { ...meta, fontSize: 13 } }, "界面方法参考 Damir Sokolovsky / Unslop，CC BY 4.0；潘涛 Studio 制作"),
          link("Unslop · CC BY 4.0", "https://github.com/heydamir/unslop")
        )
      )
    );
  }
  ctx.pages.register({
    id: "report",
    title: REPORT_TITLE,
    primary: true,
    layout: "document",
    component: function ScopedReportPage() {
      const connection = React.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot);
      if (connection.status !== "ready" || !connection.session?.viewer) return h("p", { style: meta }, "请连接社区后打开成果报告。");
      return h(ReportPage, { key: `${connection.scope}:${connection.generation}:${connection.session.viewer}` });
    }
  });
}

// src/plugin-icons/context.mjs
function withPluginIcon(context, icon) {
  const services = /* @__PURE__ */ new Map();
  return new Proxy(context, { get(target, key) {
    const value = Reflect.get(target, key, target);
    if ((key === "pages" || key === "panels") && value) {
      if (!services.has(key)) services.set(key, new Proxy(value, { get(service, name) {
        const method = Reflect.get(service, name, service);
        if (name === "register") return (contribution) => method.call(service, key === "pages" ? { ...contribution, icon } : contribution.launcher ? { ...contribution, launcher: { ...contribution.launcher, icon } } : contribution);
        return typeof method === "function" ? method.bind(service) : method;
      } }));
      return services.get(key);
    }
    return typeof value === "function" ? value.bind(target) : value;
  } });
}

// <stdin>
function apply2(ctx) {
  return apply(withPluginIcon(ctx, "data:image/png;base64,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"));
}
export {
  COMMERCIAL_METRICS,
  REPORT_TITLE,
  apply2 as apply,
  brandCategories,
  commercialScenario,
  emptyCommercialPlan,
  filterTemplates,
  inject,
  normalizeCommercialPlan,
  normalizeLibrary,
  shiftCommercialDate
};
