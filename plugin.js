export const inject = [
  "react",
  "pages",
  "browser",
  "relay",
  "conversation",
  "host",
  "agents",
];

// One in-memory owner for the page and the explicitly linked Solo. Website
// cookies and temporary media tickets never cross the agent-tool boundary.
export function createFactoryWorkspace(ctx) {
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
    error: "",
  };
  const listeners = new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const notify of listeners) notify();
  };
  function same(a, b) {
    return (
      a &&
      b &&
      a.session === b.session &&
      a.session?.viewer === b.session?.viewer &&
      a.scope === b.scope &&
      a.generation === b.generation &&
      b.status === "ready" &&
      !b.cached
    );
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
      error: "",
    });
  }
  async function request(path, method = "GET", body) {
    const started = connection,
      version = epoch;
    check(started, version);
    const result = await ctx.host.request({
      url: `${origin}/ins${path}`,
      method,
      timeoutMs: 20000,
      headers: {
        Origin: "tauri://localhost",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
        result.status === 409
          ? "素材已更新，请刷新后核对版本；未自动重试保存。"
          : typeof value?.error === "string"
            ? value.error
            : `工厂请求失败（${result.status}）`,
      );
    return value;
  }
  async function load() {
    const sequence = ++readVersion;
    const data = await request("/api/state");
    if (
      !data ||
      !["cards", "members", "reviews", "comments", "source_images"].every((k) =>
        Array.isArray(data[k]),
      ) ||
      !data.current_member ||
      typeof data.current_member.id !== "string" ||
      !data.cards.every(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          (c.note === undefined || typeof c.note === "string") &&
          typeof c.status === "string" &&
          Number.isSafeInteger(c.version) &&
          c.version >= 0,
      ) ||
      !data.members.every(
        (m) => m && typeof m.id === "string" && typeof m.name === "string",
      ) ||
      !data.reviews.every(
        (r) =>
          r && typeof r.card_id === "string" && typeof r.verdict === "string",
      ) ||
      !data.comments.every(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.card_id === "string" &&
          typeof c.text === "string",
      ) ||
      !data.source_images.every(
        (i) =>
          i &&
          typeof i.card_id === "string" &&
          Number.isFinite(i.position) &&
          typeof i.url === "string",
      )
    )
      throw new Error("素材数据不完整，请核对原服务。");
    if (sequence !== readVersion)
      throw new Error("有更新的读取正在进行，请重试。");
    const selected = data.cards.some((c) => c.id === state.selected)
      ? state.selected
      : "";
    const card = data.cards.find((c) => c.id === selected);
    const proposal =
      state.proposal &&
      card?.id === state.proposal.id &&
      card.version === state.proposal.version
        ? state.proposal
        : null;
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
      (c) => c.id === state.channel && c.id === context.channel,
    );
    if (
      !token ||
      writing ||
      !state.data ||
      agentConnection?.status !== "ready" ||
      agentConnection.cached ||
      agentConnection.scope !== connection.scope ||
      expectedLink !== linkVersion ||
      client.owner !== connection.session.viewer ||
      roster.status !== "ready" ||
      !chat ||
      chat.creator !== client.owner ||
      chat.channelType !== "solo" ||
      chat.private !== true ||
      chat.archived ||
      chat.cached ||
      chat.pending ||
      chat.metadataPending ||
      chat.readOnly ||
      chat.members?.length !== 2 ||
      !chat.members.includes(client.owner) ||
      !chat.members.includes(client.pubkey)
    )
      throw new Error(
        "请在工厂页面关联当前拥有者与本 Agent 的私人 Solo，并选择工厂署名。",
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
      result_revision: card.result_revision,
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
      reset(undefined);
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
      if (
        !["潘涛", "小跑", "良岑", "小卢", "周洋", "mo", "Steven"].includes(name)
      )
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
        if (
          card?.version !== proposal.version ||
          proposal !== state.proposal ||
          card.id !== state.selected
        )
          throw new Error("素材已更新，请重新生成修改建议。");
        publish({ proposal: null });
        await request(`/api/cards/${encodeURIComponent(card.id)}`, "PATCH", {
          version: proposal.version,
          title: proposal.title,
          note: proposal.note,
        });
        // Invalidate suggestions even if the subsequent read fails. Never replay
        // an uncertain write; Retry is a read of the authoritative server state.
        const fresh = await load();
        const observed = fresh.cards.find((c) => c.id === proposal.id);
        if (
          !observed ||
          observed.version <= proposal.version ||
          observed.title !== proposal.title ||
          (observed.note ?? "") !== proposal.note
        )
          throw new Error(
            "服务器回读与建议不一致，请核对当前素材；未重试保存。",
          );
      });
    },
    dismiss() {
      publish({ proposal: null });
    },
    async tool(client, context, args) {
      const version = linkVersion,
        started = connection,
        generation = epoch;
      authorize(client, context, version);
      const data = await load();
      check(started, generation);
      authorize(client, context, version);
      const action = args.action ?? "read";
      const id = args.id || state.selected;
      if (action === "read") {
        const query =
          typeof args.query === "string"
            ? args.query.slice(0, 200).toLowerCase()
            : "";
        const cards = data.cards.filter(
          (c) =>
            (!args.id || c.id === args.id) &&
            (!query ||
              `${c.title} ${c.note ?? ""} ${c.platform ?? ""}`
                .toLowerCase()
                .includes(query)),
        );
        const selected = data.cards.find((c) => c.id === state.selected);
        return JSON.stringify({
          selected: selected ? publicCard(selected) : null,
          total: cards.length,
          cards: cards.slice(0, 60).map(publicCard),
          truncated: cards.length > 60,
        });
      }
      const card = data.cards.find((c) => c.id === id);
      if (!card) throw new Error("素材不存在，请先读取素材 ID。");
      if (action === "focus") {
        select(card.id);
        return JSON.stringify({ focused: publicCard(card) });
      }
      if (
        action !== "propose_edit" ||
        id !== state.selected ||
        args.version !== card.version ||
        typeof args.title !== "string" ||
        !args.title.trim() ||
        args.title.length > 200 ||
        typeof args.note !== "string" ||
        args.note.length > 5000
      )
        throw new Error("请先定位素材，按当前版本提供标题与备注修改建议。");
      publish({
        website: false,
        proposal: {
          id,
          version: card.version,
          title: args.title.trim(),
          note: args.note,
        },
      });
      return JSON.stringify({
        proposed: true,
        saved: false,
        id,
        version: card.version,
        next: "修改建议已显示在素材详情，等待用户点击保存。",
      });
    },
  };
}

