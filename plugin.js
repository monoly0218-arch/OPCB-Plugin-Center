// src/plugin-icons/bases/opcb.content-factory/plugin.js
var inject = [
  "react",
  "pages",
  "browser",
  "relay",
  "conversation",
  "host",
  "agents"
];
function createFactoryWorkspace(ctx) {
  const origin = "https://staging.paolab.cn";
  let connection;
  let token = "";
  let epoch = 0;
  let readVersion = 0;
  let linkVersion = 0;
  let writing = false;
  let disposed = false;
  let state = {
    data: null,
    selected: "",
    channel: "",
    proposal: null,
    website: false,
    loading: false,
    error: ""
  };
  const listeners = /* @__PURE__ */ new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const notify of listeners) notify();
  };
  function same(a, b) {
    return a && b && a.session === b.session && a.session?.viewer === b.session?.viewer && a.scope === b.scope && a.generation === b.generation && b.status === "ready" && !b.cached;
  }
  function check(expected = connection, version = epoch) {
    if (disposed || version !== epoch || !same(expected, ctx.relay.snapshot()))
      throw new Error("账号或社区已变化，请重新连接工厂。");
  }
  function reset(next) {
    epoch++;
    readVersion++;
    linkVersion++;
    token = "";
    writing = false;
    connection = next;
    publish({
      data: null,
      selected: "",
      channel: "",
      proposal: null,
      website: false,
      loading: false,
      error: ""
    });
  }
  async function request(path, method = "GET", body) {
    const started = connection, version = epoch;
    check(started, version);
    const result = await ctx.host.request({
      url: `${origin}/ins${path}`,
      method,
      timeoutMs: 2e4,
      headers: {
        Origin: "tauri://localhost",
        ...token ? { Authorization: `Bearer ${token}` } : {},
        ...body === void 0 ? {} : { "Content-Type": "application/json" }
      },
      ...body === void 0 ? {} : { body: JSON.stringify(body) }
    });
    check(started, version);
    if (result.status === 401) {
      reset(started);
      publish({ error: "工厂署名会话已过期，请重新选择。" });
      throw new Error("工厂署名会话已过期，请重新选择。");
    }
    let value;
    try {
      value = JSON.parse(result.body);
    } catch {
      throw new Error("工厂没有返回有效数据，请重试。");
    }
    if (result.status < 200 || result.status >= 300)
      throw new Error(
        result.status === 409 ? "素材已更新，请刷新后核对版本；未自动重试保存。" : typeof value?.error === "string" ? value.error : `工厂请求失败（${result.status}）`
      );
    return value;
  }
  async function load() {
    const sequence = ++readVersion;
    const data = await request("/api/state");
    if (!data || !["cards", "members", "reviews", "comments", "source_images"].every(
      (k) => Array.isArray(data[k])
    ) || !data.current_member || typeof data.current_member.id !== "string" || !data.cards.every(
      (c) => c && typeof c.id === "string" && typeof c.title === "string" && (c.note === void 0 || typeof c.note === "string") && typeof c.status === "string" && Number.isSafeInteger(c.version) && c.version >= 0
    ) || !data.members.every(
      (m) => m && typeof m.id === "string" && typeof m.name === "string"
    ) || !data.reviews.every(
      (r) => r && typeof r.card_id === "string" && typeof r.verdict === "string"
    ) || !data.comments.every(
      (c) => c && typeof c.id === "string" && typeof c.card_id === "string" && typeof c.text === "string"
    ) || !data.source_images.every(
      (i) => i && typeof i.card_id === "string" && Number.isFinite(i.position) && typeof i.url === "string"
    ))
      throw new Error("素材数据不完整，请核对原服务。");
    if (sequence !== readVersion)
      throw new Error("有更新的读取正在进行，请重试。");
    const selected = data.cards.some((c) => c.id === state.selected) ? state.selected : "";
    const card = data.cards.find((c) => c.id === selected);
    const proposal = state.proposal && card?.id === state.proposal.id && card.version === state.proposal.version ? state.proposal : null;
    publish({ data, selected, proposal, error: "" });
    return data;
  }
  async function busy(action) {
    if (writing) throw new Error("上一项操作还未完成。");
    check();
    const version = epoch;
    writing = true;
    publish({ loading: true, error: "" });
    try {
      return await action();
    } catch (error) {
      if (version === epoch) publish({ error: error.message });
      throw error;
    } finally {
      if (version === epoch) {
        writing = false;
        publish({ loading: false });
      }
    }
  }
  function select(id) {
    check();
    if (id && !state.data?.cards.some((c) => c.id === id))
      throw new Error("素材已不在当前列表。");
    linkVersion++;
    publish({ selected: id, proposal: null, website: false });
  }
  function channel(id) {
    check();
    linkVersion++;
    publish({ channel: id, proposal: null });
  }
  function authorize(client, context, expectedLink) {
    check();
    const agentConnection = ctx.agents.relay(client.key)?.snapshot();
    const roster = connection.session.channels.list();
    const chat = roster.channels.find(
      (c) => c.id === state.channel && c.id === context.channel
    );
    if (!token || writing || !state.data || agentConnection?.status !== "ready" || agentConnection.cached || agentConnection.scope !== connection.scope || expectedLink !== linkVersion || client.owner !== connection.session.viewer || roster.status !== "ready" || !chat || chat.creator !== client.owner || chat.channelType !== "solo" || chat.private !== true || chat.archived || chat.cached || chat.pending || chat.metadataPending || chat.readOnly || chat.members?.length !== 2 || !chat.members.includes(client.owner) || !chat.members.includes(client.pubkey))
      throw new Error(
        "请在工厂页面关联当前拥有者与本 Agent 的私人 Solo，并选择工厂署名。"
      );
  }
  function publicCard(card) {
    return {
      id: card.id,
      title: card.title,
      note: card.note,
      version: card.version,
      status: card.status,
      platform: card.platform,
      source_url: factorySourceUrl(card.source_url),
      media_status: card.media_status,
      has_media: !!card.media_url,
      result_revision: card.result_revision
    };
  }
  return {
    snapshot: () => state,
    subscribe(notify) {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    bind(next) {
      if (!same(connection, next)) reset(next);
    },
    valid(next) {
      return !disposed && same(connection, next);
    },
    dispose() {
      reset(void 0);
      disposed = true;
      listeners.clear();
    },
    logout() {
      reset(connection);
    },
    select,
    channel,
    website(open) {
      check();
      publish({ website: open });
    },
    refresh: () => busy(load),
    login(name) {
      if (!["潘涛", "小跑", "良岑", "小卢", "周洋", "mo", "Steven"].includes(name))
        return Promise.reject(new Error("请选择原工厂的团队署名。"));
      return busy(async () => {
        const value = await request("/api/opcb/login", "POST", { name });
        if (typeof value?.token !== "string" || !value.token)
          throw new Error("服务未提供工厂署名会话。");
        token = value.token;
        await load();
      });
    },
    async save(proposal) {
      if (proposal !== state.proposal || proposal.id !== state.selected)
        throw new Error("修改建议已失效，请重新核对素材。");
      return busy(async () => {
        await load();
        const card = state.data.cards.find((c) => c.id === proposal.id);
        if (card?.version !== proposal.version || proposal !== state.proposal || card.id !== state.selected)
          throw new Error("素材已更新，请重新生成修改建议。");
        publish({ proposal: null });
        await request(`/api/cards/${encodeURIComponent(card.id)}`, "PATCH", {
          version: proposal.version,
          title: proposal.title,
          note: proposal.note
        });
        const fresh = await load();
        const observed = fresh.cards.find((c) => c.id === proposal.id);
        if (!observed || observed.version <= proposal.version || observed.title !== proposal.title || (observed.note ?? "") !== proposal.note)
          throw new Error(
            "服务器回读与建议不一致，请核对当前素材；未重试保存。"
          );
      });
    },
    dismiss() {
      publish({ proposal: null });
    },
    async tool(client, context, args) {
      const version = linkVersion, started = connection, generation = epoch;
      authorize(client, context, version);
      const data = await load();
      check(started, generation);
      authorize(client, context, version);
      const action = args.action ?? "read";
      const id = args.id || state.selected;
      if (action === "read") {
        const query = typeof args.query === "string" ? args.query.slice(0, 200).toLowerCase() : "";
        const cards = data.cards.filter(
          (c) => (!args.id || c.id === args.id) && (!query || `${c.title} ${c.note ?? ""} ${c.platform ?? ""}`.toLowerCase().includes(query))
        );
        const selected = data.cards.find((c) => c.id === state.selected);
        return JSON.stringify({
          selected: selected ? publicCard(selected) : null,
          total: cards.length,
          cards: cards.slice(0, 60).map(publicCard),
          truncated: cards.length > 60
        });
      }
      const card = data.cards.find((c) => c.id === id);
      if (!card) throw new Error("素材不存在，请先读取素材 ID。");
      if (action === "focus") {
        select(card.id);
        return JSON.stringify({ focused: publicCard(card) });
      }
      if (action !== "propose_edit" || id !== state.selected || args.version !== card.version || typeof args.title !== "string" || !args.title.trim() || args.title.length > 200 || typeof args.note !== "string" || args.note.length > 5e3)
        throw new Error("请先定位素材，按当前版本提供标题与备注修改建议。");
      publish({
        website: false,
        proposal: {
          id,
          version: card.version,
          title: args.title.trim(),
          note: args.note
        }
      });
      return JSON.stringify({
        proposed: true,
        saved: false,
        id,
        version: card.version,
        next: "修改建议已显示在素材详情，等待用户点击保存。"
      });
    }
  };
}
function factorySourceUrl(raw) {
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) && url.hostname !== "local.adflow.invalid" && !url.searchParams.has("opcb_media") && !url.username && !url.password ? url.href : void 0;
  } catch {
    return void 0;
  }
}
function factoryMediaUrl(raw) {
  try {
    const url = new URL(raw);
    return url.origin === "https://staging.paolab.cn" && !url.username && !url.password && /^\/ins\/(media|results|images|posters)\/[a-zA-Z0-9._/-]+$/.test(
      url.pathname
    ) && !url.pathname.includes("..") && url.searchParams.has("opcb_media") ? url.href : void 0;
  } catch {
    return void 0;
  }
}
function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const row = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    flexWrap: "wrap"
  };
  const workspace = createFactoryWorkspace(ctx);
  ctx.effect(() => {
    const changed = () => workspace.bind(ctx.relay.snapshot());
    const unsubscribe = ctx.relay.subscribe(changed);
    changed();
    return () => {
      unsubscribe();
      workspace.dispose();
    };
  });
  const button = (label, onClick, props = {}) => h("button", { type: "button", onClick, ...props }, label);
  const status = (text, error = false) => h(
    "p",
    {
      role: error ? "alert" : "status",
      className: "text-secondary",
      style: { margin: 0 }
    },
    text
  );
  const stages = [
    ["inbox", "灵感收集"],
    ["rank", "高赞排行"],
    ["confirm", "素材确认"],
    ["progress", "制作中"],
    ["review", "待审核"],
    ["ready", "待发布"],
    ["downloads", "下载状态"],
    ["discarded", "已收起"]
  ];
  const likes = (data, id) => data.reviews.filter((r) => r.card_id === id && r.verdict === "yes").length;
  const inStage = (data, card, stage) => {
    const s = card.status === "approved" ? "pending" : card.status === "confirmed" ? "confirm" : card.status;
    if (stage === "inbox")
      return s === "pending" && card.media_status === "ready";
    if (stage === "rank")
      return s === "pending" && card.media_status === "ready" && likes(data, card.id) > 0;
    if (stage === "downloads")
      return s === "pending" && card.media_status !== "ready";
    return s === stage;
  };
  const useState = () => React.useSyncExternalStore(
    workspace.subscribe,
    workspace.snapshot,
    workspace.snapshot
  );
  const run = (action) => {
    void action().catch(() => {
    });
  };
  function allowed(channel, session, choices) {
    return channel.channelType === "solo" && channel.private === true && channel.creator === session.viewer && !channel.archived && !channel.readOnly && !channel.cached && !channel.pending && !channel.metadataPending && channel.members?.length === 2 && channel.members.includes(session.viewer) && choices.selectable.some(
      (agent) => agent.pubkey !== session.viewer && channel.members.includes(agent.pubkey)
    );
  }
  function Messages({ connection, channel }) {
    const session = connection.session;
    const subscribe = React.useCallback(
      (notify) => session.channels.subscribeWindow(channel.id, notify),
      [session, channel.id]
    );
    const read = React.useCallback(
      () => session.channels.window(channel.id),
      [session, channel.id]
    );
    const window = React.useSyncExternalStore(subscribe, read, read);
    const scroll = React.useRef(null);
    const follow = React.useRef(true);
    React.useEffect(
      () => session.channels.ensure(channel.id),
      [session, channel.id]
    );
    React.useEffect(() => {
      if (follow.current && scroll.current)
        scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [window.rows]);
    return h(ctx.conversation.ui.Conversation, {
      session,
      scope: connection.scope,
      channelId: channel.id,
      channelName: channel.name,
      children: (interactions) => h(
        React.Fragment,
        null,
        h(
          "div",
          {
            ref: scroll,
            role: "region",
            "aria-label": "工厂助手消息",
            style: { flex: 1, minHeight: 0, overflow: "auto" },
            onScroll: (event) => {
              const view = event.currentTarget;
              follow.current = view.scrollHeight - view.scrollTop - view.clientHeight < 80;
            }
          },
          window.hasMore && h(
            "button",
            {
              type: "button",
              disabled: window.loadingOlder || window.status !== "ready",
              onClick: () => {
                follow.current = false;
                session.channels.loadOlder(channel.id);
              }
            },
            window.loadingOlder ? "正在读取…" : "读取更早消息"
          ),
          window.status === "loading" && h("p", { role: "status", style: inset }, "正在读取对话…"),
          window.error && h("p", { role: "alert", style: inset }, window.error),
          window.status === "ready" && !window.rows.length && h("p", { style: inset }, "还没有消息。"),
          window.rows.map(
            (row2) => h(ctx.conversation.ui.Message, {
              key: row2.id,
              row: row2,
              profile: void 0,
              media: session.media,
              onOpenLink: interactions.onOpenLink,
              day: false,
              retry: session.messages.retry
            })
          )
        ),
        h(ctx.conversation.ui.Composer, {
          session,
          scope: connection.scope,
          channelId: channel.id,
          channelName: channel.name,
          disabled: window.status !== "ready"
        })
      )
    });
  }
  function Chat({ connection, compact, showMaterials, visible }) {
    const state = useState();
    const session = connection.session;
    const list = React.useSyncExternalStore(
      session.channels.subscribeList,
      session.channels.list,
      session.channels.list
    );
    const choices = React.useSyncExternalStore(
      session.agentChoices.subscribe,
      session.agentChoices.snapshot,
      session.agentChoices.snapshot
    );
    React.useEffect(() => {
      session.channels.ensureList();
      session.agentChoices.ensure(true, true);
    }, [session]);
    const candidates = list.status === "ready" ? list.channels.filter((c) => allowed(c, session, choices)) : [];
    const channel = candidates.find((c) => c.id === state.channel);
    React.useEffect(() => {
      if (state.channel && list.status === "ready" && !choices.pending && !channel)
        workspace.channel("");
    }, [state.channel, list.status, choices.pending, channel]);
    const card = state.data?.cards.find((c) => c.id === state.selected);
    return h(
      "aside",
      {
        "aria-label": "工厂助手",
        style: { ...column, flex: 1, height: "100%" }
      },
      h(
        "div",
        { style: { ...inset, ...column, gap: "var(--space-2)" } },
        h(
          "label",
          null,
          "关联私人对话",
          h(
            "select",
            {
              "aria-label": "关联私人对话",
              value: channel?.id ?? "",
              style: { width: "100%" },
              onChange: (e) => workspace.channel(e.target.value)
            },
            h("option", { value: "" }, "选择已有的 Solo"),
            ...candidates.map(
              (c) => h("option", { key: c.id, value: c.id }, c.name)
            )
          )
        ),
        status(
          card ? `当前素材：${card.title} · v${card.version}` : "选择素材后，助手可读取并定位它"
        ),
        !channel && status(
          list.status === "loading" || choices.pending ? "正在读取私人对话…" : "选择本人和一个 Agent 的私人 Solo"
        ),
        compact && card && button("查看当前素材", showMaterials)
      ),
      channel && visible && h(Messages, { key: channel.id, connection, channel })
    );
  }
  function SignIn() {
    const state = useState();
    const [name, setName] = React.useState("");
    return h(
      "section",
      {
        "aria-label": "连接工厂署名",
        style: {
          ...column,
          ...inset,
          gap: "var(--space-4)",
          maxWidth: "32rem",
          margin: "auto"
        }
      },
      h("h2", { style: { margin: 0 } }, "连接内容工厂"),
      h(
        "p",
        { className: "text-secondary", style: { margin: 0 } },
        "沿用原工厂的团队署名，用于记录操作人。署名不验证本人身份，与 Buzz 账号分别管理。"
      ),
      h(
        "form",
        {
          style: { ...column, gap: "var(--space-3)" },
          onSubmit: (e) => {
            e.preventDefault();
            run(() => workspace.login(name));
          }
        },
        h(
          "label",
          null,
          "团队署名",
          h(
            "select",
            {
              value: name,
              disabled: state.loading,
              required: true,
              onChange: (e) => setName(e.target.value),
              style: { width: "100%" }
            },
            h("option", { value: "" }, "请选择自己的署名"),
            ...["潘涛", "小跑", "良岑", "小卢", "周洋"].map(
              (n) => h("option", { key: n, value: n }, n)
            )
          )
        ),
        h(
          "button",
          { type: "submit", disabled: !name || state.loading },
          state.loading ? "正在连接…" : "进入素材库"
        )
      ),
      state.error && status(state.error, true)
    );
  }
  function Detail({ card, data }) {
    const state = useState();
    const [result, showResult] = React.useState(false);
    const preview = factoryMediaUrl(
      result ? card.result_media_url : card.media_url
    );
    const images = data.source_images.filter((i) => i.card_id === card.id).sort((a, b) => a.position - b.position);
    const proposal = state.proposal;
    const comments = data.comments.filter((c) => c.card_id === card.id);
    const source = factorySourceUrl(card.source_url);
    return h(
      "article",
      {
        "aria-label": "素材详情",
        style: {
          display: "grid",
          gridAutoRows: "max-content",
          alignContent: "start",
          gap: "var(--space-4)",
          minWidth: 0,
          width: "100%",
          margin: "0 auto"
        }
      },
      h(
        "div",
        { style: row },
        button("返回素材", () => workspace.select("")),
        h(
          "span",
          { className: "text-secondary" },
          `${card.platform || "素材"} · v${card.version}`
        ),
        source && h(
          "a",
          { href: source, target: "_blank", rel: "noopener noreferrer" },
          "原始链接"
        )
      ),
      h("h2", { style: { margin: 0, overflowWrap: "anywhere" } }, card.title),
      card.result_media_url && h(
        "div",
        { role: "group", "aria-label": "预览版本", style: row },
        button("原素材", () => showResult(false), {
          "aria-pressed": !result
        }),
        button(
          `成片 · 第 ${card.result_revision} 版`,
          () => showResult(true),
          { "aria-pressed": result }
        )
      ),
      !result && images.length ? h(
        "div",
        {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
            gap: "var(--space-2)"
          }
        },
        images.map((image, index) => {
          const url = factoryMediaUrl(image.url);
          return url && h("img", {
            key: image.position,
            src: url,
            alt: `${card.title} · 图片 ${index + 1}`,
            loading: "lazy",
            referrerPolicy: "no-referrer",
            style: { width: "100%", objectFit: "contain" }
          });
        })
      ) : preview && ctx.browser.available ? h(
        "div",
        {
          style: {
            ...column,
            height: "clamp(16rem, 48vh, 36rem)",
            minHeight: "16rem",
            flexShrink: 0
          }
        },
        h(ctx.browser.View, {
          key: preview,
          url: preview,
          label: "素材视频预览"
        })
      ) : status(
        card.media_status === "ready" ? preview ? "此设备暂不支持视频预览，可打开原始链接" : "当前素材没有可用的预览地址，请刷新或查看原站" : `媒体状态：${card.media_status || "待处理"}`
      ),
      h(
        "p",
        {
          style: {
            margin: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere"
          }
        },
        card.note || "暂无备注"
      ),
      proposal && h(
        "section",
        {
          className: "ui-card",
          "aria-label": "助手修改建议",
          style: { ...column, ...inset, gap: "var(--space-3)" }
        },
        h("h3", { style: { margin: 0 } }, "助手修改建议"),
        h(
          "p",
          { className: "text-secondary", style: { margin: 0 } },
          `基于素材 v${proposal.version}，保存前请核对`
        ),
        h("strong", { style: { overflowWrap: "anywhere" } }, proposal.title),
        h(
          "p",
          {
            style: {
              margin: 0,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere"
            }
          },
          proposal.note || "清空备注"
        ),
        h(
          "div",
          { style: row },
          button(
            "保存标题与备注",
            () => run(() => workspace.save(proposal)),
            { disabled: state.loading }
          ),
          button("放弃建议", () => workspace.dismiss(), {
            disabled: state.loading
          })
        )
      ),
      h(
        "section",
        {
          "aria-label": "素材评论",
          style: { ...column, gap: "var(--space-3)" }
        },
        h("h3", { style: { margin: 0 } }, `评论 · ${comments.length}`),
        !comments.length && status("还没有评论"),
        ...comments.map(
          (c) => h(
            "div",
            {
              key: c.id,
              style: {
                borderTop: "1px solid var(--border-standard)",
                paddingTop: "var(--space-3)"
              }
            },
            h(
              "span",
              { className: "text-secondary" },
              data.members.find((m) => m.id === c.member_id)?.name || "团队成员"
            ),
            h(
              "p",
              {
                style: {
                  margin: "var(--space-1) 0 0",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere"
                }
              },
              c.text
            )
          )
        )
      )
    );
  }
  function Materials() {
    const state = useState();
    const [stage, setStage] = React.useState("inbox");
    const [query, search] = React.useState("");
    const data = state.data;
    const [compact, setCompact] = React.useState(false);
    const bodyRef = React.useRef(null);
    React.useEffect(() => {
      const observer = new ResizeObserver(
        ([entry]) => setCompact(entry.contentRect.width < 1e3)
      );
      if (bodyRef.current) observer.observe(bodyRef.current);
      return () => observer.disconnect();
    }, [Boolean(data)]);
    if (!data) return h(SignIn);
    const selected = data.cards.find((c) => c.id === state.selected);
    const cards = data.cards.filter((c) => inStage(data, c, stage)).filter(
      (c) => `${c.title} ${c.note || ""} ${c.platform || ""}`.toLowerCase().includes(query.toLowerCase())
    );
    if (stage === "rank")
      cards.sort((a, b) => likes(data, b.id) - likes(data, a.id));
    return h(
      "section",
      {
        "aria-label": "工厂素材",
        style: { ...column, flex: 1, height: "100%" }
      },
      h(
        "div",
        {
          style: {
            ...column,
            ...inset,
            gap: "var(--space-3)",
            borderBottom: "1px solid var(--border-standard)"
          }
        },
        h(
          "div",
          { style: row },
          h(
            "label",
            { style: { flex: "1 1 14rem" } },
            h("input", {
              type: "search",
              value: query,
              "aria-label": "搜索素材",
              placeholder: "搜索素材、备注或平台",
              onChange: (e) => {
                search(e.target.value);
                if (state.selected) workspace.select("");
              },
              style: { width: "100%" }
            })
          ),
          button(
            state.loading ? "读取中…" : "刷新素材",
            () => run(workspace.refresh),
            { disabled: state.loading }
          ),
          h(
            "span",
            { className: "text-secondary" },
            `署名：${data.current_member.name}`
          ),
          button("退出署名", () => workspace.logout(), {
            disabled: state.loading
          })
        ),
        h(
          "div",
          { role: "group", "aria-label": "制作流程", style: row },
          stages.map(
            ([id, label]) => button(
              `${label} ${data.cards.filter((c) => inStage(data, c, id)).length}`,
              () => {
                setStage(id);
                workspace.select("");
              },
              {
                key: id,
                "aria-pressed": stage === id,
                style: stage === id ? { background: "var(--affordance-subtle-pressed)" } : void 0
              }
            )
          )
        ),
        state.error && status(state.error, true)
      ),
      h(
        "div",
        {
          ref: bodyRef,
          style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 }
        },
        h(
          "div",
          {
            "aria-label": "素材列表",
            hidden: compact && Boolean(selected),
            style: {
              ...inset,
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              overflow: "auto",
              ...compact && selected ? { display: "none" } : {}
            }
          },
          h(
            React.Fragment,
            null,
            h(
              "p",
              {
                className: "text-secondary",
                style: { margin: "0 0 var(--space-3)" }
              },
              `${stages.find((s) => s[0] === stage)[1]} · ${cards.length} 项`
            ),
            cards.length ? h(
              "div",
              {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 14rem), 1fr))",
                  gap: "var(--space-4)"
                }
              },
              cards.map((card) => {
                const poster = factoryMediaUrl(card.poster_url) || factoryMediaUrl(
                  data.source_images.find((i) => i.card_id === card.id)?.url
                );
                return h(
                  "button",
                  {
                    key: card.id,
                    type: "button",
                    className: "ui-card",
                    onClick: () => workspace.select(card.id),
                    "aria-label": `查看素材：${card.title}`,
                    style: {
                      ...column,
                      padding: 0,
                      overflow: "hidden",
                      textAlign: "start",
                      alignItems: "stretch",
                      height: "auto",
                      borderRadius: "var(--radius-container)"
                    }
                  },
                  poster ? h("img", {
                    src: poster,
                    alt: "",
                    loading: "lazy",
                    referrerPolicy: "no-referrer",
                    style: {
                      width: "100%",
                      aspectRatio: "4 / 3",
                      objectFit: "cover"
                    }
                  }) : h(
                    "div",
                    {
                      style: {
                        aspectRatio: "4 / 3",
                        display: "grid",
                        placeItems: "center",
                        background: "var(--surface-panel)",
                        color: "var(--text-subtle)"
                      }
                    },
                    card.media_kind === "xhs_images" ? "图文素材" : "视频素材"
                  ),
                  h(
                    "div",
                    {
                      style: {
                        ...inset,
                        ...column,
                        gap: "var(--space-2)"
                      }
                    },
                    h(
                      "span",
                      { style: { overflowWrap: "anywhere" } },
                      card.title
                    ),
                    h(
                      "span",
                      { className: "text-secondary" },
                      `${card.platform || "素材"} · ${likes(data, card.id)} 人认可 · v${card.version}`
                    )
                  )
                );
              })
            ) : status(
              query ? "没有匹配素材，可清空搜索或切换阶段" : "这个阶段暂时没有素材"
            )
          )
        ),
        selected && h(
          "aside",
          {
            "aria-label": "当前素材详情",
            style: {
              ...inset,
              width: compact ? "100%" : "min(45%, 36rem)",
              minWidth: 0,
              flexShrink: 0,
              overflow: "auto",
              borderLeft: compact ? void 0 : "1px solid var(--border-standard)"
            }
          },
          h(Detail, { key: selected.id, card: selected, data })
        )
      )
    );
  }
  function Workspace({ connection }) {
    const [chat, showChat] = React.useState(true);
    const [width, setWidth] = React.useState(360);
    const [compact, setCompact] = React.useState(false);
    const { website } = useState();
    const showWebsite = workspace.website;
    const root = React.useRef(null);
    React.useEffect(() => {
      const observer = new ResizeObserver(([entry]) => {
        const narrow = entry.contentRect.width < 820;
        setCompact(narrow);
        if (narrow) showChat(false);
      });
      if (root.current) observer.observe(root.current);
      return () => observer.disconnect();
    }, []);
    React.useEffect(() => () => workspace.logout(), []);
    return h(
      "div",
      { ref: root, style: { ...column, height: "100%", overflow: "hidden" } },
      h(
        "div",
        {
          style: {
            ...row,
            minHeight: "var(--size-panel-header)",
            padding: "0 var(--space-panel-inset)",
            flexShrink: 0,
            borderBottom: "1px solid var(--border-standard)"
          }
        },
        h(
          "h1",
          { className: "text-label", style: { margin: 0, flex: 1 } },
          "内容工厂"
        ),
        button(
          h(
            "svg",
            {
              viewBox: "0 0 24 24",
              width: "1rem",
              height: "1rem",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              "aria-hidden": true
            },
            h("path", {
              d: "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12M15 4v16M9 10l2 2l-2 2"
            })
          ),
          () => showChat(!chat),
          {
            "aria-label": compact ? chat ? "查看素材" : "打开助手" : chat ? "收起助手" : "打开助手",
            title: chat ? "收起助手" : "打开助手",
            "aria-expanded": chat,
            "aria-controls": "opcb-factory-chat"
          }
        )
      ),
      h(
        "div",
        {
          style: {
            ...row,
            padding: "var(--space-2) var(--space-panel-inset)",
            borderBottom: "1px solid var(--border-standard)"
          }
        },
        button(
          website ? "返回原生素材" : "原站操作",
          () => showWebsite(!website),
          { disabled: !ctx.browser.available }
        ),
        h(
          "span",
          { className: "text-secondary" },
          website ? "收集、上传、评审继续沿用原站；署名分别管理" : "选择素材，与右侧助手讨论"
        )
      ),
      h(
        "div",
        { style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 } },
        h(
          "div",
          {
            hidden: compact && chat,
            style: {
              ...compact && chat ? { display: "none" } : column,
              flex: 1,
              height: "100%"
            }
          },
          website ? h(ctx.browser.View, {
            url: "https://staging.paolab.cn/ins/",
            label: "完整工厂 · 原站操作"
          }) : h(Materials)
        ),
        h(
          "div",
          {
            id: "opcb-factory-chat",
            hidden: !chat,
            style: {
              ...!chat ? { display: "none" } : column,
              width: compact ? "100%" : `min(45%, ${width}px)`,
              flexShrink: 0,
              borderLeft: compact ? void 0 : "1px solid var(--border-standard)",
              height: "100%"
            }
          },
          !compact && h(
            "label",
            {
              style: {
                ...row,
                padding: "var(--space-2) var(--space-panel-inset)",
                flexShrink: 0
              }
            },
            h("span", { className: "text-secondary" }, "助手宽度"),
            h("input", {
              type: "range",
              min: 280,
              max: 520,
              step: 20,
              value: width,
              "aria-label": "助手宽度",
              onChange: (e) => setWidth(Number(e.target.value)),
              style: { flex: 1, minWidth: 0 }
            })
          ),
          h(Chat, {
            connection,
            compact,
            visible: chat,
            showMaterials: () => showChat(false)
          })
        )
      )
    );
  }
  function Factory() {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot
    );
    return connection.status === "ready" && !connection.cached && connection.session?.viewer && workspace.valid(connection) ? h(Workspace, {
      key: `${connection.scope}:${connection.generation}:${connection.session.viewer}`,
      connection
    }) : h(
      "p",
      { style: inset, role: "status" },
      "连接当前账号的社区后可打开工厂和对话"
    );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItbW92aWUiCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTQgNmEyIDIgMCAwIDEgMiAtMmgxMmEyIDIgMCAwIDEgMiAydjEyYTIgMiAwIDAgMSAtMiAyaC0xMmEyIDIgMCAwIDEgLTIgLTJsMCAtMTIiIC8+CiAgPHBhdGggZD0iTTggNGwwIDE2IiAvPgogIDxwYXRoIGQ9Ik0xNiA0bDAgMTYiIC8+CiAgPHBhdGggZD0iTTQgOGw0IDAiIC8+CiAgPHBhdGggZD0iTTQgMTZsNCAwIiAvPgogIDxwYXRoIGQ9Ik00IDEybDE2IDAiIC8+CiAgPHBhdGggZD0iTTE2IDhsNCAwIiAvPgogIDxwYXRoIGQ9Ik0xNiAxNmw0IDAiIC8+Cjwvc3ZnPg==",
    id: "factory",
    title: "内容工厂",
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Factory
  });
  ctx.agents.addTool({
    name: "opcb_factory_materials",
    description: "在内容工厂页面明确关联的私人 Solo 中读取/搜索素材、定位素材或提出标题与备注修改建议。素材ID与版本由原工厂拥有。修改建议显示在详情，须用户点击保存；本工具不写业务数据、不返回署名token或媒体票据。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "focus", "propose_edit"] },
        id: { type: "string" },
        query: { type: "string", maxLength: 200 },
        version: { type: "integer", minimum: 0 },
        title: { type: "string", maxLength: 200 },
        note: { type: "string", maxLength: 5e3 }
      },
      additionalProperties: false
    },
    call: (client, context, args) => workspace.tool(client, context, args)
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
  createFactoryWorkspace,
  factoryMediaUrl,
  factorySourceUrl,
  inject
};
