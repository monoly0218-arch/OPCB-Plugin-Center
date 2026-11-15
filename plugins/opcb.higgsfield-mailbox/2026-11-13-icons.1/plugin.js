// src/plugin-icons/bases/opcb.higgsfield-mailbox/plugin.js
var inject = ["react", "pages", "panels", "relay", "host"];
function parseNotes(events, author) {
  const heads = /* @__PURE__ */ new Map();
  for (const event of [...events].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))) {
    const name = event.tags?.find((t) => t[0] === "d")?.[1];
    if (event.kind !== 30023 || event.pubkey !== author || !/^higgsfield-account-pool(?:-\d{3,}-\d{3,})?$/.test(name || "")) continue;
    if (!heads.has(name)) heads.set(name, event);
  }
  const rows = /* @__PURE__ */ new Map();
  const email = (text) => text?.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  for (const note of heads.values()) {
    const blocks = note.content.split(/^##\s+(?=HF-\d{3,}\b)/m).slice(1);
    for (const block of blocks) {
      const id = block.match(/^HF-\d{3,}/)?.[0];
      if (!id || rows.has(id)) throw new Error("号池存在重复编号，请核对原笔记");
      const field = (regex) => block.split("\n").find((line) => regex.test(line)) || "";
      const login = email(field(/^-\s*邮箱[：:]/)) || email(block.split("\n")[0]);
      const passwordLine = field(/^-\s*(?:提供的)?密码[：:]/);
      const password = passwordLine.match(/`([^`]+)`/)?.[1] || "";
      const aux = email(field(/^-\s*(?:第三方收码邮箱(?:／辅助邮箱)?|辅助邮箱)[：:]/));
      const status = field(/^-\s*Higgsfield\s*状态[：:]/).replace(/^-.*?[：:]\s*/, "").replace(/\*\*/g, "");
      const legacy = field(/^-\s*对应邮箱收码链接[：:]/).match(/https:\/\/s\.77youxiang\.com\/m\/[A-Za-z0-9_-]+/)?.[0] || "";
      const temp = aux && /Temp\s*Mail|temp-mail\.io/i.test(block);
      rows.set(id, {
        id,
        login,
        password,
        aux,
        status,
        legacy,
        provider: temp ? "temp-mail" : legacy ? "legacy" : "recovery",
        source: note.id,
        updated: note.created_at,
        note: note.tags.find((t) => t[0] === "d")[1]
      });
    }
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
}
async function readPoolNotes(session, author, options = {}) {
  const limit = 100, combined = /* @__PURE__ */ new Map();
  let cursor;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    options.signal?.throwIfAborted();
    const page = await session.readPage([{ kinds: [30023], authors: [author], limit, ...cursor }], options);
    options.signal?.throwIfAborted();
    if (!Number.isInteger(page.relayCount) || page.relayCount < 0) throw new Error("当前 Buzz 缺少笔记分页计数，无法确认完整号池");
    const events = page.events.filter((e) => e.kind === 30023 && e.pubkey === author && (!cursor || e.created_at < cursor.until || e.created_at === cursor.until && e.id > cursor.before_id)).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
    if (page.relayCount > 0 && !events.length) throw new Error("号池笔记分页未推进，请刷新后重试");
    for (const event of events) {
      const name = event.tags?.find((t) => t[0] === "d")?.[1] || "";
      if (/^higgsfield-account-pool(?:-\d{3,}-\d{3,})?$/.test(name)) combined.set(event.id, event);
    }
    if (page.relayCount < limit) return [...combined.values()];
    const last = events.at(-1);
    cursor = { until: last.created_at, before_id: last.id };
  }
  throw new Error("号池笔记分页超过上限，未将不完整结果作为库存");
}
function plainText(html) {
  return String(html || "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
function normalizeMessages(payload) {
  const list = Array.isArray(payload) ? payload : payload?.messages;
  if (!Array.isArray(list)) throw new Error("邮箱接口格式变化，未读取验证码");
  return list.map((item) => {
    const subject = String(item.subject || "");
    const body = plainText(item.body_text || item.body_html || item.body || "");
    const stamp = item.created_at ?? item.date ?? item.timestamp;
    const time = typeof stamp === "number" ? stamp * (stamp < 1e12 ? 1e3 : 1) : Date.parse(stamp);
    return {
      id: String(item.id || item.message_id || subject + "|" + body),
      subject,
      body,
      from: String(item.from?.address || item.from || ""),
      to: String(item.to?.address || item.to || ""),
      time
    };
  });
}
function mailboxURL(address) {
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(address)) throw new Error("辅助邮箱地址格式不正确");
  return "https://api.internal.temp-mail.io/api/v3/email/" + encodeURIComponent(address).replace(/%40/gi, "@") + "/messages";
}
function legacyMessages(html) {
  const body = plainText(html);
  const codes = [...body.matchAll(/(?:安全代码|安全碼|验证码|驗證碼|一次性代码|一次性代碼|security code|verification code|single.use code|one.time code|code is)\s*(?:为|為|是|is)?\s*[:：]?\s*(\d{4,8})\b/gi)].map((m) => m[1]);
  return [...new Set(codes)].map((code) => ({ id: "legacy-code:" + code, subject: "", body, from: "", to: "", time: NaN, legacyCode: code }));
}
function selectCodes(messages, baseline, account, nowMs = Date.now()) {
  if (!baseline || baseline.account !== account.id || nowMs - baseline.started > 10 * 60 * 1e3)
    throw new Error("请先开始本次收码，再向登录页面请求验证码（收码窗口10分钟）");
  const codes = [];
  for (const message of messages) {
    if (baseline.ids.includes(message.id)) continue;
    if (Number.isFinite(message.time) && message.time < baseline.started - 5e3) continue;
    if (message.to && !message.to.toLowerCase().includes((account.aux || account.login).toLowerCase())) continue;
    const text = message.subject + " " + message.body;
    if (!/microsoft|微软|higgsfield/i.test(message.from + " " + text)) continue;
    const mentioned = [...message.body.matchAll(/[A-Z0-9*._%+-]+@(?:outlook|hotmail|live)\.com/gi)].map((m) => m[0]);
    if (mentioned.length && !mentioned.some((value) => new RegExp("^" + value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i").test(account.login))) continue;
    const match = message.legacyCode ? [null, message.legacyCode] : text.match(/(?:安全代码|安全碼|验证码|驗證碼|一次性代码|一次性代碼|security code|verification code|single.use code|one.time code|code is|code:)\s*(?:为|為|是|is)?\s*[:：]?\s*(\d{4,8})\b/i) || message.subject.match(/\b(\d{6})\b/);
    if (match) codes.push({ id: message.id, code: match[1], subject: message.subject, time: Number.isFinite(message.time) ? message.time : null });
  }
  return codes;
}
function shareText(account, withPassword = false) {
  const safe = (value) => String(value).replace(/[\r\n]/g, " ");
  return [
    "Higgsfield 账号卡 · " + account.id,
    "账号：" + safe(account.login),
    ...withPassword ? ["密码：" + safe(account.password)] : [],
    "辅助邮箱：" + safe(account.aux || "未提供"),
    "[查询邮箱验证码](higgsfield-mailbox:" + account.id + ")",
    "领取只代表占用；登录、额度和收码需现场核对。"
  ].join("\n");
}
function apply(ctx) {
  const R = ctx.react, h = R.createElement;
  const AUTHOR = "9903103630d49a6693cbc4ddc65c94dcdf12a3bfebef42c8bd46340b8b602608";
  const OWNER = "5770c1ebb2a1d76ccd7fc7231036f74bb9ee13d95b5e0070b55d2b5b0a234f48";
  const box = { padding: "var(--space-panel-inset, 16px)", display: "grid", gap: "var(--space-4, 16px)", minWidth: 0 };
  const stack = { display: "grid", gap: "var(--space-2, 8px)", minWidth: 0 };
  const actions = { display: "flex", gap: "var(--space-2, 8px)", flexWrap: "wrap", alignItems: "center" };
  const button = (text, click, disabled = false, extra = {}) => h("button", { type: "button", onClick: click, disabled, style: { minHeight: 40 }, ...extra }, text);
  const field = (label, props) => h("label", { style: stack }, h("span", null, label), h("input", { ...props, style: { width: "100%", minHeight: 40, ...props.style } }));
  const live = (snapshot) => {
    const current = ctx.relay.snapshot();
    if (current.status !== "ready" || current.cached || current.scope !== snapshot.scope || current.session !== snapshot.session) throw new Error("社区连接已变化，请刷新后重试");
    return current;
  };
  async function pool(operation, payload = {}) {
    const raw = await ctx.host.runCommand("pool", JSON.stringify({ operation, payload }));
    if (!raw) throw new Error("本机号池不可达，请确认插件安装在 Moo 的 Mac 上");
    const response = JSON.parse(raw);
    if (!response.ok) throw new Error(response.error || "号池操作失败");
    return response.result;
  }
  async function readInbox(account) {
    let url;
    if (account.provider === "temp-mail") url = mailboxURL(account.aux);
    else if (account.provider === "legacy") url = account.legacy;
    else throw new Error("该邮箱缺可查询的恢复入口，请补齐原收件资料");
    const result = await ctx.host.request({ url, method: "GET", timeoutMs: 12e3 });
    if (result.status !== 200) throw new Error(result.status === 400 || result.status === 404 ? "原收件箱未恢复或已不可用，请先在原平台恢复完整地址" : "邮箱查询失败（HTTP " + result.status + "），请稍后手动重试");
    if (account.provider === "temp-mail") {
      try {
        return normalizeMessages(JSON.parse(result.body));
      } catch (error) {
        throw new Error(error instanceof SyntaxError ? "邮箱返回非JSON内容，未读取验证码" : error.message);
      }
    }
    return legacyMessages(result.body);
  }
  function Icon(name) {
    const paths = { copy: ["M8 8h11v11H8z", "M5 15H4V4h11v1"], eye: ["M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"], "eye-off": ["m3 3 18 18", "M9 5c7-2 13 7 13 7s-2 4-5 6M6 6c-3 2-4 6-4 6s3 7 10 7c2 0 3 0 4-1"], mail: ["M3 5h18v14H3z", "m3 6 9 7 9-7"], refresh: ["M20 7v5h-5", "M4 17v-5h5", "M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"], share: ["M12 16V3m-5 5 5-5 5 5", "M5 12v9h14v-9"], plus: ["M12 5v14M5 12h14"], close: ["m6 6 12 12M6 18 18 6"] };
    return h("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, ...(paths[name] || paths.mail).map((d, i) => h("path", { key: i, d })));
  }
  function Card({ account, snapshot, destination, refresh }) {
    const [reveal, setReveal] = R.useState(false), [busy, setBusy] = R.useState("");
    const [notice, setNotice] = R.useState(""), [error, setError] = R.useState("");
    const [baseline, setBaseline] = R.useState(null), [codes, setCodes] = R.useState([]);
    const [preview, setPreview] = R.useState(false), [includePassword, setIncludePassword] = R.useState(false);
    const alive = R.useRef(true), pending = R.useRef(false);
    R.useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    R.useEffect(() => {
      if (!codes.length) return;
      const timer = setTimeout(() => setCodes([]), 18e4);
      return () => clearTimeout(timer);
    }, [codes]);
    async function run(name, work) {
      if (pending.current) return;
      pending.current = true;
      setBusy(name);
      setError("");
      setNotice("");
      try {
        live(snapshot);
        await work();
      } catch (e) {
        if (alive.current) setError(e.message || "操作未完成，请重试");
      } finally {
        pending.current = false;
        if (alive.current) setBusy("");
      }
    }
    async function copy(value) {
      if (!navigator.clipboard?.writeText) throw new Error("系统剪贴板不可用，请选择文本复制");
      await navigator.clipboard.writeText(value);
      if (alive.current) setNotice("已复制");
    }
    const stateLabel = { available: "待领", reserved: "已占用", uncertain: "提交待核查", used: "已使用", blocked: "资料待修复" }[account.local?.state] || "待核对";
    const textStyle = { overflowWrap: "anywhere", margin: 0 };
    const quietButton = { border: 0, background: "transparent", minHeight: 36, minWidth: 36, padding: 8 };
    const line = (label, value, copyLabel, extra) => h(
      "div",
      { style: { display: "grid", gridTemplateColumns: "64px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border-standard)" } },
      h("span", { className: "text-subtle text-caption" }, label),
      h("span", { style: { overflowWrap: "anywhere", fontFamily: label === "密码" ? "monospace" : void 0 } }, value),
      h("div", { style: { ...actions, gap: 0 } }, extra, button(Icon("copy"), () => run("copy", () => copy(label === "密码" ? account.password : label === "账号" ? account.login : account.aux)), !!busy || !value, { "aria-label": copyLabel, title: copyLabel, style: quietButton }))
    );
    async function begin() {
      const messages = await readInbox(account);
      live(snapshot);
      if (alive.current) {
        setBaseline({ account: account.id, ids: messages.map((x) => x.id), started: Date.now() });
        setCodes([]);
        setNotice("旧邮件已排除。现在到登录页面请求验证码，再点查询。");
      }
    }
    async function queryCode() {
      const found = selectCodes(await readInbox(account), baseline, account);
      live(snapshot);
      if (alive.current) {
        setCodes(found);
        setNotice(found.length ? found.length === 1 ? "已收到新验证码，复制后填入登录页面" : "收到多封新验证码，请核对请求时间后选择" : "尚未发现本次新验证码，稍后手动查询即可");
      }
    }
    return h(
      "section",
      { style: { ...box, gap: 20, padding: 24 }, "aria-label": account.id + " 账号" },
      h(
        "header",
        { style: { ...actions, justifyContent: "space-between" } },
        h(
          "div",
          { style: { ...actions, gap: 10 } },
          h("span", { style: { display: "grid", placeItems: "center", width: 40, height: 40, borderRadius: 12, background: "var(--surface-navigation-selected)", color: "var(--text-standard)" } }, Icon("mail")),
          h("div", null, h("h3", { style: { margin: 0, fontSize: "1.15rem" } }, account.id), h("span", { className: "text-subtle text-caption" }, account.provider === "temp-mail" ? "Temp Mail 辅助邮箱" : account.provider === "legacy" ? "原账号专属邮箱" : "收码资料待补齐"))
        ),
        h("span", { className: "text-caption", style: { padding: "4px 10px", borderRadius: 20, background: "var(--surface-navigation-selected)" } }, stateLabel)
      ),
      h(
        "div",
        null,
        line("账号", account.login || "未提供", "复制账号"),
        line("密码", account.password ? reveal ? account.password : "••••••••" : "未提供", "复制密码", button(Icon(reveal ? "eye-off" : "eye"), () => setReveal(!reveal), !account.password, { "aria-label": reveal ? "隐藏密码" : "显示密码", title: reveal ? "隐藏密码" : "显示密码", style: quietButton })),
        line("辅助邮箱", account.aux || "未保存完整地址", "复制邮箱")
      ),
      h(
        "section",
        { "aria-label": "验证码", style: { display: "grid", gap: 16, padding: 20, borderRadius: 14, background: "var(--surface-navigation-selected)" } },
        h("div", { style: { ...actions, justifyContent: "space-between" } }, h("strong", null, "邮箱验证码"), h("span", { className: "text-subtle text-caption" }, codes.length ? "已收到新邮件" : baseline ? "等待新邮件" : "尚未开始")),
        h(
          "div",
          { style: { minHeight: 68, display: "grid", alignItems: "center", justifyItems: "center", gap: 10 } },
          codes.length ? codes.map((code, i) => h("div", { key: code.id + "-" + i, style: actions }, h("code", { style: { fontSize: "2rem", letterSpacing: "0.2em", fontWeight: 600 } }, code.code), button(Icon("copy"), () => run("copy", () => copy(code.code)), !!busy, { "aria-label": "复制验证码", title: "复制验证码", style: quietButton }))) : h("span", { "aria-label": "尚无验证码", style: { fontSize: "1.7rem", letterSpacing: "0.18em", color: "var(--text-subtle)", fontFamily: "monospace" } }, "— — — — — —")
        ),
        h("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 } }, ...["1 准备邮箱", "2 请求验证码", "3 查询并复制"].map((label, i) => h("span", { key: label, className: "text-caption", style: { color: i === (codes.length ? 2 : baseline ? 1 : 0) ? "var(--text-standard)" : "var(--text-subtle)", fontWeight: i === (codes.length ? 2 : baseline ? 1 : 0) ? 600 : 400 } }, label))),
        button(h("span", { style: { ...actions, justifyContent: "center" } }, Icon(baseline ? "refresh" : "mail"), busy === "baseline" ? "准备邮箱…" : busy === "query" ? "查询中…" : baseline ? "查询验证码" : "开始本次收码"), () => run(baseline ? "query" : "baseline", baseline ? queryCode : begin), !!busy || account.provider === "recovery", { style: { minHeight: 44, width: "100%", background: "var(--text-standard)", color: "var(--surface-panel)", border: "1px solid var(--text-standard)", borderRadius: 10 } }),
        baseline ? button("重新开始本次收码", () => run("baseline", begin), !!busy, { style: { ...quietButton, fontSize: "0.85rem" } }) : h("p", { className: "text-subtle text-caption", style: { ...textStyle, textAlign: "center" } }, "先准备邮箱，再到登录页面请求新验证码")
      ),
      notice ? h("p", { role: "status", className: "text-caption", style: textStyle }, notice) : null,
      error ? h("p", { role: "alert", className: "text-danger", style: textStyle }, error) : null,
      account.provider === "temp-mail" ? h("details", null, h("summary", { className: "text-subtle text-caption" }, "收不到验证码？"), h("p", { className: "text-subtle text-caption", style: { ...textStyle, marginTop: 8 } }, "复制完整辅助邮箱，在 ", h("a", { href: "https://temp-mail.io/zh", target: "_blank", rel: "noreferrer noopener" }, "Temp Mail"), " 的「改变」中粘贴，核对原地址后重新开始。接口收码仍需实际新邮件验证。")) : null,
      account.provider === "legacy" ? h("p", { className: "text-subtle text-caption", style: textStyle }, "专属邮箱缺少可靠邮件时间，按码值排除旧码；同值重发不会显示为新码。请核对本次请求，不能代替微软辅助邮箱验证。") : null,
      account.provider === "recovery" ? h("p", { className: "text-subtle text-caption", style: textStyle }, "缺少恢复入口，补齐原收件资料后才能查码。") : null,
      h(
        "footer",
        { style: { ...actions, justifyContent: "space-between", paddingTop: 4 } },
        button(h("span", { style: actions }, Icon("share"), "分享账号卡"), () => {
          setPreview(!preview);
          setIncludePassword(false);
        }, !!busy || !destination),
        button("复制全部资料", () => run("copy", () => copy(shareText(account, false))), !!busy, { "aria-label": "复制账号卡" })
      ),
      !destination ? h("p", { className: "text-subtle text-caption", style: textStyle }, "在频道内打开，可直接分享给频道成员。") : null,
      preview ? h(
        "section",
        { style: { ...stack, padding: 16, border: "1px solid var(--border-standard)", borderRadius: 12 }, "aria-label": "分享预览" },
        h("strong", null, "分享至 " + destination.channelName),
        h("label", { style: actions }, h("input", { type: "checkbox", checked: includePassword, onChange: (e) => setIncludePassword(e.target.checked) }), "包含密码（频道成员均可见）"),
        h("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit", fontSize: "0.85rem", margin: 0 } }, shareText(account, includePassword)),
        button(busy === "share" ? "加入发件队列…" : "确认发送到此频道", () => run("share", async () => {
          const current = live(snapshot);
          if (destination.scope !== current.scope || destination.viewer !== current.viewer || !current.session.channels.canWrite(destination.channelId)) throw new Error("当前频道不可发送，请重新打开面板");
          await current.session.messages.send(destination.channelId, shareText(account, includePassword));
          if (alive.current) {
            setPreview(false);
            setIncludePassword(false);
            setNotice("已加入 Buzz 发件队列，请以消息投递状态为准");
          }
        }), !!busy)
      ) : null
    );
  }
  function Workspace({ target = "", channelContext }) {
    const snapshot = R.useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot, ctx.relay.snapshot);
    return h(SessionView, { key: snapshot.scope + ":" + snapshot.generation, snapshot, target, channelContext });
  }
  function SessionView({ snapshot, target, channelContext }) {
    const [rows, setRows] = R.useState([]), [inventory, setInventory] = R.useState(null);
    const [loading, setLoading] = R.useState(false), [error, setError] = R.useState("");
    const [showClaim, setShowClaim] = R.useState(false), [compact, setCompact] = R.useState(true);
    const surface = R.useRef(null);
    R.useEffect(() => {
      if (!surface.current) return;
      const observer = new ResizeObserver((entries) => setCompact(entries[0].contentRect.width < 700));
      observer.observe(surface.current);
      return () => observer.disconnect();
    }, [snapshot.status]);
    const [query, setQuery] = R.useState(""), [selected, setSelected] = R.useState(target.match(/^higgsfield-mailbox:(HF-\d{3,})$/)?.[1] || "");
    const [project, setProject] = R.useState(""), [template, setTemplate] = R.useState(""), [count, setCount] = R.useState("1");
    const [receipt, setReceipt] = R.useState(null), [claimBusy, setClaimBusy] = R.useState(false), [claimError, setClaimError] = R.useState("");
    const active = R.useRef(true), claimLock = R.useRef(false), reload = R.useRef(0);
    const requestController = R.useRef(null);
    R.useEffect(() => {
      active.current = true;
      return () => {
        active.current = false;
        reload.current++;
        requestController.current?.abort();
      };
    }, []);
    async function refresh() {
      const generation = ++reload.current;
      const controller = new AbortController();
      requestController.current?.abort();
      requestController.current = controller;
      setLoading(true);
      setError("");
      try {
        live(snapshot);
        if (typeof snapshot.session.readPage !== "function") throw new Error("当前 Buzz 未提供共享笔记读取接口");
        const notes = await readPoolNotes(snapshot.session, AUTHOR, { fresh: true, signal: controller.signal });
        live(snapshot);
        const parsed = parseNotes(notes, AUTHOR);
        if (!parsed.length) throw new Error("未读到授权号池，请核对当前社区和笔记权限");
        let local = null;
        if (snapshot.viewer === OWNER) {
          try {
            local = await pool("status", { scope: snapshot.scope, owner: snapshot.viewer });
          } catch {
          }
        }
        live(snapshot);
        if (active.current && generation === reload.current) {
          setRows(parsed);
          setInventory(local);
          setSelected((current) => current || parsed.find((a) => local?.accounts?.find((x) => x.id === a.id)?.state === "available")?.id || parsed[0]?.id || "");
          if (local?.claim?.payload) {
            setProject(local.claim.payload.project);
            setTemplate(local.claim.payload.template);
            setCount(String(local.claim.payload.count));
            setReceipt(local.claim.receipt);
            if (local.claim.state === "pending") setShowClaim(true);
          } else setReceipt(null);
        }
      } catch (e) {
        if (active.current && generation === reload.current) {
          setError(e.message || "号池读取失败");
          setRows([]);
          setInventory(null);
        }
      } finally {
        if (active.current && generation === reload.current) setLoading(false);
      }
    }
    R.useEffect(() => {
      void refresh();
    }, []);
    const dest = channelContext?.scope === snapshot.scope ? channelContext : null;
    const localRows = new Map((inventory?.accounts || []).map((a) => [a.id, a]));
    const all = rows.map((a) => ({ ...a, local: localRows.get(a.id) }));
    const filtered = all.filter((a) => (a.id + " " + a.login + " " + a.aux).toLowerCase().includes(query.toLowerCase()));
    const account = all.find((a) => a.id === selected);
    const available = inventory?.accounts?.filter((a) => a.state === "available").length;
    async function claim() {
      if (claimLock.current) return;
      if (!project.trim() || !template.trim() || !/^\d+$/.test(count) || +count < 1 || +count > 30) {
        setClaimError("填写项目、模板版本和1～30的整数数量");
        return;
      }
      claimLock.current = true;
      setClaimBusy(true);
      setClaimError("");
      const payload = { scope: snapshot.scope, epoch: inventory?.claim?.epoch, owner: snapshot.viewer, executor: snapshot.viewer, project: project.trim(), template: template.trim(), count: +count };
      try {
        live(snapshot);
        if (snapshot.viewer !== OWNER || !inventory?.claiming.enabled || !payload.epoch) throw new Error("本机领取暂不可用，请刷新状态");
        const excluded = all.filter((a) => /used|已使用|reserved|已认领|资料待补/.test(a.status)).map((a) => a.id).sort();
        const result = await pool("claim", { ...payload, exclude_accounts: excluded });
        live(snapshot);
        if (active.current) {
          setReceipt(result);
          if (result.accounts[0]) setSelected(result.accounts[0]);
          await refresh();
        }
      } catch (e) {
        if (active.current) {
          setClaimError(e.message || "领取结果不明，请恢复原申请");
          await refresh();
        }
      } finally {
        claimLock.current = false;
        if (active.current) setClaimBusy(false);
      }
    }
    async function newClaim() {
      if (claimLock.current) return;
      claimLock.current = true;
      setClaimBusy(true);
      setClaimError("");
      try {
        live(snapshot);
        const next = await pool("new_claim", { scope: snapshot.scope, owner: snapshot.viewer, epoch: inventory.claim.epoch });
        live(snapshot);
        if (active.current) {
          setInventory((previous) => ({ ...previous, claim: next }));
          setReceipt(null);
        }
      } catch (e) {
        if (active.current) setClaimError(e.message || "无法新建申请，请先恢复上次结果");
      } finally {
        claimLock.current = false;
        if (active.current) setClaimBusy(false);
      }
    }
    if (snapshot.status !== "ready" || snapshot.cached) return h("section", { style: box }, h("p", { role: "status" }, "连接当前社区后读取号池。"));
    return h(
      "main",
      { ref: surface, style: { ...box, padding: compact ? 16 : 24, gap: 20, maxWidth: 1080, margin: "0 auto" } },
      h(
        "header",
        { style: { ...actions, justifyContent: "space-between", gap: 12 } },
        h("div", null, h("h2", { style: { margin: 0, fontSize: "1.4rem", letterSpacing: "-0.03em" } }, "higgsfiled号池1.3"), h("p", { className: "text-subtle text-caption", style: { margin: "4px 0 0" } }, "选账号，复制资料，查新验证码。")),
        h(
          "div",
          { style: actions },
          button(Icon("refresh"), refresh, loading, { "aria-label": "刷新号池", title: "刷新号池", style: { minHeight: 40, width: 40, padding: 8 } }),
          inventory ? button(h("span", { style: actions }, Icon("plus"), "领取新账号"), () => setShowClaim(!showClaim), false, { "aria-expanded": showClaim, style: { minHeight: 40, background: "var(--text-standard)", color: "var(--surface-panel)", borderRadius: 10 } }) : null
        )
      ),
      h(
        "div",
        { className: "text-caption", style: { ...actions, gap: 20, color: "var(--text-subtle)" } },
        h("span", null, "全部 ", h("strong", { style: { color: "var(--text-standard)" } }, all.length)),
        inventory ? h("span", null, "待领 ", h("strong", { style: { color: "var(--text-standard)" } }, available)) : null,
        inventory ? h("span", null, "已占用 ", h("strong", { style: { color: "var(--text-standard)" } }, inventory.accounts.filter((a) => a.state === "reserved" || a.state === "uncertain").length)) : null,
        h("span", null, loading ? "同步中…" : "来自共享号池")
      ),
      error ? h("p", { role: "alert", className: "text-danger" }, error) : null,
      showClaim && inventory ? h(
        "section",
        { "aria-label": "领取表单", className: "ui-card", style: box },
        h("div", { style: { ...actions, justifyContent: "space-between" } }, h("strong", null, "领取账号"), button(Icon("close"), () => setShowClaim(false), claimBusy, { "aria-label": "关闭领取表单", style: { border: 0, background: "transparent" } })),
        h(
          "div",
          { style: { display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr 100px", gap: 12 } },
          field("项目", { value: project, disabled: claimBusy || inventory.claim?.state !== "empty", onChange: (e) => {
            setProject(e.target.value);
            setReceipt(null);
          }, placeholder: "例如：洗衣机换装" }),
          field("模板版本", { value: template, disabled: claimBusy || inventory.claim?.state !== "empty", onChange: (e) => {
            setTemplate(e.target.value);
            setReceipt(null);
          }, placeholder: "例如：V1" }),
          field("数量（每次最多30个）", { type: "number", min: 1, max: 30, value: count, disabled: claimBusy || inventory.claim?.state !== "empty", onChange: (e) => {
            setCount(e.target.value);
            setReceipt(null);
          } })
        ),
        h(
          "div",
          { style: actions },
          button(claimBusy ? "领取中…" : receipt ? "查看本次领取结果" : inventory.claim?.state === "pending" ? "恢复上次领取" : "确认领取", claim, claimBusy || inventory.claiming.enabled !== true || !inventory.claim?.epoch),
          receipt ? button("新建另一批申请", newClaim, claimBusy) : null
        ),
        inventory.claim?.state === "pending" ? h("p", { role: "status", className: "text-caption" }, "上次申请已保存，恢复将核对同一批结果，不会另领一批。") : null,
        inventory.claiming.enabled !== true ? h("p", null, "领取暂停，请刷新状态") : null,
        receipt ? h("p", { role: "status", className: "text-caption" }, "本次已领 " + receipt.allocated + " / " + receipt.requested + " 个：" + receipt.accounts.join("、") + "；缺口 " + receipt.shortfall) : null,
        claimError ? h("p", { role: "alert", className: "text-danger" }, claimError) : null
      ) : null,
      h(
        "div",
        { className: "ui-card", style: { display: "grid", gridTemplateColumns: compact ? "minmax(0,1fr)" : "260px minmax(0,1fr)", overflow: "hidden" } },
        h(
          "aside",
          { style: { padding: 16, borderRight: compact ? 0 : "1px solid var(--border-standard)", borderBottom: compact ? "1px solid var(--border-standard)" : 0, display: "grid", gap: 12, alignContent: "start" } },
          field("搜索账号", { type: "search", value: query, onChange: (e) => setQuery(e.target.value), placeholder: "编号 / 邮箱", "aria-label": "搜索编号或邮箱" }),
          compact ? h("label", { style: stack }, h("span", { className: "text-subtle text-caption" }, "当前账号"), h("select", { "aria-label": "选择账号", value: selected, onChange: (e) => setSelected(e.target.value), style: { width: "100%", minHeight: 42 } }, ...filtered.map((a) => h("option", { key: a.id, value: a.id }, a.id + " · " + ({ available: "待领", reserved: "已占用", used: "已使用", uncertain: "待查", blocked: "待修复" }[a.local?.state] || "未核验"))))) : h("nav", { "aria-label": "账号列表", style: { display: "grid", gap: 4, maxHeight: "min(65vh,600px)", overflowY: "auto", padding: 3, margin: -3 } }, ...filtered.map((a) => button(
            h("span", { style: { display: "grid", gap: 4, textAlign: "left", minWidth: 0 } }, h("span", { style: { ...actions, justifyContent: "space-between", gap: 8 } }, h("strong", null, a.id), h("span", { className: "text-caption text-subtle" }, { available: "待领", reserved: "已占用", used: "已使用", uncertain: "待查", blocked: "待修复" }[a.local?.state] || "未核验")), h("span", { className: "text-subtle text-caption", style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.login)),
            () => setSelected(a.id),
            false,
            { key: a.id, "aria-label": a.id + " 选择账号", "aria-pressed": a.id === selected, style: { width: "100%", padding: "12px", border: a.id === selected ? "1px solid var(--border-prominent)" : "1px solid transparent", background: a.id === selected ? "var(--surface-navigation-selected)" : "transparent", borderRadius: 10 } }
          ))),
          !filtered.length && !loading ? h("p", { className: "text-subtle text-caption" }, "没有匹配账号") : null
        ),
        account ? h(Card, { key: snapshot.scope + ":" + account.id + ":" + account.source, account, snapshot, destination: dest, refresh }) : h("p", { style: box, className: "text-subtle" }, loading ? "读取账号中…" : "选择账号以查看收码资料")
      ),
      h("p", { className: "text-subtle text-caption", style: { margin: 0 } }, "领取 ≠ 登录或额度可用 · 凭据与验证码不写入插件日志 · 本机领取")
    );
  }
  ctx.pages.register({ id: "main", title: "higgsfiled号池1.3", primary: true, component: Workspace });
  ctx.panels.register({
    id: "mailbox",
    title: "higgsfiled号池1.3",
    matches: (target) => /^higgsfield-mailbox:(?:pool|HF-\d{3,})$/.test(target),
    component: Workspace,
    channelPlacement: "side",
    channelLauncher: ({ toggle }) => button("号池邮箱", () => toggle("higgsfield-mailbox:pool"))
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
  apply2 as apply,
  inject,
  legacyMessages,
  mailboxURL,
  normalizeMessages,
  parseNotes,
  plainText,
  readPoolNotes,
  selectCodes,
  shareText
};
