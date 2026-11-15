import {saveHumanFlow} from './lifecycle.mjs';
import {registerTaskFlow} from './lifecycle-agent.mjs';
import {canExecuteInChannel} from './execution-channels.mjs';
import {createTaskWorkspace} from './live-ui.mjs';
import {parseTaskCanvas} from './live-model.mjs';
export const inject = [
  "react",
  "pages",
  "panels",
  "relay",
  "conversation",
  "agents",
];

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const title = "任务中心";
  const company = false;
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
      if(roster.status!=='ready'||!channel||channel.archived||channel.cached||channel.metadataCached||channel.metadataPending||!channel.members?.includes(connection.session.viewer))throw new Error('工作基线权限已变化，请核对当前成员身份');
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
    gap: "var(--space-2, 8px)",
    minWidth: 0,
  };
  const inset = { padding: "var(--space-panel-inset, 16px)" };
  const button = (label, onClick, props = {}) =>
    h("button", { type: "button", onClick, ...props }, label);
  function Messages({ connection, channel, shown=true }) {
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
    }, [messages.rows, shown]);
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
            soloConversation: channel.channelType === "solo",
            ownSoloConversation: channel.channelType === "solo" && channel.creator === session.viewer,
            shown,
            label: "执行指令",
            placeholder: channel.channelType === "solo" ? "输入执行要求…" : "输入执行要求，使用 @ 指定 Agent…",
          }),
        ),
    });
  }
  function Assistant({ connection, context, visible, onChannel,selected,select,requestDraft,setRequestDraft }) {
    const session = connection.session;
    const list = React.useSyncExternalStore(
      session.channels.subscribeList,
      session.channels.list,
      session.channels.list,
    );
    React.useEffect(() => {
      session.channels.ensureList();
    }, [session]);
    const choices=React.useSyncExternalStore(session.agentChoices.subscribe,session.agentChoices.snapshot,session.agentChoices.snapshot);
    const [target,setTarget]=React.useState(''),[sendError,setSendError]=React.useState(''),[sending,setSending]=React.useState(false);
    const sendBusy=React.useRef(false);
    const candidates =
      list.status === "ready"
        ? list.channels.filter((c) => canExecuteInChannel(c,session.viewer))
        : [];
    const channel = candidates.find((c) => c.id === selected);
    React.useEffect(() => {
      if (selected && list.status === "ready" && !channel)
        select("");
      onChannel?.(channel?.id || "");
      return () => onChannel?.("");
    }, [selected, list.status, channel, onChannel]);
    const agents=(choices.selectable||[]).filter(a=>channel?.members?.includes(a.pubkey));
    const recipient=agents.find(a=>a.pubkey===target)?.pubkey||(agents.length===1?agents[0].pubkey:'');
    const sendRequest=async()=>{
      if(sendBusy.current||!channel||!recipient||!requestDraft?.text?.trim())return;
      sendBusy.current=true;setSending(true);setSendError('');
      const draft=requestDraft,route=channel.id,agent=recipient;
      try{
        check(connection);const roster=session.channels.list(),fresh=roster.channels.find(c=>c.id===route);
        if(roster.status!=='ready'||!canExecuteInChannel(fresh,session.viewer)||!fresh.members.includes(agent))throw Error('执行目标权限已变化');
        const body=draft.task?`任务：${draft.task.title}\ntask_id: ${draft.task.id}\nrevision: ${draft.task.revision}\n${draft.text}`:draft.text;
        await session.messages.send(route,body,[agent]);check(connection);
        setRequestDraft(current=>current?.key===draft.key?null:current);
      }catch(e){setSendError(e.message||'发送未确认，草稿保留；请先核对会话再发送。');}
      finally{sendBusy.current=false;setSending(false);}
    };
    return h(
      "aside",
      {
        "aria-label": "工作助手",
        style: { ...column, flex: 1, height: "100%" },
      },
      h(
        "div",
        { style: { ...column, ...inset, gap: "var(--space-2, 8px)" } },
        h(
          "label",
          null,
          "执行会话",
          h(
            "select",
            {
              value: channel?.id || "",
              "aria-label": "执行会话",
              style: { width: "100%" },
              onChange: (e) => select(e.target.value),
            },
            h("option", { value: "" }, "选择已有 Solo 或频道"),
            candidates.map((c) =>
              h("option", { key: c.id, value: c.id }, (c.channelType==="solo"?"Solo · ":"频道 · ")+c.name),
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
            list.status === "loading"
              ? "正在读取执行会话…"
              : "选择有权发送消息的 Solo 或频道；用 @ 指定 Agent",
          ),
      ),
      requestDraft&&h('section',{className:'tr-request-draft','aria-label':'任务指令'},h('p',null,'确认后发给当前会话中的 Agent'),
        h('label',null,'执行 Agent',h('select',{'aria-label':'执行 Agent',value:recipient,onChange:e=>setTarget(e.target.value)},h('option',{value:''},'选择 Agent'),...agents.map(a=>h('option',{key:a.pubkey,value:a.pubkey},a.name||a.displayName||a.pubkey.slice(0,12))))),
        h('textarea',{'aria-label':'任务指令草稿',value:requestDraft.text,onChange:e=>{const text=e.target.value;setRequestDraft(current=>current?{...current,text}:current);}}),
        h('div',null,button(sending?'正在发送…':'发送指令',sendRequest,{disabled:sending||!channel||!recipient||!requestDraft.text.trim()}),button('取消指令',()=>setRequestDraft(null),{disabled:sending})),
        sendError&&h('p',{role:'alert'},sendError)),
      channel &&
        h(Messages, { key: channel.id, connection, channel, shown:visible }),
    );
  }
  let bridge;
  const TaskView = createTaskWorkspace(React);
  function Workspace({ connection, panel = false }) {
    const roster = React.useSyncExternalStore(connection.session.channels.subscribeList, connection.session.channels.list, connection.session.channels.list);
    const channel = roster.channels.find(c => c.id === sourceChannel);
    const allowed = roster.status === 'ready' && channel && !channel.archived && !channel.cached && !channel.metadataCached && !channel.metadataPending && channel.members?.includes(connection.session.viewer);
    const [state,setState] = React.useState({loading:true}), [refresh,setRefresh] = React.useState(0), [selected,select] = React.useState(''), [chat,setChat] = React.useState(false),[executionChannel,setExecutionChannel]=React.useState(''),[requestDraft,setRequestDraft]=React.useState(null);
    const savingCheck=React.useRef(false);
    React.useEffect(() => { connection.session.channels.ensureList(); }, [connection.session]);
    const owner = React.useMemo(() => ({connection,channel:'',linkVersion:0,selected:'',update:data=>setState({data,loading:false}),focus:(id,data)=>{setState({data,loading:false});select(id);}}), [connection.session,connection.scope,connection.generation]);
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
    const request=(id,action)=>{
      const task=state.data?.tasks.find(t=>t.id===id);
      if(id&&!task)return;
      select(id||'');setChat(true);
      if(task?.executionChannel)setExecutionChannel(task.executionChannel);
      const instruction=action==='find'?'这个任务已经交付了，请找一下当前轮次的结果链接并核对版本，更新到待验收。':task?'请处理这项任务。执行前读取最新轮次，实际开工和交付时自动更新任务状态。':'请建立一个新任务：';
      setRequestDraft({key:crypto.randomUUID(),task:task?{id:task.id,title:task.title,revision:task.revision||0}:null,text:instruction});
    };
    const saveHuman=async(ids,action,completed)=>{
      if(savingCheck.current)throw Error('另一项任务正在保存，请稍后');
      savingCheck.current=true;
      try{const saved=await saveHumanFlow({session:connection.session,check:()=>check(connection),data:state.data,ids,action,completed});
        const data=parseTaskCanvas(saved);check(connection);setState({data,loading:false});
        if(action==='remove')setRequestDraft(current=>ids.includes(current?.task?.id)?null:current);
      }finally{savingCheck.current=false;}
    };
    const toggleCheck=async(id,completed)=>{
      const task=state.data?.tasks.find(t=>t.id===id);
      if(completed&&task&&(task.executor||task.executionKind==='agent'||task.status==='review')&&!task.delivery){request(id,'find');throw Error('请确认发送找交付指令；核对后即可勾选验收。');}
      return saveHuman([id],'check',completed);
    };
    const taskContext=allowed&&!state.error?state.data?.tasks.find(task=>task.id===selected&&!task.removed):undefined;
    return h(TaskView,{state:safeState,company,onCheck:canWrite?toggleCheck:undefined,onRequest:request,onRemove:canWrite?ids=>saveHuman(ids,'remove'):undefined,onRestore:canWrite?ids=>saveHuman(ids,'restore'):undefined,canAccept:channel?.creator===connection.session.viewer,selected:allowed&&!state.error?selected:'',onSelect:select,reload:()=>setRefresh(n=>n+1),assistantOpen:chat,onAssistant:panel?undefined:desired=>setChat(value=>typeof desired==='boolean'?desired:!value),assistant:chat?h(Assistant,{connection,context:taskContext?`${taskContext.code||''} ${taskContext.title} · ${taskContext.team||'团队待确认'} · ${taskContext.date||'待排期'} ${taskContext.times?.join('／')||''}。请在下方给 Agent 明确执行指令。`:'选择执行会话，在下方输入指令；使用原生消息、@与附件。',visible:true,onChannel,selected:executionChannel,select:setExecutionChannel,requestDraft,setRequestDraft}):null});
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
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItbGlzdC1jaGVjayIKPjxyZWN0IHg9IjAiIHk9IjAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgcng9IjUiIGZpbGw9IiNmMWY0ZjgiIHN0cm9rZT0ibm9uZSIvPgogIDxwYXRoIHN0cm9rZT0ibm9uZSIgZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIgLz4KICA8cGF0aCBkPSJNMy41IDUuNWwxLjUgMS41bDIuNSAtMi41IiAvPgogIDxwYXRoIGQ9Ik0zLjUgMTEuNWwxLjUgMS41bDIuNSAtMi41IiAvPgogIDxwYXRoIGQ9Ik0zLjUgMTcuNWwxLjUgMS41bDIuNSAtMi41IiAvPgogIDxwYXRoIGQ9Ik0xMSA2bDkgMCIgLz4KICA8cGF0aCBkPSJNMTEgMTJsOSAwIiAvPgogIDxwYXRoIGQ9Ik0xMSAxOGw5IDAiIC8+Cjwvc3ZnPg==",
    id: "main",
    title,
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Page,
  });

  ctx.panels.register({
    id: "task-progress",
    title: "任务进度",
    channelPlacement: "side",
    matches: (target) => target.startsWith("opcb-task-progress:"),
    channelLauncher: ({ context, pressed, toggle, available }) =>
      button(
        "任务进度",
        () => toggle(`opcb-task-progress:${context.channelId}`),
        { disabled: !available(), "aria-pressed": pressed },
      ),
    component: () => h(Page, { panel: true }),
  });

  registerTaskFlow({agents:ctx.agents,relay:ctx.relay,
    taskFlowLinked:channel=>bridge?.channel===channel&&bridge?.connection.session===ctx.relay.snapshot().session&&bridge?.connection.scope===ctx.relay.snapshot().scope,
    taskFlowUpdated:data=>bridge?.update(data)});
  if (!company) {
    ctx.agents.addTool({
      name: "opcb_tasks_guide",
      description:
        "读取公司看板与任务中心的同源同步规则（ask-opcb-flow / manage-end-to-end-task 的兼容接入说明）。不修改任务。",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async call() {
        return "当前任务唯一基线为 buzz://channel/7dc199bc-755b-47bb-8f71-fe311b1f1ab1 的人员分工 Canvas；旧Git任务与旧完成数已退出。读取不代表重新执行或验收通过，分工与计划不推断执行状态。基线与执行事实分开：Agent通过opcb_task_flow在获准原会话建立、开工、修改和交付；仅实际回执更新状态，个人勾选即确认本人工作或验收当前交付；原Canvas同源事件与轮次检查保存。不得把聊天汇报自动记为完成，也不能刷新旧Vault恢复旧任务。";
      },
    });
    ctx.agents.addTool({
      name: "opcb_tasks_snapshot",
      description:
        "只读现有公司看板/任务中心的同一频道工作基线，含任务ID、Canvas版本和来源时间；未登记的执行状态保留未知。仅供本人和本 Agent 的私人 Solo，或本人在页面明确关联且双方均为成员的执行频道。",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      async call(client, context) {
        const connection = current();
        const authorize = () => {
          check(connection);
          const list = connection.session.channels.list();
          const channel = list.channels.find(
            (item) => item.id === context.channel,
          );
          const privateSolo=channel?.channelType==='solo'&&channel.private===true&&channel.members?.length===2;
          const linked=bridge?.connection.session===connection.session&&bridge?.connection.scope===connection.scope&&bridge?.connection.generation===connection.generation&&bridge?.channel===context.channel;
          const agentConnection=ctx.agents.relay(client.key)?.snapshot();
          if (
            client.owner!==connection.session.viewer||list.status!=='ready'||!canExecuteInChannel(channel,connection.session.viewer)||!channel.members?.includes(client.pubkey)||
            (!privateSolo&&(!linked||agentConnection?.status!=='ready'||agentConnection.cached||agentConnection.scope!==connection.scope))
          ) {
            throw new Error(
              "请在本人和本 Agent 的私人 Solo，或页面明确关联的执行频道中读取任务。",
            );
          }
        };
        authorize();
        const data = await read(connection);
        authorize();
        return JSON.stringify({
          ...data,
          source,
          projection: "channel_baseline",
        });
      },
    });
  }

  ctx.agents.addTool({
    name: company ? "opcb_company_board_task" : "opcb_task_center_task",
    description:
      "读取或定位当前明确关联的 Solo 或执行频道中的基线任务。省略 task_id 读取当前选择；focus 只改变页面选中项，不写任务。",
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
          throw new Error("请先在页面关联本执行会话。");
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
          !canExecuteInChannel(c,client.owner) ||
          c.archived ||
          c.cached ||
          c.pending ||
          c.readOnly ||
          c.metadataPending ||
          !c.members.includes(client.owner) ||
          !c.members.includes(client.pubkey)
        )
          throw new Error("当前执行会话权限已变化。");
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
