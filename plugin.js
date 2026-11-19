// src/higgsfield-pool/community-access.js
var ROSTER_KIND = 13534;
var PUBKEY = /^[0-9a-f]{64}$/;
var COMMUNITY_ACCESS = "本社区全员及其 Agent 可用。";
function syncCommunityAccess(relay, channelFor2) {
  let stopSession;
  let activeSession;
  function attach() {
    const connection = relay.snapshot();
    const session = connection.status === "ready" && !connection.cached ? connection.session : void 0;
    if (session === activeSession) return;
    stopSession?.();
    activeSession = session;
    stopSession = void 0;
    if (!session?.relayAuthor || !session.subscribeLive || !session.memberAdditions?.add) return;
    const controller = new AbortController();
    const { signal } = controller;
    let channelId;
    let running = false;
    let change = 0;
    let resolved = 0;
    let latestNotice;
    function eligibleChannel() {
      const current = relay.snapshot();
      if (signal.aborted || current.status !== "ready" || current.cached || current.session !== session) return;
      try {
        const channel = channelFor2(session);
        if (channel.viewerRole === "owner" && !channel.readOnly && Array.isArray(channel.members) && channel.description?.split("\n").includes(COMMUNITY_ACCESS)) return channel;
      } catch {
      }
    }
    const authentic = (event) => event.kind === ROSTER_KIND && event.pubkey === session.relayAuthor;
    async function reconcile() {
      if (running) return;
      running = true;
      try {
        while (resolved < change && !signal.aborted) {
          const revision = change;
          resolved = revision;
          const target = eligibleChannel();
          if (!target) continue;
          const events = await session.read(
            [{ kinds: [ROSTER_KIND], authors: [session.relayAuthor], limit: 1, consistency: "strong" }],
            { fresh: true, signal }
          );
          const roster = events.find(authentic);
          const current = eligibleChannel();
          if (!roster || change !== revision || current?.id !== target.id) continue;
          if (latestNotice && (roster.created_at < latestNotice.created_at || roster.created_at === latestNotice.created_at && roster.id > latestNotice.id)) continue;
          const members = new Map(roster.tags.filter(
            ([tag, key, role]) => tag === "member" && PUBKEY.test(key) && ["owner", "admin", "member"].includes(role)
          ).map(([, key, role]) => [key, role]));
          if (members.get(session.viewer) !== "owner") continue;
          const existing = new Set(current.members);
          const missing = [...members.keys()].filter((key) => !existing.has(key));
          await Promise.allSettled(missing.map((key) => session.memberAdditions.add(current.id, key)));
        }
      } catch (error) {
        if (!signal.aborted) console.warn("Higgsfield 号池无法读取社区成员名单", error);
      } finally {
        running = false;
        if (resolved < change && !signal.aborted) void reconcile();
      }
    }
    function onChannelChange() {
      const next = eligibleChannel()?.id;
      if (next === channelId) return;
      channelId = next;
      change++;
      if (next) void reconcile();
    }
    const stopChannels = session.channels.subscribe(onChannelChange);
    const stopLive = session.subscribeLive(({ events }) => {
      for (const event of events.filter(authentic)) {
        if (!latestNotice || event.created_at > latestNotice.created_at || event.created_at === latestNotice.created_at && event.id < latestNotice.id) {
          latestNotice = event;
          change++;
          if (channelId) void reconcile();
        }
      }
    }, { replay: true });
    stopSession = () => {
      controller.abort();
      stopChannels();
      stopLive();
    };
    onChannelChange();
  }
  const stopRelay = relay.subscribe(attach);
  attach();
  return () => {
    stopRelay();
    stopSession?.();
  };
}

