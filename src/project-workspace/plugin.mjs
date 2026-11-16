import {createWorkspace} from './ui.mjs';
import {readProject} from './model.mjs';
import {saveProject,canRead,canWrite} from './store.mjs';
import {demoBoardData} from './demo.mjs';
import {artifactsFrom} from './artifacts.mjs';
import {createReportPane} from './report.mjs';
export const inject=['react','pages','panels','relay','conversation','navigation'];
export function apply(ctx){
 const R=ctx.react,h=R.createElement,View=createWorkspace(R),ReportPane=createReportPane(R,ctx.pages),prefix='opcb-project-space:';
 function Runtime({connection,channelId='',initialView='board',panelContext}){
  const session=connection.session,roster=R.useSyncExternalStore(session.channels.subscribeList,session.channels.list,session.channels.list),profiles=R.useSyncExternalStore(session.profiles.subscribe,session.profiles.snapshot,session.profiles.snapshot);
  const [records,setRecords]=R.useState([]),[loading,setLoading]=R.useState(true),[error,setError]=R.useState(''),[serial,refresh]=R.useReducer(x=>x+1,0),[demo,setDemo]=R.useState(false),[demoData,setDemoData]=R.useState(()=>demoBoardData().projects),[projectId,setProjectId]=R.useState(channelId),[history,setHistory]=R.useState(null);
  const token=R.useRef(0),saved=R.useRef(new Map());
  const current=()=>ctx.relay.snapshot();
  const belongs=()=>{const c=current();return c.status==='ready'&&!c.cached&&c.session===session&&c.scope===connection.scope&&c.generation===connection.generation;};
  const candidates=roster.channels.filter(c=>canRead(connection,c.id));
  const accessKey=candidates.map(c=>c.id+':'+c.creator+':'+c.members.join(',')+':'+c.readOnly).join('|');
  R.useEffect(()=>{session.channels.ensureList();},[session]);
  R.useEffect(()=>{
   const run=++token.current;let disposed=false;setLoading(true);setError('');
   if(roster.status!=='ready'){setRecords([]);setLoading(false);return;}
   const queue=channelId?candidates.filter(c=>c.id===channelId):[...candidates];const next=[],failures=[];
   const valid=()=>!disposed&&run===token.current&&belongs();
   (async()=>{
    await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length&&valid()){
     const c=queue.shift();try{const event=await session.canvas.read(c.id);if(!valid()||!canRead(current(),c.id))continue;const project=readProject(event,c.id);if(project){next.push(project);saved.current.set(c.id,event?.id||null);}else saved.current.set(c.id,event?.id||null);}catch(e){if(valid())failures.push(c.name+'：'+(e.message||'读取失败'));}
    }}));
    if(valid()){setRecords(next);setLoading(false);setError(failures.length?`${failures.length} 个频道未读取：${failures.slice(0,2).join('；')}`:roster.coverage==='partial'?'频道列表尚未完整，仅汇总当前已列出的项目':'');}
   })();
   return()=>{disposed=true;};
  },[accessKey,roster.status,serial,channelId]);
  R.useEffect(()=>{let timer;const off=session.subscribeLive?.(batch=>{if(batch.events?.some(e=>e.kind===40100)){clearTimeout(timer);timer=setTimeout(refresh,200);}});return()=>{clearTimeout(timer);off?.();};},[session]);
  R.useEffect(()=>{
   setHistory(null);if(demo||!projectId||!canRead(current(),projectId))return;
   const update=()=>{if(belongs()&&canRead(current(),projectId))setHistory(session.channels.window(projectId));else setHistory(null);};
   const off=session.channels.subscribeWindow(projectId,update);session.channels.ensure(projectId);update();return off;
  },[projectId,demo,accessKey]);
  const projects=belongs()?records.filter(p=>canRead(current(),p.id)):[];
  const channel=roster.channels.find(c=>c.id===channelId);
  const allowedPanel=!channelId||canRead(current(),channelId)&&panelContext?.scope===connection.scope&&panelContext?.viewer===session.viewer;
  if(!allowedPanel)return h('p',{role:'status',style:{padding:24}},'当前频道或身份已变化，请重新打开空间');
  const displayName=id=>{const p=profiles.get(id);return p?.displayName||p?.name||id.slice(0,10);};
  const people=[...new Set(candidates.flatMap(c=>c.members))].map(id=>({id,name:displayName(id)}));
  const extracted=history?.channelId===projectId&&history?.status==='ready'&&history.freshness!=='cached'&&canRead(current(),projectId)?artifactsFrom(history.rows,profiles).map(a=>({id:a.id,name:a.name,url:a.url,category:a.category,thumbnail:a.category==='image'?session.media(a.attachment?.previewUrl||a.url,'small'):null,messageId:a.message.id,status:'draft',version:'',stage:''})):[];
  const openChannel=(id,message)=>{if(!canRead(current(),id))throw Error('当前身份不可访问该会话');const url=message?`buzz://message?channel=${encodeURIComponent(id)}&id=${encodeURIComponent(message)}`:`buzz://channel/${encodeURIComponent(id)}`;if(panelContext?.canOpen?.(url))return panelContext.open(url);return ctx.navigation.open({version:1,kind:'conversation',scope:{viewer:session.viewer,communityOrigin:connection.scope.slice(0,-(session.viewer.length+1))},channelId:id,...(message?{messageId:message}:{})});};
  const Conversation=id=>{if(!canRead(current(),id))return h('p',null,'当前身份不可访问执行会话');const Workspace=ctx.conversation.ui?.Workspace;return Workspace?h(Workspace,{id:'opcb-project-execution:'+id,session,scope:connection.scope,target:{channelId:id},label:roster.channels.find(c=>c.id===id)?.name||'执行会话'}):h('p',null,'请启用 Buzz Channels 插件以使用原生执行会话');};
  return h(View,{key:demo?'demo':'live',projects:demo?demoData:projects,channels:demo?demoBoardData().channels.map(c=>({...c,canRegister:!demoData.some(p=>p.id===c.id)})):candidates.map(c=>({...c,canRegister:!projects.some(p=>p.id===c.id)&&canWrite(current(),c.id)})),people:demo?[{id:'demo-a',name:'潘涛'},{id:'demo-b',name:'角色 B'},{id:'demo-c',name:'角色 C'}]:people,loading:demo?false:loading,error:demo?'':error,refresh:()=>refresh(),editable:p=>canWrite(current(),p.id,p),initialView,fixedChannel:demo?'':channelId,initialProject:demo?'demo-commercial':channelId,demo,onDemo:channelId?undefined:()=>{setDemo(d=>!d);setDemoData(demoBoardData().projects);},onProject:setProjectId,
   save:async project=>{if(demo){setDemoData(rows=>[...rows.filter(p=>p.id!==project.id),project]);return;}if(!belongs())throw Error('当前连接已变化');const result=await saveProject({connection,current,project,headId:saved.current.get(project.id)||null});if(!belongs())return;saved.current.set(project.id,result.headId);setRecords(rows=>[...rows.filter(p=>p.id!==project.id),result.project]);},
   artifacts:demo?[]:extracted,artifactLoading:history?.status==='loading'||history?.loadingOlder,artifactMore:!!history?.hasMore,artifactError:history?.error||'',loadMore:demo?undefined:()=>{if(canRead(current(),projectId)){if(history?.hasMore)session.channels.loadOlder(projectId);else session.channels.ensure(projectId);}},openChannel:demo?undefined:openChannel,openArtifact:a=>{if(!belongs()||!canRead(current(),projectId))throw Error('项目权限已变化');if(panelContext?.canOpen?.(a.url))panelContext.open(a.url);else openChannel(projectId,a.messageId||undefined);},conversation:demo?()=>h('p',{style:{padding:24}},'演示会话'):Conversation,
   embeddedReport:()=>demo?h('p',{style:{padding:24}},'演示模式不读取或修改正式报告；返回正式数据后可在频道内展开现有九页报告'):h(ReportPane),openReport:demo?undefined:()=>ctx.navigation.open({version:1,kind:'plugin',pluginId:'opcb.results-report',pageId:'report'})});
 }
 function Page(props={}){
  const c=R.useSyncExternalStore(ctx.relay.subscribe,ctx.relay.snapshot,ctx.relay.snapshot);
  if(c.status!=='ready'||c.cached||!c.session?.viewer)return h('div',{style:{padding:24}},'连接当前社区后查看任务中心-测试版');
  return h(Runtime,{...props,key:`${c.scope}:${c.generation}:${props.channelId||'all'}`,connection:c});
 }
 ctx.pages.register({id:'main',title:'任务中心-测试版',primary:true,placement:'dock',layout:'workspace',icon:OPCB_PROJECT_ICON,component:Page});
 for(const [id,title,view] of [['space','空间','space'],['artifacts','产物','artifacts']])ctx.panels.register({id,title:'频道'+title,channelPlacement:'side',matches:target=>target.startsWith(prefix+id+':'),channelLauncher:({context,pressed,toggle,available})=>h('button',{type:'button',style:{font:'inherit',color:'var(--text-standard,#e6e2e7)',background:'var(--surface-inset,#252326)',border:'1px solid var(--border-standard,#39363b)',borderRadius:12,minHeight:36,padding:'6px 12px'},'aria-pressed':pressed,disabled:!available(),onClick:()=>toggle(prefix+id+':'+context.channelId)},title),component:({target,channelContext,context})=>target===prefix+id+':'+channelContext?.channelId?h(Page,{channelId:channelContext.channelId,initialView:view,panelContext:{...channelContext,canOpen:context?.canOpen,open:context?.open}}):h('p',{style:{padding:24}},'请从当前频道重新打开')});
}
