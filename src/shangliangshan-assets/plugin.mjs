import {createMediaUI} from '../media-workspace/ui.mjs';
export const inject = ["react", "pages", "browser", "relay", "conversation"];
// Repository source never contains the owner's assets or thumbnails.
export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const {Header,Tool}=createMediaUI(React);
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
  function Workspace({connection}) {
    const [visit,reload]=React.useState(0),[chat,showChat]=React.useState(false),[theme,setTheme]=React.useState('host');
    const site=ctx.browser.available?h(ctx.browser.View,{key:visit,url:'https://staging.paolab.cn/assets/',storage:'opcb.shangliangshan-assets',label:'上粮山资产库 · 实时工作区'}):h('section',{className:'mw-empty',role:'status'},h('h2',null,'此设备暂不支持内嵌资产库'),h('a',{href:'https://staging.paolab.cn/assets/',target:'_blank',rel:'noopener noreferrer'},'打开资产库原站'));
    return h('div',{className:'opcb-v3 media-workspace','aria-label':title,'data-language':'zh','data-theme':theme},
      h('style',null,typeof OPCB_FACTORY_ASSETS_UI_CSS==='string'?OPCB_FACTORY_ASSETS_UI_CSS:''),
      h(Header,{brand:'Assets',mark:'briefcase',tools:h(React.Fragment,null,h(Tool,{label:'重新载入',icon:'refresh',disabled:!ctx.browser.available,onClick:()=>reload(v=>v+1)}),h(Tool,{label:chat?'收起助手':'打开助手',icon:'chat',pressed:chat,onClick:()=>showChat(!chat)}),h(Tool,{label:'切换明暗主题',icon:'moon',onClick:()=>setTheme(theme==='dark'?'light':'dark')}))}),
      chat?h('div',{className:'mw-split'},h('div',{className:'mw-site'},site),h('section',{className:'mw-panel'},h(Assistant,{connection,context:'网页选择不会自动发给助手；请在对话中提供资产链接或文件。',visible:true}))):h('div',{className:'mw-site'},site));
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
          Workspace,
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