// src/higgsfield-pool/plugin.js
var inject = ["react", "pages", "relay", "agents"];
var CHANNEL_NAME = "Higgsfield 号池";
var SCHEMA = "opcb.higgsfield-pool/2";
var STATES = {
  available: "剩余可领",
  occupied: "占用中",
  used: "已使用",
  no_free: "没有免费次数",
  review: "待核对"
};
var ID = /^HF-\d{3,6}$/;
var KEY = /^[a-zA-Z0-9_.:-]{1,96}$/;
var PUBKEY2 = /^[0-9a-f]{64}$/;
var MAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
var EMPTY_PROFILES = /* @__PURE__ */ new Map();
var emptyProfiles = () => EMPTY_PROFILES;
var noProfileUpdates = () => () => {
};
var BOARD_CSS = `
.hf-team-pool table { width:100%; border-collapse:collapse; }
.hf-team-pool th,.hf-team-pool td { padding:11px 12px; text-align:left; vertical-align:top; border-bottom:1px solid var(--border-subtle, #8883); overflow-wrap:anywhere; }
@media(max-width:640px) {
  .hf-team-pool table,.hf-team-pool tbody { display:block; }
  .hf-team-pool thead { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
  .hf-team-pool tbody tr { display:grid; grid-template-columns:1fr 1fr; border-bottom:1px solid var(--border-subtle, #8883); padding:8px 0; }
  .hf-team-pool tbody th,.hf-team-pool tbody td { display:block; border:0; padding:4px 6px; min-width:0; }
  .hf-team-pool tbody td:nth-child(2) { text-align:right; }
  .hf-team-pool tbody td:last-child { color:var(--text-secondary); font-size:13px; grid-column:1 / -1; }
}
`;
var LOGIN_FLOW = [
  "用与其他账号隔离的 Ego 个人资料打开 Higgsfield，选择微软登录并填写本次领到的主邮箱。",
  "发码前打开本号原辅助邮箱。Temp Mail 网页点「改变」，清空「名称」后真实粘贴完整辅助邮箱，核对域名和最终地址。",
  "确认收件箱就绪后，在微软页面只请求一次登录码。页面要求先输密码时才用本号密码。仅采用本次发码后收到且匹配的新邮件。",
  "暂未收到时复查原收件箱。返回 Higgsfield 后核对站内邮箱及免费次数。页面要求人工确认时交给用户处理。"
];
function text(value, limit, required = false) {
  if (typeof value !== "string" || value.length > limit || required && !value.trim()) {
    throw new Error("号池字段缺失或长度不正确");
  }
  return value;
}
function inboxUrl(value) {
  const url = new URL(text(value, 1e3, true));
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("接码网址必须是 HTTPS");
  return url.href;
}
function channelFor(session) {
  const list = session.channels.list();
  if (list.status !== "ready") throw new Error("团队频道正在连接，稍后刷新。");
  const matches = list.channels.filter((channel) => channel.name === CHANNEL_NAME && channel.private === true && channel.channelType === "stream" && !channel.archived && !channel.cached && !channel.pending && !channel.metadataPending && !channel.metadataCached && channel.members?.includes(session.viewer));
  if (matches.length !== 1) {
    throw new Error(matches.length ? "找到多个同名号池频道，请由团队负责人保留唯一入口。" : "请加入团队的私有频道「Higgsfield 号池」。");
  }
  return matches[0];
}
var venue = (connection) => {
  if (connection?.status !== "ready" || connection.cached || !connection.session?.viewer) {
    throw new Error("请先连接团队所在的 Buzz 社区。");
  }
  return connection.session;
};
function ensureConnection(current, before, channel, signal) {
  signal?.throwIfAborted();
  const after = current();
  if (venue(after) !== before.session || after.scope !== before.scope || after.generation !== before.generation || channelFor(after.session).id !== channel.id) throw new Error("当前社区或号池发生变化，请刷新。");
}
function requireWritable(session, channel) {
  if (channel.readOnly || !session.canvas?.available || typeof session.canvas.save !== "function") {
    throw new Error("当前频道身份或 Buzz 版本不能更新号池。");
  }
}
function isAdmin(channel, viewer) {
  return channel.creator === viewer || channel.owners?.includes(viewer) || ["owner", "admin"].includes(channel.viewerRole);
}
function parseCanvas(event) {
  if (!event) return null;
  let pool;
  try {
    pool = JSON.parse(event.content);
  } catch {
    throw new Error("频道已有其它 Canvas 内容，请使用专用号池频道。");
  }
  if (pool?.schema !== SCHEMA || !Array.isArray(pool.accounts) || !Array.isArray(pool.requests)) {
    throw new Error("频道 Canvas 与号池格式不符。");
  }
  if (pool.accounts.some((row) => !ID.test(row?.id) || !Object.hasOwn(STATES, row.state))) {
    throw new Error("号池记录格式不正确。");
  }
  return pool;
}
function newPool(input) {
  if (!Array.isArray(input?.accounts) || !input.accounts.length || input.accounts.length > 200) {
    throw new Error("请选择包含 1–200 条记录的号池 JSON。");
  }
  const ids = /* @__PURE__ */ new Set();
  const emails = /* @__PURE__ */ new Set();
  const accounts = input.accounts.map((row) => {
    if (!ID.test(row?.id) || ids.has(row.id) || !["available", "review"].includes(row.state)) {
      throw new Error("库存编号重复或初始状态不正确。");
    }
    ids.add(row.id);
    const email = text(row.email, 254, true);
    if (!MAIL.test(email) || emails.has(email.toLowerCase())) throw new Error("主邮箱格式不正确或重复。");
    emails.add(email.toLowerCase());
    const password = text(row.password ?? "", 256, row.state === "available");
    const auxiliaryEmail = text(row.auxiliary_email ?? "", 254, row.state === "available");
    const url = row.inbox_url ? inboxUrl(row.inbox_url) : "";
    if (auxiliaryEmail && !MAIL.test(auxiliaryEmail) || row.state === "available" && !url) {
      throw new Error("可领取记录必须有完整的辅助邮箱和接码网址。");
    }
    return {
      id: row.id,
      email,
      password,
      auxiliary_email: auxiliaryEmail,
      inbox_url: url,
      state: row.state,
      note: text(row.note ?? "", 180)
    };
  });
  return { schema: SCHEMA, accounts, requests: [] };
}
function appendAccounts(pool, input) {
  const { accounts } = newPool(input);
  const byId = new Map(pool.accounts.map((row) => [row.id, row]));
  const byEmail = new Map(pool.accounts.map((row) => [row.email.toLowerCase(), row]));
  const added = [];
  const existing = [];
  for (const row of accounts) {
    const email = row.email.toLowerCase();
    const knownId = byId.get(row.id);
    if (knownId && knownId.email.toLowerCase() !== email) throw new Error(`库存编号 ${row.id} 已用于其他账号。`);
    const knownEmail = byEmail.get(email);
    if (knownEmail) existing.push(knownEmail.id);
    else added.push(row);
  }
  const next = added.length ? { ...pool, accounts: [...pool.accounts, ...added] } : pool;
  return { next, result: { added: added.map((row) => row.id), existing, counts: overview(next).counts } };
}
function rowView(row) {
  return {
    account_id: row.id,
    state: row.state,
    status: STATES[row.state],
    member: row.actor?.member ?? null,
    agent: row.actor?.agent ?? null,
    template: row.template ?? null,
    updated_at: row.updatedAt ?? null,
    note: row.note || null
  };
}
function overview(pool) {
  const counts = Object.fromEntries(Object.keys(STATES).map((key) => [key, 0]));
  const accounts = (pool?.accounts ?? []).map((row) => {
    counts[row.state]++;
    return rowView(row);
  });
  return { initialized: !!pool, counts, accounts };
}
function sameActor(row, actor) {
  return row?.member === actor.member && row?.agent === actor.agent;
}
function claimResult(pool, receipt, actor) {
  const accounts = receipt.ids.map((id) => pool.accounts.find((row) => row.id === id)).filter(Boolean);
  return {
    request_id: receipt.id,
    accounts: accounts.map((row) => row.state === "occupied" && row.hold === receipt.id && sameActor(row.actor, actor) ? {
      ...rowView(row),
      email: row.email,
      password: row.password,
      auxiliary_email: row.auxiliary_email,
      inbox_url: row.inbox_url
    } : rowView(row)),
    login_steps: LOGIN_FLOW
  };
}
function claim(pool, args, actor, now) {
  const key = text(args.request_id, 96, true);
  if (!KEY.test(key)) throw new Error("request_id 格式不正确");
  const count = args.count ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("一次可领取 1–10 个账号");
  const template = text(args.template ?? "", 180);
  const previous = pool.requests.find((item) => sameActor(item, actor) && item.id === key);
  if (previous) {
    if (count !== previous.count || template !== previous.template) throw new Error("重试请使用原领取参数。");
    return { next: pool, result: claimResult(pool, previous, actor) };
  }
  const rows = pool.accounts.filter((row) => row.state === "available").slice(0, count);
  if (rows.length !== count) throw new Error(`当前剩余 ${rows.length} 个，未领取。`);
  const receipt = { id: key, ...actor, count, template, ids: rows.map((row) => row.id) };
  const next = {
    ...pool,
    requests: [...pool.requests, receipt],
    accounts: pool.accounts.map((row) => rows.includes(row) ? { ...row, state: "occupied", actor, hold: key, template, updatedAt: now, note: "" } : row)
  };
  return { next, result: claimResult(next, receipt, actor) };
}
function report(pool, args, actor, now) {
  const actions = ["used", "no_free", "release"];
  if (!actions.includes(args.result) || !ID.test(args.account_id) || !KEY.test(args.request_id)) {
    throw new Error("请提供本次账号、领取编号和有效回传状态。");
  }
  const receipt = pool.requests.find((item) => sameActor(item, actor) && item.id === args.request_id);
  const row = pool.accounts.find((item) => item.id === args.account_id);
  if (!row || !receipt?.ids.includes(row.id)) throw new Error("该账号不属于本次领取。");
  const template = text(args.template || row.template || "", 180, args.result === "used");
  if (args.result === "release") {
    if (args.no_inflight !== true) throw new Error("请先确认尚未使用且没有在途任务，再释放。");
    if (row.state === "available") return { next: pool, result: rowView(row) };
  } else if (row.state === args.result && row.hold === receipt.id && sameActor(row.actor, actor)) {
    if (template !== row.template) throw new Error("本次使用状态已登记。");
    return { next: pool, result: rowView(row) };
  }
  if (row.state !== "occupied" || row.hold !== receipt.id || !sameActor(row.actor, actor)) {
    throw new Error("账号占用已变化，请刷新号池。");
  }
  const changed = args.result === "release" ? { ...row, state: "available", actor: void 0, hold: void 0, template: void 0, updatedAt: void 0 } : { ...row, state: args.result, template, updatedAt: now };
  const next = { ...pool, accounts: pool.accounts.map((item) => item === row ? changed : item) };
  return { next, result: rowView(changed) };
}
async function withCanvas(current, run, { write = false, signal } = {}) {
  const connection = current();
  const session = venue(connection);
  const channel = channelFor(session);
  const guard = () => ensureConnection(current, connection, channel, signal);
  if (write) requireWritable(session, channel);
  if (typeof session.canvas?.read !== "function") throw new Error("请使用支持频道 Canvas 的 Buzz 版本。");
  guard();
  const head = await session.canvas.read(channel.id);
  guard();
  const pool = parseCanvas(head);
  const result = await run({ pool, session, channel });
  guard();
  if (result?.next && result.next !== pool) {
    const content = JSON.stringify(result.next);
    if (new TextEncoder().encode(content).length > 25e4) throw new Error("号池已达 Canvas 容量，请联系管理员。");
    try {
      const saved = await session.canvas.save(channel.id, content, head?.id, { preserveApproval: true });
      guard();
      if (!saved?.id || saved.content !== content) throw new Error("未确认号池写入。");
    } catch (error) {
      if (error?.name === "CanvasConflictError") throw new Error("号池刚有更新，请用原参数重试。");
      if (String(error?.message).includes("wait a second before saving")) throw new Error("号池刚有更新，请一秒后用原参数重试。");
      throw new Error("号池写入结果未确认。请刷新并核对本次操作，再用原参数重试。");
    }
  }
  return result?.result;
}
function agentAccess(ctx, client) {
  const relay = ctx.agents.relay(client.key);
  const actor = { member: client.owner, agent: client.pubkey };
  if (!PUBKEY2.test(actor.member) || !PUBKEY2.test(actor.agent)) throw new Error("Buzz 未提供当前成员与 Agent 身份。");
  const current = () => {
    const connection = relay?.snapshot();
    const human = ctx.relay.snapshot();
    if (venue(connection).viewer !== actor.member || venue(human).viewer !== actor.member || connection.scope !== human.scope) throw new Error("请在当前成员的团队社区使用号池。");
    return connection;
  };
  return { actor, current };
}
function apply(ctx) {
  ctx.effect?.(() => syncCommunityAccess(ctx.relay, channelFor));
  const h = ctx.react.createElement;
  const { useState, useEffect, useSyncExternalStore } = ctx.react;
  const props = (properties, required = []) => ({ type: "object", additionalProperties: false, properties, required });
  const str = { type: "string" };
  const profileName = (profiles, key) => {
    const profile = key ? profiles?.get(key) : null;
    return profile?.displayName || profile?.name || null;
  };
  const agentTool = (name, description, inputSchema, act, write = false) => {
    ctx.agents.addTool({
      name,
      description,
      inputSchema,
      async call(client, _context, args) {
        const { current: current2, actor } = agentAccess(ctx, client);
        const value = await withCanvas(current2, ({ pool, session, channel }) => {
          if (write && !pool) throw new Error("号池还没有导入库存。");
          return act(pool, args, actor, (/* @__PURE__ */ new Date()).toISOString(), session, channel);
        }, { write, signal: client.signal });
        return JSON.stringify(value);
      }
    });
  };
  agentTool(
    "higgsfield_pool_status",
    "读取团队 Higgsfield 号池余量与使用回传。",
    props({}),
    async (pool, _args, _actor, _now, session) => {
      const result = overview(pool);
      const profiles = session.profiles?.snapshot();
      result.accounts = result.accounts.map((row) => ({
        ...row,
        member_name: profileName(profiles, row.member),
        agent_name: profileName(profiles, row.agent)
      }));
      return { result };
    }
  );
  agentTool("higgsfield_pool_claim", "从团队号池领号，返回主邮箱、密码、辅助邮箱、免费接码入口及登录步骤。同一请求重试复用 request_id。", props({
    request_id: str,
    count: { type: "integer", minimum: 1, maximum: 10 },
    template: str
  }, ["request_id"]), claim, true);
  agentTool("higgsfield_pool_report", "回传本次领取账号的使用结果。release 仅在账号未用、无在途任务时填写 no_inflight:true。", props({
    request_id: str,
    account_id: str,
    result: { type: "string", enum: ["used", "no_free", "release"] },
    template: str,
    no_inflight: { type: "boolean" }
  }, ["request_id", "account_id", "result"]), report, true);
  agentTool("higgsfield_pool_append", "管理员将本人明确提供的新账号追加到团队服务器。按主邮箱去重，保留既有状态，回执只含编号和数量。", props({
    accounts: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: props({
        id: str,
        email: str,
        password: str,
        auxiliary_email: str,
        inbox_url: str,
        state: { type: "string", enum: ["available", "review"] },
        note: str
      }, ["id", "email", "state"])
    }
  }, ["accounts"]), (pool, args, actor, _now, _session, channel) => {
    if (!isAdmin(channel, actor.member)) throw new Error("只有团队号池管理员可以追加库存。");
    return appendAccounts(pool, args);
  }, true);
  ctx.agents.addInstructions({
    id: "higgsfield-shared-pool",
    text: "团队号池先用 higgsfield_pool_status 查余量；仅按当前任务领取，重试保留原 request_id 与参数。领取回执的邮箱与密码供本任务使用。按回执 login_steps 在独立 Ego 资料中走 Temp Mail 免费网页流程，先核对原收件箱再发一次码；未收到时复查原收件箱。登录后核对站内邮箱与实际免费次数。使用后用 higgsfield_pool_report 登记 used 和模版名，页面确认没有次数才报 no_free，未用且无在途任务报 release。写入未确认时先刷新查原申请；不得猜测账号状态、重复发码或发起付费。本人明确提供新库存时，管理员核对历史使用情况，用 higgsfield_pool_append 追加到团队服务器。完整且未使用的账号登记 available，字段或状态待确认登记 review。用相同编号和参数重试，回读状态后仅回报数量，不复述凭据。"
  });
  const current = () => ctx.relay.snapshot();
  const statusColor = {
    available: "var(--text-primary)",
    occupied: "light-dark(#885000, #ffcb87)",
    used: "light-dark(#14694f, #6ae8ad)",
    no_free: "light-dark(#96363c, #ffadb2)",
    review: "var(--text-secondary)"
  };
  const stamp = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const label = (profiles, key) => profileName(profiles, key) || key?.slice(0, 8) || "—";
  function Board({ connection }) {
    const session = connection.session;
    const [reload, setReload] = useState(0);
    const [view, setView] = useState({ status: "loading" });
    const [filter, setFilter] = useState("all");
    const [seed, setSeed] = useState(null);
    const [action, setAction] = useState("");
    const [pending, setPending] = useState(false);
    const profileStore = session.profiles;
    const profiles = useSyncExternalStore(
      profileStore?.subscribe ?? noProfileUpdates,
      profileStore?.snapshot ?? emptyProfiles
    );
    useEffect(() => {
      let live = true;
      let running = false;
      let queued = false;
      let watch;
      let unsubscribe;
      const refresh = async () => {
        if (!live) return;
        if (running) {
          queued = true;
          return;
        }
        running = true;
        try {
          const result = await withCanvas(current, ({ pool, channel }) => ({ result: {
            ...overview(pool),
            canImport: !pool && !channel.readOnly && session.canvas.available && isAdmin(channel, session.viewer)
          } }));
          if (!live) return;
          const keys = [...new Set(result.accounts.flatMap((row) => [row.member, row.agent]).filter(Boolean))];
          if (keys.length) void profileStore?.ensure?.(keys)?.catch?.(() => {
          });
          setView({ status: "ready", ...result });
        } catch (error) {
          if (live) setView({ status: "error", message: error.message });
        } finally {
          running = false;
          if (queued) {
            queued = false;
            void refresh();
          }
        }
      };
      void refresh();
      try {
        const channel = channelFor(session);
        watch = session.observe?.([{ kinds: [40100], "#h": [channel.id], limit: 1 }]);
        unsubscribe = watch?.subscribe(() => {
          void refresh();
        });
        void watch?.refresh()?.catch?.(() => {
        });
      } catch {
      }
      const unsubscribeChannels = session.channels.subscribe?.(() => {
        void refresh();
      });
      return () => {
        live = false;
        unsubscribeChannels?.();
        unsubscribe?.();
        watch?.dispose();
      };
    }, [session, reload]);
    const load = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setSeed(null);
      try {
        if (file.size > 2e5) throw new Error("库存文件超过大小限制。");
        const next = newPool(JSON.parse(await file.text()));
        setSeed(next);
        const summary = overview(next).counts;
        setAction(`待导入 ${next.accounts.length} 个账号，${summary.available} 个可领，${summary.review} 个待核对。`);
      } catch {
        setAction("无法读取库存文件。请检查 JSON、重复账号和邮箱字段。");
      }
    };
    const commit = async () => {
      if (!seed || pending) return;
      setPending(true);
      try {
        await withCanvas(current, ({ pool, channel }) => {
          if (pool || !isAdmin(channel, session.viewer)) throw new Error("号池已初始化，或当前成员无导入权限。");
          return { next: seed };
        }, { write: true });
        setSeed(null);
        setAction("库存已导入。");
        setReload((n) => n + 1);
      } catch (error) {
        setAction(error.message);
      } finally {
        setPending(false);
      }
    };
    const visibleRows = view.accounts?.filter((row) => filter === "all" || filter === row.state) ?? [];
    return h(
      "section",
      { className: "hf-team-pool", style: { maxWidth: 1020, margin: "0 auto", padding: "clamp(16px, 4vw, 36px)", display: "grid", gap: 20 } },
      h("style", null, BOARD_CSS),
      h(
        "header",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } },
        h("h1", { style: { margin: 0, fontSize: 25 } }, "Higgsfield 号池"),
        h("button", { type: "button", onClick: () => setReload((n) => n + 1) }, "刷新")
      ),
      view.status === "loading" && h("p", { role: "status" }, "正在读取团队号池…"),
      view.status === "error" && h("p", { role: "alert" }, view.message),
      view.status === "ready" && !view.initialized && h(
        "section",
        { className: "ui-card", style: { padding: 16, display: "grid", gap: 12 } },
        h("p", { style: { margin: 0 } }, "号池待导入"),
        view.canImport && h("label", null, "选择库存 JSON ", h("input", { type: "file", accept: ".json,application/json", onChange: load, disabled: pending })),
        seed && h("button", { type: "button", onClick: commit, disabled: pending, style: { justifySelf: "start" } }, pending ? "正在导入…" : "导入到团队号池")
      ),
      action && h("p", { role: "status", style: { margin: 0 } }, action),
      view.initialized && h(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 9 } },
        ...Object.entries(STATES).map(([key, name]) => h(
          "button",
          {
            key,
            type: "button",
            "aria-pressed": filter === key,
            onClick: () => setFilter(filter === key ? "all" : key),
            style: { textAlign: "left", padding: "10px 12px", minHeight: 62 }
          },
          h("span", { style: { display: "block", fontSize: 13 } }, name),
          h("strong", { style: { fontSize: 22, fontVariantNumeric: "tabular-nums" } }, view.counts[key])
        ))
      ),
      view.initialized && h(
        "div",
        { style: { minWidth: 0 } },
        h(
          "table",
          { role: "table", "aria-label": "账号与使用状态" },
          h("thead", null, h("tr", null, ...["账号", "状态", "成员 / Agent", "模版", "更新"].map((name) => h("th", { key: name, scope: "col" }, name)))),
          h(
            "tbody",
            { role: "rowgroup" },
            ...visibleRows.map((row) => h(
              "tr",
              { key: row.account_id, role: "row" },
              h("th", { role: "rowheader", scope: "row" }, row.account_id),
              h(
                "td",
                { role: "cell" },
                h("span", { style: { color: statusColor[row.state], fontWeight: 600 } }, row.status),
                row.note && h("small", { style: { display: "block", marginTop: 4 } }, row.note)
              ),
              h("td", { role: "cell" }, label(profiles, row.member), row.agent && h("small", { style: { display: "block" } }, label(profiles, row.agent))),
              h("td", { role: "cell" }, row.template || "—"),
              h("td", { role: "cell" }, row.updated_at && !Number.isNaN(Date.parse(row.updated_at)) ? stamp.format(new Date(row.updated_at)) : "—")
            )),
            !visibleRows.length && h("tr", null, h("td", { colSpan: 5 }, "没有符合该状态的账号。"))
          )
        )
      )
    );
  }
  function Page() {
    const connection = useSyncExternalStore(ctx.relay.subscribe, ctx.relay.snapshot);
    if (connection.status !== "ready" || connection.cached || !connection.session?.viewer) {
      return h("section", { style: { padding: 24 } }, "请先连接团队所在的 Buzz 社区。");
    }
    return h(Board, { key: `${connection.scope}:${connection.generation}`, connection });
  }
  ctx.pages.register({ id: "main", title: "Higgsfield 号池", primary: true, component: Page });
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
  claim,
  inject,
  newPool,
  overview,
  parseCanvas,
  report
};