export function factorySourceUrl(raw) {
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "local.adflow.invalid" &&
      !url.searchParams.has("opcb_media") &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function factoryMediaUrl(raw) {
  try {
    const url = new URL(raw);
    return url.origin === "https://staging.paolab.cn" &&
      !url.username &&
      !url.password &&
      /^\/ins\/(media|results|images|posters)\/[a-zA-Z0-9._/-]+$/.test(
        url.pathname,
      ) &&
      !url.pathname.includes("..") &&
      url.searchParams.has("opcb_media")
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const row = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    flexWrap: "wrap",
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
  const button = (label, onClick, props = {}) =>
    h("button", { type: "button", onClick, ...props }, label);
  const status = (text, error = false) =>
    h(
      "p",
      {
        role: error ? "alert" : "status",
        className: "text-secondary",
        style: { margin: 0 },
      },
      text,
    );
  const stages = [
    ["inbox", "灵感收集"],
    ["rank", "高赞排行"],
    ["confirm", "素材确认"],
    ["progress", "制作中"],
    ["review", "待审核"],
    ["ready", "待发布"],
    ["downloads", "下载状态"],
    ["discarded", "已收起"],
  ];
  const likes = (data, id) =>
    data.reviews.filter((r) => r.card_id === id && r.verdict === "yes").length;
  const inStage = (data, card, stage) => {
    const s =
      card.status === "approved"
        ? "pending"
        : card.status === "confirmed"
          ? "confirm"
          : card.status;
    if (stage === "inbox")
      return s === "pending" && card.media_status === "ready";
    if (stage === "rank")
      return (
        s === "pending" &&
        card.media_status === "ready" &&
        likes(data, card.id) > 0
      );
    if (stage === "downloads")
      return s === "pending" && card.media_status !== "ready";
    return s === stage;
  };
  const useState = () =>
    React.useSyncExternalStore(
      workspace.subscribe,
      workspace.snapshot,
      workspace.snapshot,
    );
  const run = (action) => {
    void action().catch(() => {});
  };
  function allowed(channel, session, choices) {
    return (
      channel.channelType === "solo" &&
      channel.private === true &&
      channel.creator === session.viewer &&
      !channel.archived &&
      !channel.readOnly &&
      !channel.cached &&
      !channel.pending &&
      !channel.metadataPending &&
      channel.members?.length === 2 &&
      channel.members.includes(session.viewer) &&
      choices.selectable.some(
        (agent) =>
          agent.pubkey !== session.viewer &&
          channel.members.includes(agent.pubkey),
      )
    );
  }

  function Messages({ connection, channel }) {
    const session = connection.session;
    const subscribe = React.useCallback(
      (notify) => session.channels.subscribeWindow(channel.id, notify),
      [session, channel.id],
    );
    const read = React.useCallback(
      () => session.channels.window(channel.id),
      [session, channel.id],
    );
    const window = React.useSyncExternalStore(subscribe, read, read);
    const scroll = React.useRef(null);
    const follow = React.useRef(true);
    React.useEffect(
      () => session.channels.ensure(channel.id),
      [session, channel.id],
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
      children: (interactions) =>
        h(
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
                follow.current =
                  view.scrollHeight - view.scrollTop - view.clientHeight < 80;
              },
            },
            window.hasMore &&
              h(
                "button",
                {
                  type: "button",
                  disabled: window.loadingOlder || window.status !== "ready",
                  onClick: () => {
                    follow.current = false;
                    session.channels.loadOlder(channel.id);
                  },
                },
                window.loadingOlder ? "正在读取…" : "读取更早消息",
              ),
            window.status === "loading" &&
              h("p", { role: "status", style: inset }, "正在读取对话…"),
            window.error &&
              h("p", { role: "alert", style: inset }, window.error),
            window.status === "ready" &&
              !window.rows.length &&
              h("p", { style: inset }, "还没有消息。"),
            window.rows.map((row) =>
              h(ctx.conversation.ui.Message, {
                key: row.id,
                row,
                profile: undefined,
                media: session.media,
                onOpenLink: interactions.onOpenLink,
                day: false,
                retry: session.messages.retry,
              }),
            ),
          ),
          h(ctx.conversation.ui.Composer, {
            session,
            scope: connection.scope,
            channelId: channel.id,
            channelName: channel.name,
            disabled: window.status !== "ready",
          }),
        ),
    });
  }

  function Chat({ connection, compact, showMaterials, visible }) {
    const state = useState();
    const session = connection.session;
    const list = React.useSyncExternalStore(
      session.channels.subscribeList,
      session.channels.list,
      session.channels.list,
    );
    const choices = React.useSyncExternalStore(
      session.agentChoices.subscribe,
      session.agentChoices.snapshot,
      session.agentChoices.snapshot,
    );
    React.useEffect(() => {
      session.channels.ensureList();
      session.agentChoices.ensure(true, true);
    }, [session]);
    const candidates =
      list.status === "ready"
        ? list.channels.filter((c) => allowed(c, session, choices))
        : [];
    const channel = candidates.find((c) => c.id === state.channel);
    React.useEffect(() => {
      if (
        state.channel &&
        list.status === "ready" &&
        !choices.pending &&
        !channel
      )
        workspace.channel("");
    }, [state.channel, list.status, choices.pending, channel]);
    const card = state.data?.cards.find((c) => c.id === state.selected);
    return h(
      "aside",
      {
        "aria-label": "工厂助手",
        style: { ...column, flex: 1, height: "100%" },
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
              onChange: (e) => workspace.channel(e.target.value),
            },
            h("option", { value: "" }, "选择已有的 Solo"),
            ...candidates.map((c) =>
              h("option", { key: c.id, value: c.id }, c.name),
            ),
          ),
        ),
        status(
          card
            ? `当前素材：${card.title} · v${card.version}`
            : "选择素材后，助手可读取并定位它",
        ),
        !channel &&
          status(
            list.status === "loading" || choices.pending
              ? "正在读取私人对话…"
              : "选择本人和一个 Agent 的私人 Solo",
          ),
        compact && card && button("查看当前素材", showMaterials),
      ),
      channel &&
        visible &&
        h(Messages, { key: channel.id, connection, channel }),
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
          margin: "auto",
        },
      },
      h("h2", { style: { margin: 0 } }, "连接内容工厂"),
      h(
        "p",
        { className: "text-secondary", style: { margin: 0 } },
        "沿用原工厂的团队署名，用于记录操作人。署名不验证本人身份，与 Buzz 账号分别管理。",
      ),
      h(
        "form",
        {
          style: { ...column, gap: "var(--space-3)" },
          onSubmit: (e) => {
            e.preventDefault();
            run(() => workspace.login(name));
          },
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
              style: { width: "100%" },
            },
            h("option", { value: "" }, "请选择自己的署名"),
            ...["潘涛", "小跑", "良岑", "小卢", "周洋"].map((n) =>
              h("option", { key: n, value: n }, n),
            ),
          ),
        ),
        h(
          "button",
          { type: "submit", disabled: !name || state.loading },
          state.loading ? "正在连接…" : "进入素材库",
        ),
      ),
      state.error && status(state.error, true),
    );
  }

  function Detail({ card, data }) {
    const state = useState();
    const [result, showResult] = React.useState(false);
    const preview = factoryMediaUrl(
      result ? card.result_media_url : card.media_url,
    );
    const images = data.source_images
      .filter((i) => i.card_id === card.id)
      .sort((a, b) => a.position - b.position);
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
          margin: "0 auto",
        },
      },
      h(
        "div",
        { style: row },
        button("返回素材", () => workspace.select("")),
        h(
          "span",
          { className: "text-secondary" },
          `${card.platform || "素材"} · v${card.version}`,
        ),
        source &&
          h(
            "a",
            { href: source, target: "_blank", rel: "noopener noreferrer" },
            "原始链接",
          ),
      ),
      h("h2", { style: { margin: 0, overflowWrap: "anywhere" } }, card.title),
      card.result_media_url &&
        h(
          "div",
          { role: "group", "aria-label": "预览版本", style: row },
          button("原素材", () => showResult(false), {
            "aria-pressed": !result,
          }),
          button(
            `成片 · 第 ${card.result_revision} 版`,
            () => showResult(true),
            { "aria-pressed": result },
          ),
        ),
      !result && images.length
        ? h(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
                gap: "var(--space-2)",
              },
            },
            images.map((image, index) => {
              const url = factoryMediaUrl(image.url);
              return (
                url &&
                h("img", {
                  key: image.position,
                  src: url,
                  alt: `${card.title} · 图片 ${index + 1}`,
                  loading: "lazy",
                  referrerPolicy: "no-referrer",
                  style: { width: "100%", objectFit: "contain" },
                })
              );
            }),
          )
        : preview && ctx.browser.available
          ? h(
              "div",
              {
                style: {
                  ...column,
                  height: "clamp(16rem, 48vh, 36rem)",
                  minHeight: "16rem",
                  flexShrink: 0,
                },
              },
              h(ctx.browser.View, {
                key: preview,
                url: preview,
                label: "素材视频预览",
              }),
            )
          : status(
              card.media_status === "ready"
                ? preview
                  ? "此设备暂不支持视频预览，可打开原始链接"
                  : "当前素材没有可用的预览地址，请刷新或查看原站"
                : `媒体状态：${card.media_status || "待处理"}`,
            ),
      h(
        "p",
        {
          style: {
            margin: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          },
        },
        card.note || "暂无备注",
      ),
      proposal &&
        h(
          "section",
          {
            className: "ui-card",
            "aria-label": "助手修改建议",
            style: { ...column, ...inset, gap: "var(--space-3)" },
          },
          h("h3", { style: { margin: 0 } }, "助手修改建议"),
          h(
            "p",
            { className: "text-secondary", style: { margin: 0 } },
            `基于素材 v${proposal.version}，保存前请核对`,
          ),
          h("strong", { style: { overflowWrap: "anywhere" } }, proposal.title),
          h(
            "p",
            {
              style: {
                margin: 0,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              },
            },
            proposal.note || "清空备注",
          ),
          h(
            "div",
            { style: row },
            button(
              "保存标题与备注",
              () => run(() => workspace.save(proposal)),
              { disabled: state.loading },
            ),
            button("放弃建议", () => workspace.dismiss(), {
              disabled: state.loading,
            }),
          ),
        ),
      h(
        "section",
        {
          "aria-label": "素材评论",
          style: { ...column, gap: "var(--space-3)" },
        },
        h("h3", { style: { margin: 0 } }, `评论 · ${comments.length}`),
        !comments.length && status("还没有评论"),
        ...comments.map((c) =>
          h(
            "div",
            {
              key: c.id,
              style: {
                borderTop: "1px solid var(--border-standard)",
                paddingTop: "var(--space-3)",
              },
            },
            h(
              "span",
              { className: "text-secondary" },
              data.members.find((m) => m.id === c.member_id)?.name ||
                "团队成员",
            ),
            h(
              "p",
              {
                style: {
                  margin: "var(--space-1) 0 0",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                },
              },
              c.text,
            ),
          ),
        ),
      ),
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
      const observer = new ResizeObserver(([entry]) =>
        setCompact(entry.contentRect.width < 1000),
      );
      if (bodyRef.current) observer.observe(bodyRef.current);
      return () => observer.disconnect();
    }, [Boolean(data)]);
    if (!data) return h(SignIn);
    const selected = data.cards.find((c) => c.id === state.selected);
    const cards = data.cards
      .filter((c) => inStage(data, c, stage))
      .filter((c) =>
        `${c.title} ${c.note || ""} ${c.platform || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      );
    if (stage === "rank")
      cards.sort((a, b) => likes(data, b.id) - likes(data, a.id));
    return h(
      "section",
      {
        "aria-label": "工厂素材",
        style: { ...column, flex: 1, height: "100%" },
      },
      h(
        "div",
        {
          style: {
            ...column,
            ...inset,
            gap: "var(--space-3)",
            borderBottom: "1px solid var(--border-standard)",
          },
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
              style: { width: "100%" },
            }),
          ),
          button(
            state.loading ? "读取中…" : "刷新素材",
            () => run(workspace.refresh),
            { disabled: state.loading },
          ),
          h(
            "span",
            { className: "text-secondary" },
            `署名：${data.current_member.name}`,
          ),
          button("退出署名", () => workspace.logout(), {
            disabled: state.loading,
          }),
        ),
        h(
          "div",
          { role: "group", "aria-label": "制作流程", style: row },
          stages.map(([id, label]) =>
            button(
              `${label} ${data.cards.filter((c) => inStage(data, c, id)).length}`,
              () => {
                setStage(id);
                workspace.select("");
              },
              {
                key: id,
                "aria-pressed": stage === id,
                style:
                  stage === id
                    ? { background: "var(--affordance-subtle-pressed)" }
                    : undefined,
              },
            ),
          ),
        ),
        state.error && status(state.error, true),
      ),
      h(
        "div",
        {
          ref: bodyRef,
          style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 },
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
              ...(compact && selected ? { display: "none" } : {}),
            },
          },
          h(
            React.Fragment,
            null,
            h(
              "p",
              {
                className: "text-secondary",
                style: { margin: "0 0 var(--space-3)" },
              },
              `${stages.find((s) => s[0] === stage)[1]} · ${cards.length} 项`,
            ),
            cards.length
              ? h(
                  "div",
                  {
                    style: {
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(min(100%, 14rem), 1fr))",
                      gap: "var(--space-4)",
                    },
                  },
                  cards.map((card) => {
                    const poster =
                      factoryMediaUrl(card.poster_url) ||
                      factoryMediaUrl(
                        data.source_images.find((i) => i.card_id === card.id)
                          ?.url,
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
                          borderRadius: "var(--radius-container)",
                        },
                      },
                      poster
                        ? h("img", {
                            src: poster,
                            alt: "",
                            loading: "lazy",
                            referrerPolicy: "no-referrer",
                            style: {
                              width: "100%",
                              aspectRatio: "4 / 3",
                              objectFit: "cover",
                            },
                          })
                        : h(
                            "div",
                            {
                              style: {
                                aspectRatio: "4 / 3",
                                display: "grid",
                                placeItems: "center",
                                background: "var(--surface-panel)",
                                color: "var(--text-subtle)",
                              },
                            },
                            card.media_kind === "xhs_images"
                              ? "图文素材"
                              : "视频素材",
                          ),
                      h(
                        "div",
                        {
                          style: {
                            ...inset,
                            ...column,
                            gap: "var(--space-2)",
                          },
                        },
                        h(
                          "span",
                          { style: { overflowWrap: "anywhere" } },
                          card.title,
                        ),
                        h(
                          "span",
                          { className: "text-secondary" },
                          `${card.platform || "素材"} · ${likes(data, card.id)} 人认可 · v${card.version}`,
                        ),
                      ),
                    );
                  }),
                )
              : status(
                  query
                    ? "没有匹配素材，可清空搜索或切换阶段"
                    : "这个阶段暂时没有素材",
                ),
          ),
        ),
        selected &&
          h(
            "aside",
            {
              "aria-label": "当前素材详情",
              style: {
                ...inset,
                width: compact ? "100%" : "min(45%, 36rem)",
                minWidth: 0,
                flexShrink: 0,
                overflow: "auto",
                borderLeft: compact
                  ? undefined
                  : "1px solid var(--border-standard)",
              },
            },
            h(Detail, { key: selected.id, card: selected, data }),
          ),
      ),
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
            borderBottom: "1px solid var(--border-standard)",
          },
        },
        h(
          "h1",
          { className: "text-label", style: { margin: 0, flex: 1 } },
          "内容工厂",
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
              "aria-hidden": true,
            },
            h("path", {
              d: "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12M15 4v16M9 10l2 2l-2 2",
            }),
          ),
          () => showChat(!chat),
          {
            "aria-label": compact
              ? chat
                ? "查看素材"
                : "打开助手"
              : chat
                ? "收起助手"
                : "打开助手",
            title: chat ? "收起助手" : "打开助手",
            "aria-expanded": chat,
            "aria-controls": "opcb-factory-chat",
          },
        ),
      ),
      h(
        "div",
        {
          style: {
            ...row,
            padding: "var(--space-2) var(--space-panel-inset)",
            borderBottom: "1px solid var(--border-standard)",
          },
        },
        button(
          website ? "返回原生素材" : "原站操作",
          () => showWebsite(!website),
          { disabled: !ctx.browser.available },
        ),
        h(
          "span",
          { className: "text-secondary" },
          website
            ? "收集、上传、评审继续沿用原站；署名分别管理"
            : "选择素材，与右侧助手讨论",
        ),
      ),
      h(
        "div",
        { style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 } },
        h(
          "div",
          {
            hidden: compact && chat,
            style: {
              ...(compact && chat ? { display: "none" } : column),
              flex: 1,
              height: "100%",
            },
          },
          website
            ? h(ctx.browser.View, {
                url: "https://staging.paolab.cn/ins/",
                label: "完整工厂 · 原站操作",
              })
            : h(Materials),
        ),
        h(
          "div",
          {
            id: "opcb-factory-chat",
            hidden: !chat,
            style: {
              ...(!chat ? { display: "none" } : column),
              width: compact ? "100%" : `min(45%, ${width}px)`,
              flexShrink: 0,
              borderLeft: compact
                ? undefined
                : "1px solid var(--border-standard)",
              height: "100%",
            },
          },
          !compact &&
            h(
              "label",
              {
                style: {
                  ...row,
                  padding: "var(--space-2) var(--space-panel-inset)",
                  flexShrink: 0,
                },
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
                style: { flex: 1, minWidth: 0 },
              }),
            ),
          h(Chat, {
            connection,
            compact,
            visible: chat,
            showMaterials: () => showChat(false),
          }),
        ),
      ),
    );
  }

  function Factory() {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot,
    );
    return connection.status === "ready" &&
      !connection.cached &&
      connection.session?.viewer &&
      workspace.valid(connection)
      ? h(Workspace, {
          key: `${connection.scope}:${connection.generation}:${connection.session.viewer}`,
          connection,
        })
      : h(
          "p",
          { style: inset, role: "status" },
          "连接当前账号的社区后可打开工厂和对话",
        );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItbW92aWUiCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTQgNmEyIDIgMCAwIDEgMiAtMmgxMmEyIDIgMCAwIDEgMiAydjEyYTIgMiAwIDAgMSAtMiAyaC0xMmEyIDIgMCAwIDEgLTIgLTJsMCAtMTIiIC8+CiAgPHBhdGggZD0iTTggNGwwIDE2IiAvPgogIDxwYXRoIGQ9Ik0xNiA0bDAgMTYiIC8+CiAgPHBhdGggZD0iTTQgOGw0IDAiIC8+CiAgPHBhdGggZD0iTTQgMTZsNCAwIiAvPgogIDxwYXRoIGQ9Ik00IDEybDE2IDAiIC8+CiAgPHBhdGggZD0iTTE2IDhsNCAwIiAvPgogIDxwYXRoIGQ9Ik0xNiAxNmw0IDAiIC8+Cjwvc3ZnPg==",
    id: "factory",
    title: "内容工厂",
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Factory,
  });
  ctx.agents.addTool({
    name: "opcb_factory_materials",
    description:
      "在内容工厂页面明确关联的私人 Solo 中读取/搜索素材、定位素材或提出标题与备注修改建议。素材ID与版本由原工厂拥有。修改建议显示在详情，须用户点击保存；本工具不写业务数据、不返回署名token或媒体票据。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "focus", "propose_edit"] },
        id: { type: "string" },
        query: { type: "string", maxLength: 200 },
        version: { type: "integer", minimum: 0 },
        title: { type: "string", maxLength: 200 },
        note: { type: "string", maxLength: 5000 },
      },
      additionalProperties: false,
    },
    call: (client, context, args) => workspace.tool(client, context, args),
  });
}
