import {saveExecution} from './execution.mjs';
import {createTaskWorkspace} from './live-ui.mjs';
import {parseTaskCanvas} from './live-model.mjs';
export const inject = ["react", "pages", "relay", "conversation", "agents"];

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const title = "公司看板";
  const company = true;
  const sourceChannel = "7dc199bc-755b-47bb-8f71-fe311b1f1ab1";
  const source = `buzz://channel/${sourceChannel}`;
  const text = (value) =>
    typeof value === "string" || typeof value === "number"
      ? String(value)
      : "—";

  function current() {
    const connection = ctx.relay.snapshot();
    if (
      connection.status !== "ready" ||
      connection.cached ||
      !connection.session?.viewer
    ) {
      throw new Error("请先连接当前账号的社区。");
    }
    return connection;
  }
  function check(connection) {
    const latest = current();
    if (
      latest.session !== connection.session ||
      latest.generation !== connection.generation ||
      latest.scope !== connection.scope
    ) {
      throw new Error("账号或社区已变化，请重新读取。");
    }
  }
  // The channel Canvas owns the new plan. This projection never imports old progress.
  async function read(connection) {
    check(connection);
    if(typeof connection.session.canvas?.read!=='function')throw new Error('当前宿主不支持读取频道 Canvas');
    const access=()=>{
      check(connection);const roster=connection.session.channels.list();const channel=roster.channels.find(c=>c.id===sourceChannel);
      if(roster.status!=='ready'||!channel||channel.archived||channel.cached||channel.metadataPending||!channel.members?.includes(connection.session.viewer))throw new Error('工作基线权限已变化，请核对当前成员身份');
    };
    access();const event=await connection.session.canvas.read(sourceChannel);access();
    return parseTaskCanvas(event);
  }

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
  let bridge;
  const TaskView = createTaskWorkspace(React);
  function Workspace({ connection, panel = false }) {
    const roster = React.useSyncExternalStore(connection.session.channels.subscribeList, connection.session.channels.list, connection.session.channels.list);
    const channel = roster.channels.find(c => c.id === sourceChannel);
    const allowed = roster.status === 'ready' && channel && !channel.archived && !channel.cached && !channel.metadataPending && channel.members?.includes(connection.session.viewer);
    const [state,setState] = React.useState({loading:true}), [refresh,setRefresh] = React.useState(0), [selected,select] = React.useState(''), [chat,setChat] = React.useState(false);
    React.useEffect(() => { connection.session.channels.ensureList(); }, [connection.session]);
    const owner = React.useMemo(() => ({connection,channel:'',linkVersion:0,selected:'',focus:(id,data)=>{setState({data,loading:false});select(id);}}), [connection.session,connection.scope,connection.generation]);
    const onChannel=React.useCallback(id=>{if(owner.channel!==id)owner.linkVersion++;owner.channel=id;},[owner]);
    owner.selected=allowed&&!state.error?selected:'';
    React.useEffect(()=>{if(panel)return;bridge=owner;return()=>{if(bridge===owner)bridge=undefined;};},[owner,panel]);
    React.useEffect(()=>{
      if(!allowed){setState({loading:false,error:'当前账号无权读取工作基线'});select('');return;}
      let active=true;setState({loading:true});
      read(connection).then(data=>{if(active)setState({data,loading:false});},error=>{if(active){setState({loading:false,error:error.message});select('');}});
      return()=>{active=false;};
    },[connection.session,connection.scope,connection.generation,allowed,refresh]);
    const safeState=allowed?state:{loading:roster.status==='loading',error:'当前账号无权读取工作基线'};
    const canWrite=allowed&&!channel.readOnly&&!channel.pending&&connection.session.canvas?.available&&typeof connection.session.canvas.save==='function';
    const saveRecord=async(id,draft)=>{
      const saved=await saveExecution({session:connection.session,check:()=>check(connection),data:state.data,id,draft});
      const data=parseTaskCanvas(saved);check(connection);setState({data,loading:false});
    };
    return h(TaskView,{state:safeState,company,onRecord:canWrite?saveRecord:undefined,canAccept:channel?.creator===connection.session.viewer,selected:allowed&&!state.error?selected:'',onSelect:select,reload:()=>setRefresh(n=>n+1),assistantOpen:chat,onAssistant:panel?undefined:()=>setChat(value=>!value),assistant:chat?h(Assistant,{connection,context:'当前频道分工与计划，仅供读取和核对',visible:true,onChannel}):null});
  }
  function Page({ panel = false } = {}) {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot,
    );
    const visit = React.useMemo(
      () => ({}),
      [connection.session, connection.generation, connection.scope],
    );
    const previous = React.useRef();
    const sequence = React.useRef(0);
    if (previous.current !== visit) {
      previous.current = visit;
      sequence.current++;
    }
    return connection.status === "ready" &&
      !connection.cached &&
      connection.session?.viewer
      ? h(Workspace, {
          key: sequence.current,
          connection,
          panel,
        })
      : h(
          "p",
          { style: inset, role: "status" },
          "连接当前账号的社区后可读取任务。",
        );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItbGF5b3V0LWRhc2hib2FyZCIKPjxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9IiNmMWY0ZjgiIHN0cm9rZT0ibm9uZSIvPgogIDxwYXRoIHN0cm9rZT0ibm9uZSIgZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIgLz4KICA8cGF0aCBkPSJNNSA0aDRhMSAxIDAgMCAxIDEgMXY2YTEgMSAwIDAgMSAtMSAxaC00YTEgMSAwIDAgMSAtMSAtMXYtNmExIDEgMCAwIDEgMSAtMSIgLz4KICA8cGF0aCBkPSJNNSAxNmg0YTEgMSAwIDAgMSAxIDF2MmExIDEgMCAwIDEgLTEgMWgtNGExIDEgMCAwIDEgLTEgLTF2LTJhMSAxIDAgMCAxIDEgLTEiIC8+CiAgPHBhdGggZD0iTTE1IDEyaDRhMSAxIDAgMCAxIDEgMXY2YTEgMSAwIDAgMSAtMSAxaC00YTEgMSAwIDAgMSAtMSAtMXYtNmExIDEgMCAwIDEgMSAtMSIgLz4KICA8cGF0aCBkPSJNMTUgNGg0YTEgMSAwIDAgMSAxIDF2MmExIDEgMCAwIDEgLTEgMWgtNGExIDEgMCAwIDEgLTEgLTF2LTJhMSAxIDAgMCAxIDEgLTEiIC8+Cjwvc3ZnPg==",
    id: "main",
    title,
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Page,
  });

  ctx.agents.addTool({
    name: company ? "opcb_company_board_task" : "opcb_task_center_task",
    description:
      "读取或定位当前关联私人 Solo 的基线任务。省略 task_id 读取当前选择；focus 只改变页面选中项，不写任务。",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        action: { type: "string", enum: ["read", "focus"] },
      },
      additionalProperties: false,
    },
    async call(client, context, args) {
      const owner = bridge;
      const expectedLink = owner?.linkVersion;
      const expectedSelection = owner?.selected;
      const authorize = () => {
        if (
          !owner ||
          bridge !== owner ||
          owner.linkVersion !== expectedLink ||
          owner.selected !== expectedSelection ||
          !owner.channel ||
          owner.channel !== context.channel
        )
          throw new Error("请先在页面关联本私人 Solo。");
        check(owner.connection);
        const agentConnection = ctx.agents.relay(client.key)?.snapshot();
        const roster = owner.connection.session.channels.list();
        const c = roster.channels.find((c) => c.id === context.channel);
        if (
          client.owner !== owner.connection.session.viewer ||
          agentConnection?.status !== "ready" ||
          agentConnection.cached ||
          agentConnection.scope !== owner.connection.scope ||
          roster.status !== "ready" ||
          !c ||
          c.channelType !== "solo" ||
          !c.private ||
          c.creator !== client.owner ||
          c.archived ||
          c.cached ||
          c.pending ||
          c.readOnly ||
          c.metadataPending ||
          c.members?.length !== 2 ||
          !c.members.includes(client.owner) ||
          !c.members.includes(client.pubkey)
        )
          throw new Error("当前私人 Solo 权限已变化。");
      };
      authorize();
      if (![undefined, "read", "focus"].includes(args.action))
        throw new Error("操作不受支持。");
      const id = args.task_id || owner.selected;
      if (!id) throw new Error("先选择任务或提供 task_id。");
      const data = await read(owner.connection);
      authorize();
      const task = data.tasks.find((t) => t.id === id);
      if (!task) throw new Error("该任务不在当前基线中，请刷新列表。");
      if (args.action === "focus") owner.focus(id, data);
      return JSON.stringify({
        source,
        projection: "channel_baseline",
        baselineRevision: data.baselineRevision,
        syncedAt: data.syncedAt,
        task,
      });
    },
  });
}
