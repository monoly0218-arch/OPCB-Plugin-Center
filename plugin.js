// src/shangliangshan-assets/plugin.mjs
var inject = ["react", "pages", "browser", "relay", "conversation"];
function apply(ctx) {
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
    const [visit, reload] = React.useState(0);
    const [help, showHelp] = React.useState(false);
    return h(Layout, {
      connection,
      context: "此处使用实时资产库；助手对话不会自动获得网页中选中的资产。请在对话中明确提供素材链接或文件。",
      actions: h(
        "div",
        { style: { ...column, flexShrink: 0, borderBottom: "1px solid var(--border-standard)" } },
        h(
          "div",
          { style: { ...row, padding: "8px 16px", minHeight: 44 } },
          h("span", { className: "text-secondary", style: { flex: "1 1 160px", fontSize: 14 } }, "实时资产工作区"),
          button("重新载入", () => reload((v) => v + 1), { disabled: !ctx.browser.available }),
          button("使用说明", () => showHelp(!help), { "aria-expanded": help, "aria-controls": "opcb-assets-help" })
        ),
        help && h(
          "div",
          { id: "opcb-assets-help", style: { padding: "0 16px 16px", fontSize: 14, lineHeight: 1.6 } },
          h("p", { style: { margin: 0 } }, "素材以原站当前版本为准，上传、下载和版本操作由原站提供。首次进入请本人选择成员；Buzz账号与网站署名分别管理。"),
          h("p", { style: { margin: "8px 0 0" } }, "助手可随时展开；网页选择不会自动发给助手。重新载入前请先保存网页中尚未提交的内容。")
        )
      )
    }, ctx.browser.available ? h(ctx.browser.View, { key: visit, url: "https://staging.paolab.cn/assets/", label: "上粮山资产库 · 实时工作区" }) : h(
      "section",
      { "aria-label": "资产库设备支持", role: "status", style: { ...column, padding: 24, gap: 16 } },
      h("h2", { style: { margin: 0, fontSize: 20 } }, "此设备暂不支持内嵌资产库"),
      h("p", { style: { margin: 0 } }, "可在支持内嵌网站的Buzz macOS桌面版使用，或打开原站继续工作"),
      h("a", { href: "https://staging.paolab.cn/assets/", target: "_blank", rel: "noopener noreferrer" }, "打开资产库原站")
    ));
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
      Workspace,
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
export {
  apply,
  inject
};
