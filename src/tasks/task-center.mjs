import {createTaskSolo} from './task-solo.mjs';
import {createTaskComposerActions} from './composer-actions.mjs';
import {saveHumanFlow} from './lifecycle.mjs';
import {recordAgentFlow,registerTaskFlow} from './lifecycle-agent.mjs';
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
  const TaskComposer=createTaskComposerActions(React);
  ctx.conversation.registerTool({id:"task-actions",title:"Task actions",order:20,component:TaskComposer.Tool});
  // The host owns the entire reader and composer, including profile subscriptions,
  // activity rows and Solo policy. Task adds only its composer tool context.
  function Messages({ connection, channel }) {
    const Workspace = ctx.conversation.ui.Workspace;
    return h('div', {className:'tr-native-conversation',style:{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gridTemplateRows:'minmax(0,1fr)',flex:1,minWidth:0,minHeight:0,overflow:'hidden'}},
      Workspace ? h(Workspace, {
        id:`opcb-task-execution:${channel.id}`,
        session:connection.session,
        scope:connection.scope,
        target:{channelId:channel.id},
        label:channel.name,
      }) : h('p', {role:'status',style:inset}, '完整原生会话暂不可用，请检查 Buzz 的 Channels 插件是否已启用。'));
  }
  function Assistant({ connection, task, visible, onChannel,selected,select,requestDraft,setRequestDraft,onNewSolo,soloBusy,soloMessage }) {
    const session = connection.session;
    const list = React.useSyncExternalStore(
      session.channels.subscribeList,
      session.channels.list,
      session.channels.list,
    );
    React.useEffect(() => {
      session.channels.ensureList();
    }, [session]);
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
    return h('aside',{'aria-label':'工作助手',className:'tr-assistant'},
      h('div',{className:'tr-session-bar'},h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},h('path',{d:'M4 5h16v12H9l-5 4z M8 9h8 M8 13h5'})),
        h('select',{value:channel?.id||'', 'aria-label':'执行会话',onChange:e=>select(e.target.value)},
          h('option',{value:''},list.status==='loading'?'正在读取会话…':'Choose conversation'),
          ...candidates.map(c=>h('option',{key:c.id,value:c.id},(c.channelType==='solo'?'Solo · ':'频道 · ')+c.name))),
        task&&h('button',{type:'button',className:'tr-new-solo','aria-label':'当前任务的专属Solo',disabled:soloBusy||!onNewSolo,onClick:()=>onNewSolo(task.id)},soloBusy?'Creating…':task.executionSolo?.phase==='ready'?'Open Solo':task.executionSolo?'Continue Solo':'New Solo')),
      soloMessage&&h('p',{className:'tr-solo-message',role:'status'},soloMessage),
      !channel&&h('div',{className:'tr-conversation-empty'},h('h3',null,'选择执行会话'),h('p',null,'选择已有 Solo 或频道后，直接输入要求。'),requestDraft&&h('p',null,'快捷指令已保留，选择后填入输入框。')),
      channel&&h(TaskComposer.Context.Provider,{value:{task,draft:requestDraft,setDraft:setRequestDraft,visible,onNewSolo,soloBusy}},h(Messages,{key:channel.id,connection,channel,shown:visible})));
  }

  let bridge;
  const TaskView = createTaskWorkspace(React);
  function Workspace({ connection, panel = false }) {
    const roster = React.useSyncExternalStore(connection.session.channels.subscribeList, connection.session.channels.list, connection.session.channels.list);
    const channel = roster.channels.find(c => c.id === sourceChannel);
    const allowed = roster.status === 'ready' && channel && !channel.archived && !channel.cached && !channel.metadataCached && !channel.metadataPending && channel.members?.includes(connection.session.viewer);
    const [state,setState] = React.useState({loading:true}), [refresh,setRefresh] = React.useState(0), [selected,select] = React.useState(''), [chat,setChat] = React.useState(false),[executionChannel,setExecutionChannel]=React.useState(''),[requestDraft,setRequestDraft]=React.useState(null);
    const savingCheck=React.useRef(false),soloCreating=React.useRef(false);
    const [soloBusy,setSoloBusy]=React.useState(false),[soloMessage,setSoloMessage]=React.useState('');
    const soloLifetime=React.useMemo(()=>new AbortController(),[connection.session,connection.scope,connection.generation]);
    React.useEffect(()=>()=>soloLifetime.abort(),[soloLifetime]);
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
      setRequestDraft({key:crypto.randomUUID(),task:task?{id:task.id,title:task.title,revision:task.revision||0}:null,action});
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
    const newSolo=async taskId=>{
      if(soloCreating.current)return;
      const target=state.data?.tasks.find(t=>t.id===taskId&&!t.removed);if(!target)return;
      soloCreating.current=true;setSoloBusy(true);setSoloMessage('正在建立任务Solo…');
      try{
        const result=await createTaskSolo({session:connection.session,check:()=>{soloLifetime.signal.throwIfAborted();check(connection);},read:()=>read(connection),taskId,expectedRevision:target.revision||0,signal:soloLifetime.signal});
        soloLifetime.signal.throwIfAborted();check(connection);owner.update(result.data);
        if(owner.selected===taskId){
          setExecutionChannel(result.channelId);setChat(true);
          if(!result.reused){const task=result.data.tasks.find(t=>t.id===taskId);setRequestDraft({key:crypto.randomUUID(),task:{id:task.id,title:task.title,revision:task.revision||0},action:'discuss'});}else setRequestDraft(current=>current?.task?.id===taskId?current:null);
        }
        setSoloMessage(result.reused?'已打开任务原Solo':'Solo已建立；在原生输入框选择Agent并确认发送');
      }catch(e){if(!soloLifetime.signal.aborted){setSoloMessage(e.message||'Solo创建未确认，请检查原会话');setRefresh(n=>n+1);}}
      finally{soloCreating.current=false;if(!soloLifetime.signal.aborted)setSoloBusy(false);}
    };
    const taskContext=allowed&&!state.error?state.data?.tasks.find(task=>task.id===selected&&!task.removed):undefined;
    React.useEffect(()=>{if(taskContext?.executionChannel)setExecutionChannel(taskContext.executionChannel);},[taskContext?.id,taskContext?.executionChannel]);
    return h(TaskView,{state:safeState,company,onCheck:canWrite?toggleCheck:undefined,onRequest:request,onRemove:canWrite?ids=>saveHuman(ids,'remove'):undefined,onRestore:canWrite?ids=>saveHuman(ids,'restore'):undefined,canAccept:channel?.creator===connection.session.viewer,selected:allowed&&!state.error?selected:'',onSelect:select,reload:()=>setRefresh(n=>n+1),assistantOpen:chat,onAssistant:panel?undefined:desired=>setChat(value=>typeof desired==='boolean'?desired:!value),assistant:chat?h(Assistant,{connection,task:taskContext,visible:true,onChannel,selected:executionChannel,select:setExecutionChannel,requestDraft,setRequestDraft,onNewSolo:canWrite&&connection.session.channelWrites?.available?newSolo:undefined,soloBusy,soloMessage}):null});
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
    icon: OPCB_TASK_PLUGIN_ICON,
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
      if(!owner||owner.channel!==context.channel){
        const result=await recordAgentFlow({ctx:{agents:ctx.agents,relay:ctx.relay},client,context,args:{action:'read',...(args.task_id?{task_id:args.task_id}:{})}});
        const matches=result.tasks.filter(t=>!t.removed&&t.executionSolo?.phase==='ready'&&t.executionSolo.solo_id===context.channel&&t.executionSolo.actor===client.owner);
        if(matches.length!==1)throw Error('请从任务中心关联会话或提供任务ID');
        if(args.action==='focus')throw Error('请打开任务中心后再定位');
        return JSON.stringify({source,baselineRevision:result.baselineRevision,task:matches[0]});
      }
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
