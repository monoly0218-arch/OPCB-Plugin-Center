export const inject = ["react", "pages", "browser", "relay", "conversation"];
// The local preview packager supplies an owner-specific, read-only snapshot.
// Repository source never contains the owner's assets or thumbnails.
export function apply(ctx, preview = {"count": 0, "items": [], "owner": "", "capturedAt": "未载入素材快照"}) {
  const React = ctx.react;
  const h = React.createElement;
  const title = "上粮山资产库";

  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  };
  const row = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    minWidth: 0,
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const button = (label, onClick, props = {}) =>
    h("button", { type: "button", onClick, ...props }, label);
  function eligible(c, session, choices) {
    return (
      c.channelType === "solo" &&
      c.private === true &&
      c.creator === session.viewer &&
      !c.archived &&
      !c.readOnly &&
      !c.cached &&
      !c.pending &&
      !c.metadataPending &&
      c.members?.length === 2 &&
      c.members.includes(session.viewer) &&
      choices.selectable.some(
        (a) => a.pubkey !== session.viewer && c.members.includes(a.pubkey),
      )
    );
  }
  function Messages({ connection, channel }) {
    const session = connection.session;
    const subscribe = React.useCallback(
      (n) => session.channels.subscribeWindow(channel.id, n),
      [session, channel.id],
    );
    const snapshot = React.useCallback(
      () => session.channels.window(channel.id),
      [session, channel.id],
    );
    const messages = React.useSyncExternalStore(subscribe, snapshot, snapshot);
    const scroll = React.useRef(null),
      follow = React.useRef(true);
    React.useEffect(
      () => session.channels.ensure(channel.id),
      [session, channel.id],
    );
    React.useEffect(() => {
      if (follow.current && scroll.current)
        scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [messages.rows]);
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
              "aria-label": "助手消息",
              style: { flex: 1, minHeight: 0, overflow: "auto" },
              onScroll: (e) => {
                const v = e.currentTarget;
                follow.current =
                  v.scrollHeight - v.scrollTop - v.clientHeight < 80;
              },
            },
            messages.hasMore &&
              button(
                messages.loadingOlder ? "正在读取…" : "读取更早消息",
                () => {
                  follow.current = false;
                  session.channels.loadOlder(channel.id);
                },
                {
                  disabled:
                    messages.loadingOlder || messages.status !== "ready",
                },
              ),
            messages.error &&
              h("p", { role: "alert", style: inset }, messages.error),
            messages.status === "loading" &&
              h("p", { role: "status", style: inset }, "正在读取对话…"),
            messages.status === "ready" &&
              !messages.rows.length &&
              h("p", { style: inset }, "在此讨论当前工作"),
            messages.rows.map((m) =>
              h(ctx.conversation.ui.Message, {
                key: m.id,
                row: m,
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
            disabled: messages.status !== "ready",
          }),
        ),
    });
  }
  function Assistant({ connection, context, visible, onChannel }) {
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
    const [selected, select] = React.useState("");
    React.useEffect(() => {
      session.channels.ensureList();
      session.agentChoices.ensure(true, true);
    }, [session]);
    const candidates =
      list.status === "ready"
        ? list.channels.filter((c) => eligible(c, session, choices))
        : [];
    const channel = candidates.find((c) => c.id === selected);
    React.useEffect(() => {
      if (selected && list.status === "ready" && !choices.pending && !channel)
        select("");
      onChannel?.(channel?.id || "");
      return () => onChannel?.("");
    }, [selected, list.status, choices.pending, channel, onChannel]);
    return h(
      "aside",
      {
        "aria-label": "工作助手",
        style: { ...column, flex: 1, height: "100%" },
      },
      h(
        "div",
        { style: { ...column, ...inset, gap: "var(--space-2)" } },
        h(
          "label",
          null,
          "关联私人对话",
          h(
            "select",
            {
              value: channel?.id || "",
              "aria-label": "关联私人对话",
              style: { width: "100%" },
              onChange: (e) => select(e.target.value),
            },
            h("option", { value: "" }, "选择已有的 Solo"),
            candidates.map((c) =>
              h("option", { key: c.id, value: c.id }, c.name),
            ),
          ),
        ),
        h(
          "p",
          {
            className: "text-secondary",
            style: { margin: 0, overflowWrap: "anywhere" },
          },
          context,
        ),
        !channel &&
          h(
            "p",
            {
              role: "status",
              className: "text-secondary",
              style: { margin: 0 },
            },
            list.status === "loading" || choices.pending
              ? "正在读取私人对话…"
              : "选择本人和一个 Agent 的私人 Solo",
          ),
      ),
      visible &&
        channel &&
        h(Messages, { key: channel.id, connection, channel }),
    );
  }
  function Layout({ connection, children, context, onChannel, actions }) {
    const [chat, showChat] = React.useState(false),
      [compact, setCompact] = React.useState(false);
    const [width, setWidth] = React.useState(360),
      root = React.useRef(null);
    React.useEffect(() => {
      const observer = new ResizeObserver(([entry]) =>
        setCompact(entry.contentRect.width < 820),
      );
      if (root.current) observer.observe(root.current);
      return () => observer.disconnect();
    }, []);
    return h(
      "div",
      { ref: root, style: { ...column, height: "100%", overflow: "hidden" } },
      h(
        "header",
        {
          style: {
            ...row,
            flexShrink: 0,
            minHeight: "var(--size-panel-header)",
            padding: "0 var(--space-panel-inset)",
            borderBottom: "1px solid var(--border-standard)",
          },
        },
        h(
          "h1",
          { className: "text-label", style: { margin: 0, flex: 1 } },
          title,
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
              "aria-hidden": true,
            },
            h("path", { d: "M4 4h16v16H4zM15 4v16M8 10l2 2-2 2" }),
          ),
          () => showChat(!chat),
          {
            "aria-label": chat
              ? compact
                ? "查看工作区"
                : "收起助手"
              : "打开助手",
            title: chat ? "收起助手" : "打开助手",
            "aria-expanded": chat,
          },
        ),
      ),
      actions,
      h(
        "div",
        { style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 } },
        h(
          "div",
          {
            hidden: compact && chat,
            style: {
              ...column,
              ...(compact && chat ? { display: "none" } : {}),
              flex: 1,
            },
          },
          children,
        ),
        h(
          "div",
          {
            hidden: !chat,
            style: {
              ...column,
              ...(!chat ? { display: "none" } : {}),
              width: compact ? "100%" : `min(45%, ${width}px)`,
              flexShrink: 0,
              borderLeft: compact
                ? undefined
                : "1px solid var(--border-standard)",
            },
          },
          !compact &&
            h(
              "label",
              {
                style: {
                  ...row,
                  padding: "var(--space-2) var(--space-panel-inset)",
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
                style: { flex: 1, minWidth: 0 },
                onChange: (e) => setWidth(Number(e.target.value)),
              }),
            ),
          h(Assistant, { connection, context, visible: chat, onChannel }),
        ),
      ),
    );
  }

  function Workspace({ connection }) {
    const [opened, open] = React.useState(false),
      [visit, restart] = React.useState(0);
    return h(
      Layout,
      {
        connection,
        context:
          "上传、下载、版本与发布记录沿用原资产库；网站署名独立管理。助手不能读取网页中选中的资产。",
      },
      opened && ctx.browser.available
        ? h(
            React.Fragment,
            null,
            h(
              "div",
              {
                style: {
                  ...row,
                  padding: "var(--space-2) var(--space-panel-inset)",
                  flexShrink: 0,
                  borderBottom: "1px solid var(--border-standard)",
                },
              },
              button("重新打开原站", () => restart((v) => v + 1)),
              button("退出工作区", () => open(false)),
              h(
                "span",
                {
                  className: "text-secondary",
                  style: { flex: "1 1 200px", overflowWrap: "anywhere" },
                },
                "上传、下载、版本与发布记录沿用原资产库；网站署名独立管理。助手不能读取网页中选中的资产。",
              ),
            ),
            h(ctx.browser.View, {
              key: visit,
              url: "https://staging.paolab.cn/assets/",
              label: title,
            }),
          )
        : h(
            "section",
            {
              style: {
                ...column,
                ...inset,
                maxWidth: "48rem",
                gap: "var(--space-4)",
                overflow: "auto",
              },
              "aria-label": "打开工作区",
            },
            h(
              "h2",
              { className: "text-heading-sm", style: { margin: 0 } },
              "浏览素材，保留完整资产操作",
            ),
            h(
              "p",
              { className: "text-secondary", style: { margin: 0 } },
              "上传、下载、版本与发布记录沿用原资产库；网站署名独立管理。助手不能读取网页中选中的资产。",
            ),
            h(
              "p",
              {
                className: "text-secondary",
                style: { margin: 0, overflowWrap: "anywhere" },
              },
              "https://staging.paolab.cn/assets/",
            ),
            ctx.browser.available
              ? button("进入工作区", () => open(true), {
                  style: { alignSelf: "start" },
                })
              : h(
                  "p",
                  { role: "status" },
                  "当前设备不支持内嵌网站，请在 macOS 桌面版打开",
                ),
          ),
    );
  }
  function PreviewWorkspace({ connection }) {
    const [website, showWebsite] = React.useState(false);
    const [query, search] = React.useState("");
    const [category, chooseCategory] = React.useState("");
    const [kind, chooseKind] = React.useState("");
    const [selected, select] = React.useState("");
    const [compact, setCompact] = React.useState(false);
    const root = React.useRef(null);
    React.useEffect(() => {
      const observer = new ResizeObserver(([entry]) =>
        setCompact(entry.contentRect.width < 760),
      );
      if (root.current) observer.observe(root.current);
      return () => observer.disconnect();
    }, [website]);
    const item = preview.items.find((a) => a.id === selected);
    const categories = [
      ["", "全部"],
      ["brand", "品牌资料"],
      ["product-knowledge", "产品知识"],
      ["product", "产品素材"],
      ["store", "门店素材"],
      ["brand-content", "品牌内容"],
      ["activities", "活动与合作"],
    ];
    const items = preview.items.filter(
      (a) =>
        (!category || a.category === category) &&
        (!kind || a.kind === kind) &&
        (!query.trim() ||
          [a.title, a.caption, ...a.tags]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase())),
    );
    const reset = () => {
      search("");
      chooseCategory("");
      chooseKind("");
    };
    const date = (value) => new Date(value).toLocaleDateString("zh-CN");
    const text = (value, props = {}) =>
      h(
        "p",
        { className: "text-secondary", style: { margin: 0 }, ...props },
        value,
      );
    const section = (label, content) =>
      h(
        "section",
        { style: { display: "block" } },
        h("h3", { className: "text-label", style: { margin: 0 } }, label),
        content,
      );
    return h(
      Layout,
      {
        connection,
        context: item
          ? `只读快照：${item.title} · V${item.version}。此版没有素材工具，选择不会自动发送给助手。`
          : "此版展示只读素材快照；聊天不会自动获得选中素材，也不能更新素材。",
        actions: h(
          "div",
          {
            style: {
              ...row,
              ...inset,
              flexShrink: 0,
              borderBottom: "1px solid var(--border-standard)",
            },
          },
          text(
            `只读预览 · ${preview.capturedAt} · ${preview.items.length} 组样本 / 源库 ${preview.count} 组`,
            { style: { margin: 0, flex: "1 1 240px" } },
          ),
          button(
            website ? "返回素材预览" : "原站操作",
            () => showWebsite(!website),
            {
              disabled: !website && !ctx.browser.available,
            },
          ),
        ),
      },
      website
        ? h(ctx.browser.View, {
            url: "https://staging.paolab.cn/assets/",
            label: title,
          })
        : h(
            "div",
            {
              ref: root,
              style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 },
            },
            (!compact || !item) &&
              h(
                "section",
                { "aria-label": "素材预览", style: { ...column, flex: 1 } },
                h(
                  "div",
                  {
                    style: {
                      ...column,
                      ...inset,
                      gap: "var(--space-3)",
                      flexShrink: 0,
                    },
                  },
                  h(
                    "div",
                    { style: row },
                    h("input", {
                      type: "search",
                      value: query,
                      "aria-label": "搜索素材",
                      placeholder: "搜索素材、文案或标签",
                      style: {
                        flex: "1 1 180px",
                        width: 0,
                        minWidth: "min(180px, 100%)",
                      },
                      onChange: (e) => search(e.target.value),
                    }),
                    h(
                      "select",
                      {
                        value: kind,
                        "aria-label": "素材类型",
                        onChange: (e) => chooseKind(e.target.value),
                      },
                      h("option", { value: "" }, "全部类型"),
                      h("option", { value: "image" }, "图片"),
                      h("option", { value: "video" }, "视频"),
                    ),
                    button("清空筛选", reset),
                  ),
                  h(
                    "nav",
                    { "aria-label": "素材分类", style: row },
                    categories.map(([id, label]) =>
                      button(label, () => chooseCategory(id), {
                        key: id,
                        "aria-pressed": category === id,
                      }),
                    ),
                  ),
                  text(`${items.length} 组匹配样本；搜索仅限这份快照`),
                ),
                h(
                  "div",
                  {
                    style: {
                      ...inset,
                      paddingTop: 0,
                      overflow: "auto",
                      flex: 1,
                      minHeight: 0,
                    },
                  },
                  items.length
                    ? h(
                        "div",
                        {
                          style: {
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fill, minmax(min(200px, 100%), 1fr))",
                            gap: "var(--space-4)",
                          },
                        },
                        items.map((a) =>
                          button(
                            h(
                              React.Fragment,
                              null,
                              h("img", {
                                src: a.image,
                                alt: "",
                                loading: "lazy",
                                style: {
                                  width: "100%",
                                  aspectRatio: "4/3",
                                  objectFit: "cover",
                                  display: "block",
                                },
                              }),
                              h(
                                "span",
                                {
                                  style: {
                                    ...column,
                                    padding: "var(--space-3)",
                                    gap: "var(--space-2)",
                                  },
                                },
                                h(
                                  "span",
                                  {
                                    className: "text-label",
                                    style: { overflowWrap: "anywhere" },
                                  },
                                  a.title,
                                ),
                                h(
                                  "span",
                                  { className: "text-secondary" },
                                  `${a.kind === "video" ? "视频" : "图片"} · V${a.version} · ${a.publications.length ? "有发布记录" : "暂无发布记录"}`,
                                ),
                                h(
                                  "span",
                                  { className: "text-secondary" },
                                  `${a.actor} · ${date(a.date)}`,
                                ),
                              ),
                            ),
                            () => select(a.id),
                            {
                              key: a.id,
                              className: "ui-card",
                              "aria-label": `查看素材 ${a.title}`,
                              "aria-pressed": a.id === selected,
                              style: {
                                ...column,
                                alignItems: "stretch",
                                textAlign: "left",
                                padding: 0,
                                height: "auto",
                                overflow: "hidden",
                                flexShrink: 0,
                                borderRadius: "var(--radius-container)",
                              },
                            },
                          ),
                        ),
                      )
                    : h(
                        "div",
                        { style: { ...column, gap: "var(--space-3)" } },
                        text("没有符合条件的样本"),
                        button("重置筛选", reset),
                      ),
                ),
              ),
            item &&
              h(
                "aside",
                {
                  "aria-label": "素材详情",
                  style: {
                    ...column,
                    flex: compact ? 1 : undefined,
                    width: compact ? "100%" : "min(45%, 380px)",
                    flexShrink: 0,
                    borderLeft: compact
                      ? undefined
                      : "1px solid var(--border-standard)",
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      ...row,
                      ...inset,
                      flexShrink: 0,
                      borderBottom: "1px solid var(--border-standard)",
                    },
                  },
                  h(
                    "span",
                    { className: "text-label", style: { flex: 1 } },
                    "素材详情",
                  ),
                  button("关闭详情", () => select("")),
                ),
                h(
                  "div",
                  {
                    style: {
                      ...inset,
                      display: "grid",
                      alignContent: "start",
                      gridAutoRows: "max-content",
                      gap: "var(--space-4)",
                      overflow: "auto",
                      minHeight: 0,
                      flex: 1,
                    },
                  },
                  h("img", {
                    src: item.image,
                    alt: item.title,
                    style: {
                      width: "100%",
                      maxHeight: "20rem",
                      objectFit: "contain",
                      flexShrink: 0,
                    },
                  }),
                  h(
                    "h2",
                    {
                      className: "text-heading-sm",
                      style: { margin: 0, overflowWrap: "anywhere" },
                    },
                    item.title,
                  ),
                  text(`${item.actor} · ${date(item.date)} · V${item.version}`),
                  section(
                    "文案",
                    h(
                      "p",
                      {
                        style: {
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        },
                      },
                      item.caption,
                    ),
                  ),
                  text(item.tags.map((tag) => `#${tag}`).join(" ")),
                  section(
                    "发布记录",
                    item.publications.length
                      ? item.publications.map((p, i) =>
                          text(`${p.platform} · V${p.version}`, { key: i }),
                        )
                      : text("暂无发布记录"),
                  ),
                  section(
                    "历史版本",
                    item.versions.map((v) =>
                      text(`V${v.number} · ${v.actor} · ${date(v.createdAt)}`, {
                        key: v.number,
                      }),
                    ),
                  ),
                  section(
                    "素材 ID",
                    text(`${item.id} · revision ${item.revision}`, {
                      style: { margin: 0, overflowWrap: "anywhere" },
                    }),
                  ),
                  text(
                    "此快照不播放视频或下载原件。上传、编辑、下载请从原站操作进入。",
                  ),
                ),
              ),
          ),
    );
  }
  function Page() {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot,
    );
    const visit = React.useMemo(
      () => ({}),
      [connection.session, connection.generation, connection.scope],
    );
    const previous = React.useRef(),
      sequence = React.useRef(0);
    if (previous.current !== visit) {
      previous.current = visit;
      sequence.current++;
    }
    return connection.status === "ready" &&
      !connection.cached &&
      connection.session?.viewer
      ? h(
          preview?.owner === connection.session.viewer
            ? PreviewWorkspace
            : Workspace,
          { key: sequence.current, connection },
        )
      : h(
          "p",
          { style: inset, role: "status" },
          "连接当前账号的社区后可打开工作区",
        );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItcGhvdG8iCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTE1IDhoLjAxIiAvPgogIDxwYXRoIGQ9Ik0zIDZhMyAzIDAgMCAxIDMgLTNoMTJhMyAzIDAgMCAxIDMgM3YxMmEzIDMgMCAwIDEgLTMgM2gtMTJhMyAzIDAgMCAxIC0zIC0zdi0xMiIgLz4KICA8cGF0aCBkPSJNMyAxNmw1IC01Yy45MjggLS44OTMgMi4wNzIgLS44OTMgMyAwbDUgNSIgLz4KICA8cGF0aCBkPSJNMTQgMTRsMSAtMWMuOTI4IC0uODkzIDIuMDcyIC0uODkzIDMgMGwzIDMiIC8+Cjwvc3ZnPg==",
    id: "assets",
    title,
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Page,
  });
}
