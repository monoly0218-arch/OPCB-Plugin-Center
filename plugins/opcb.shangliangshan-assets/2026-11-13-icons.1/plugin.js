// src/plugin-icons/bases/opcb.shangliangshan-assets/plugin.js
var inject = ["react", "pages", "browser", "relay", "conversation"];
function apply(ctx, preview = { "count": 0, "items": [], "owner": "", "capturedAt": "未载入素材快照" }) {
  const React = ctx.react;
  const h = React.createElement;
  const title = "上粮山资产库";
  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0
  };
  const row = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    minWidth: 0
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const button = (label, onClick, props = {}) => h("button", { type: "button", onClick, ...props }, label);
  function eligible(c, session, choices) {
    return c.channelType === "solo" && c.private === true && c.creator === session.viewer && !c.archived && !c.readOnly && !c.cached && !c.pending && !c.metadataPending && c.members?.length === 2 && c.members.includes(session.viewer) && choices.selectable.some(
      (a) => a.pubkey !== session.viewer && c.members.includes(a.pubkey)
    );
  }
  function Messages({ connection, channel }) {
    const session = connection.session;
    const subscribe = React.useCallback(
      (n) => session.channels.subscribeWindow(channel.id, n),
      [session, channel.id]
    );
    const snapshot = React.useCallback(
      () => session.channels.window(channel.id),
      [session, channel.id]
    );
    const messages = React.useSyncExternalStore(subscribe, snapshot, snapshot);
    const scroll = React.useRef(null), follow = React.useRef(true);
    React.useEffect(
      () => session.channels.ensure(channel.id),
      [session, channel.id]
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
      children: (interactions) => h(
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
              follow.current = v.scrollHeight - v.scrollTop - v.clientHeight < 80;
            }
          },
          messages.hasMore && button(
            messages.loadingOlder ? "正在读取…" : "读取更早消息",
            () => {
              follow.current = false;
              session.channels.loadOlder(channel.id);
            },
            {
              disabled: messages.loadingOlder || messages.status !== "ready"
            }
          ),
          messages.error && h("p", { role: "alert", style: inset }, messages.error),
          messages.status === "loading" && h("p", { role: "status", style: inset }, "正在读取对话…"),
          messages.status === "ready" && !messages.rows.length && h("p", { style: inset }, "在此讨论当前工作"),
          messages.rows.map(
            (m) => h(ctx.conversation.ui.Message, {
              key: m.id,
              row: m,
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
          disabled: messages.status !== "ready"
        })
      )
    });
  }
  function Assistant({ connection, context, visible, onChannel }) {
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
    const [selected, select] = React.useState("");
    React.useEffect(() => {
      session.channels.ensureList();
      session.agentChoices.ensure(true, true);
    }, [session]);
    const candidates = list.status === "ready" ? list.channels.filter((c) => eligible(c, session, choices)) : [];
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
        style: { ...column, flex: 1, height: "100%" }
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
              onChange: (e) => select(e.target.value)
            },
            h("option", { value: "" }, "选择已有的 Solo"),
            candidates.map(
              (c) => h("option", { key: c.id, value: c.id }, c.name)
            )
          )
        ),
        h(
          "p",
          {
            className: "text-secondary",
            style: { margin: 0, overflowWrap: "anywhere" }
          },
          context
        ),
        !channel && h(
          "p",
          {
            role: "status",
            className: "text-secondary",
            style: { margin: 0 }
          },
          list.status === "loading" || choices.pending ? "正在读取私人对话…" : "选择本人和一个 Agent 的私人 Solo"
        )
      ),
      visible && channel && h(Messages, { key: channel.id, connection, channel })
    );
  }
  function Layout({ connection, children, context, onChannel, actions }) {
    const [chat, showChat] = React.useState(false), [compact, setCompact] = React.useState(false);
    const [width, setWidth] = React.useState(360), root = React.useRef(null);
    React.useEffect(() => {
      const observer = new ResizeObserver(
        ([entry]) => setCompact(entry.contentRect.width < 820)
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
            borderBottom: "1px solid var(--border-standard)"
          }
        },
        h(
          "h1",
          { className: "text-label", style: { margin: 0, flex: 1 } },
          title
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
              "aria-hidden": true
            },
            h("path", { d: "M4 4h16v16H4zM15 4v16M8 10l2 2-2 2" })
          ),
          () => showChat(!chat),
          {
            "aria-label": chat ? compact ? "查看工作区" : "收起助手" : "打开助手",
            title: chat ? "收起助手" : "打开助手",
            "aria-expanded": chat
          }
        )
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
              ...compact && chat ? { display: "none" } : {},
              flex: 1
            }
          },
          children
        ),
        h(
          "div",
          {
            hidden: !chat,
            style: {
              ...column,
              ...!chat ? { display: "none" } : {},
              width: compact ? "100%" : `min(45%, ${width}px)`,
              flexShrink: 0,
              borderLeft: compact ? void 0 : "1px solid var(--border-standard)"
            }
          },
          !compact && h(
            "label",
            {
              style: {
                ...row,
                padding: "var(--space-2) var(--space-panel-inset)"
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
              style: { flex: 1, minWidth: 0 },
              onChange: (e) => setWidth(Number(e.target.value))
            })
          ),
          h(Assistant, { connection, context, visible: chat, onChannel })
        )
      )
    );
  }
  function Workspace({ connection }) {
    const [opened, open] = React.useState(false), [visit, restart] = React.useState(0);
    return h(
      Layout,
      {
        connection,
        context: "上传、下载、版本与发布记录沿用原资产库；网站署名独立管理。助手不能读取网页中选中的资产。"
      },
      opened && ctx.browser.available ? h(
        React.Fragment,
        null,
        h(
          "div",
          {
            style: {
              ...row,
              padding: "var(--space-2) var(--space-panel-inset)",
              flexShrink: 0,
              borderBottom: "1px solid var(--border-standard)"
            }
          },
          button("重新打开原站", () => restart((v) => v + 1)),
          button("退出工作区", () => open(false)),
          h(
            "span",
            {
              className: "text-secondary",
              style: { flex: "1 1 200px", overflowWrap: "anywhere" }
            },
            "上传、下载、版本与发布记录沿用原资产库；网站署名独立管理。助手不能读取网页中选中的资产。"
          )
        ),
        h(ctx.browser.View, {
          key: visit,
          url: "https://staging.paolab.cn/assets/",
          label: title
        })
      ) : h(
        "section",
        {
          style: {
            ...column,
            ...inset,
            maxWidth: "48rem",
            gap: "var(--space-4)",
            overflow: "auto"
          },
          "aria-label": "打开工作区"
        },
        h(
          "h2",
          { className: "text-heading-sm", style: { margin: 0 } },
          "浏览素材，保留完整资产操作"
        ),
        h(
          "p",
          { className: "text-secondary", style: { margin: 0 } },
          "上传、下载、版本与发布记录沿用原资产库；网站署名独立管理。助手不能读取网页中选中的资产。"
        ),
        h(
          "p",
          {
            className: "text-secondary",
            style: { margin: 0, overflowWrap: "anywhere" }
          },
          "https://staging.paolab.cn/assets/"
        ),
        ctx.browser.available ? button("进入工作区", () => open(true), {
          style: { alignSelf: "start" }
        }) : h(
          "p",
          { role: "status" },
          "当前设备不支持内嵌网站，请在 macOS 桌面版打开"
        )
      )
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
      const observer = new ResizeObserver(
        ([entry]) => setCompact(entry.contentRect.width < 760)
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
      ["activities", "活动与合作"]
    ];
    const items = preview.items.filter(
      (a) => (!category || a.category === category) && (!kind || a.kind === kind) && (!query.trim() || [a.title, a.caption, ...a.tags].join(" ").toLowerCase().includes(query.trim().toLowerCase()))
    );
    const reset = () => {
      search("");
      chooseCategory("");
      chooseKind("");
    };
    const date = (value) => new Date(value).toLocaleDateString("zh-CN");
    const text = (value, props = {}) => h(
      "p",
      { className: "text-secondary", style: { margin: 0 }, ...props },
      value
    );
    const section = (label, content) => h(
      "section",
      { style: { display: "block" } },
      h("h3", { className: "text-label", style: { margin: 0 } }, label),
      content
    );
    return h(
      Layout,
      {
        connection,
        context: item ? `只读快照：${item.title} · V${item.version}。此版没有素材工具，选择不会自动发送给助手。` : "此版展示只读素材快照；聊天不会自动获得选中素材，也不能更新素材。",
        actions: h(
          "div",
          {
            style: {
              ...row,
              ...inset,
              flexShrink: 0,
              borderBottom: "1px solid var(--border-standard)"
            }
          },
          text(
            `只读预览 · ${preview.capturedAt} · ${preview.items.length} 组样本 / 源库 ${preview.count} 组`,
            { style: { margin: 0, flex: "1 1 240px" } }
          ),
          button(
            website ? "返回素材预览" : "原站操作",
            () => showWebsite(!website),
            {
              disabled: !website && !ctx.browser.available
            }
          )
        )
      },
      website ? h(ctx.browser.View, {
        url: "https://staging.paolab.cn/assets/",
        label: title
      }) : h(
        "div",
        {
          ref: root,
          style: { display: "flex", flex: 1, minHeight: 0, minWidth: 0 }
        },
        (!compact || !item) && h(
          "section",
          { "aria-label": "素材预览", style: { ...column, flex: 1 } },
          h(
            "div",
            {
              style: {
                ...column,
                ...inset,
                gap: "var(--space-3)",
                flexShrink: 0
              }
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
                  minWidth: "min(180px, 100%)"
                },
                onChange: (e) => search(e.target.value)
              }),
              h(
                "select",
                {
                  value: kind,
                  "aria-label": "素材类型",
                  onChange: (e) => chooseKind(e.target.value)
                },
                h("option", { value: "" }, "全部类型"),
                h("option", { value: "image" }, "图片"),
                h("option", { value: "video" }, "视频")
              ),
              button("清空筛选", reset)
            ),
            h(
              "nav",
              { "aria-label": "素材分类", style: row },
              categories.map(
                ([id, label]) => button(label, () => chooseCategory(id), {
                  key: id,
                  "aria-pressed": category === id
                })
              )
            ),
            text(`${items.length} 组匹配样本；搜索仅限这份快照`)
          ),
          h(
            "div",
            {
              style: {
                ...inset,
                paddingTop: 0,
                overflow: "auto",
                flex: 1,
                minHeight: 0
              }
            },
            items.length ? h(
              "div",
              {
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(200px, 100%), 1fr))",
                  gap: "var(--space-4)"
                }
              },
              items.map(
                (a) => button(
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
                        display: "block"
                      }
                    }),
                    h(
                      "span",
                      {
                        style: {
                          ...column,
                          padding: "var(--space-3)",
                          gap: "var(--space-2)"
                        }
                      },
                      h(
                        "span",
                        {
                          className: "text-label",
                          style: { overflowWrap: "anywhere" }
                        },
                        a.title
                      ),
                      h(
                        "span",
                        { className: "text-secondary" },
                        `${a.kind === "video" ? "视频" : "图片"} · V${a.version} · ${a.publications.length ? "有发布记录" : "暂无发布记录"}`
                      ),
                      h(
                        "span",
                        { className: "text-secondary" },
                        `${a.actor} · ${date(a.date)}`
                      )
                    )
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
                      borderRadius: "var(--radius-container)"
                    }
                  }
                )
              )
            ) : h(
              "div",
              { style: { ...column, gap: "var(--space-3)" } },
              text("没有符合条件的样本"),
              button("重置筛选", reset)
            )
          )
        ),
        item && h(
          "aside",
          {
            "aria-label": "素材详情",
            style: {
              ...column,
              flex: compact ? 1 : void 0,
              width: compact ? "100%" : "min(45%, 380px)",
              flexShrink: 0,
              borderLeft: compact ? void 0 : "1px solid var(--border-standard)"
            }
          },
          h(
            "div",
            {
              style: {
                ...row,
                ...inset,
                flexShrink: 0,
                borderBottom: "1px solid var(--border-standard)"
              }
            },
            h(
              "span",
              { className: "text-label", style: { flex: 1 } },
              "素材详情"
            ),
            button("关闭详情", () => select(""))
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
                flex: 1
              }
            },
            h("img", {
              src: item.image,
              alt: item.title,
              style: {
                width: "100%",
                maxHeight: "20rem",
                objectFit: "contain",
                flexShrink: 0
              }
            }),
            h(
              "h2",
              {
                className: "text-heading-sm",
                style: { margin: 0, overflowWrap: "anywhere" }
              },
              item.title
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
                    overflowWrap: "anywhere"
                  }
                },
                item.caption
              )
            ),
            text(item.tags.map((tag) => `#${tag}`).join(" ")),
            section(
              "发布记录",
              item.publications.length ? item.publications.map(
                (p, i) => text(`${p.platform} · V${p.version}`, { key: i })
              ) : text("暂无发布记录")
            ),
            section(
              "历史版本",
              item.versions.map(
                (v) => text(`V${v.number} · ${v.actor} · ${date(v.createdAt)}`, {
                  key: v.number
                })
              )
            ),
            section(
              "素材 ID",
              text(`${item.id} · revision ${item.revision}`, {
                style: { margin: 0, overflowWrap: "anywhere" }
              })
            ),
            text(
              "此快照不播放视频或下载原件。上传、编辑、下载请从原站操作进入。"
            )
          )
        )
      )
    );
  }
  function Page() {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot
    );
    const visit = React.useMemo(
      () => ({}),
      [connection.session, connection.generation, connection.scope]
    );
    const previous = React.useRef(), sequence = React.useRef(0);
    if (previous.current !== visit) {
      previous.current = visit;
      sequence.current++;
    }
    return connection.status === "ready" && !connection.cached && connection.session?.viewer ? h(
      preview?.owner === connection.session.viewer ? PreviewWorkspace : Workspace,
      { key: sequence.current, connection }
    ) : h(
      "p",
      { style: inset, role: "status" },
      "连接当前账号的社区后可打开工作区"
    );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItcGhvdG8iCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTE1IDhoLjAxIiAvPgogIDxwYXRoIGQ9Ik0zIDZhMyAzIDAgMCAxIDMgLTNoMTJhMyAzIDAgMCAxIDMgM3YxMmEzIDMgMCAwIDEgLTMgM2gtMTJhMyAzIDAgMCAxIC0zIC0zdi0xMiIgLz4KICA8cGF0aCBkPSJNMyAxNmw1IC01Yy45MjggLS44OTMgMi4wNzIgLS44OTMgMyAwbDUgNSIgLz4KICA8cGF0aCBkPSJNMTQgMTRsMSAtMWMuOTI4IC0uODkzIDIuMDcyIC0uODkzIDMgMGwzIDMiIC8+Cjwvc3ZnPg==",
    id: "assets",
    title,
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Page
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
  inject
};
