import {COLLECTION,PREFERENCE,MAPPINGS,canBind,validateBinding,agentContext,bindFromAgent,readAttachment} from './binding.mjs';
import {startPreview,readSource} from '../../plugins/opcb.html-reader/0.1.0-rc.2/source/reader.mjs';
export const inject=['react','pages','conversation','relay','artifactStorage','agents','browser','host'];
export function apply(ctx){
 const R=ctx.react,h=R.createElement,ID='opcb.mobile-design';
 const current=()=>ctx.relay.snapshot();
 const button=(text,onClick,props={})=>h('button',{type:'button',onClick,...props},text);
 const inset={padding:'var(--space-panel-inset, 20px)'},row={display:'flex',alignItems:'center',gap:'var(--space-2, 8px)',flexWrap:'wrap'},muted={color:'var(--text-subtle)',fontSize:18};
 const destination={version:1,kind:'plugin',pluginId:ID,pageId:'design'};
 function check(connection){const now=current();if(now.status!=='ready'||now.cached||!now.session?.viewer||now.session!==connection.session||now.scope!==connection.scope||now.generation!==connection.generation)throw Error('当前身份或社区已变化');}
 function useBinding(connection){
  const [state,setState]=R.useState({loading:true,binding:null,error:''});const collection=R.useRef(null);
  R.useEffect(()=>{let alive=true,ticket=0,off;try{
   const store=ctx.artifactStorage.open(COLLECTION);collection.current=store;
   const load=async()=>{const n=++ticket;try{const binding=validateBinding(await store.preferences.get(PREFERENCE),connection.session.viewer);check(connection);if(alive&&n===ticket)setState({loading:false,binding,error:''});}catch(error){if(alive&&n===ticket)setState({loading:false,binding:null,error:error.message});}};
   off=store.subscribe(()=>void load());void load();
   return()=>{alive=false;ticket++;off?.();collection.current=null;store.close();};
  }catch(error){collection.current?.close();collection.current=null;setState({loading:false,binding:null,error:error.message});return()=>{alive=false;};}},[connection.session,connection.scope,connection.generation]);
  const save=async channel=>{const store=collection.current;if(!store)throw Error('个人设置尚未就绪');check(connection);const c=connection.session.channels.list().channels.find(c=>c.id===channel);if(!canBind(c,connection.session.viewer))throw Error('此会话当前不可执行');const revision=state.binding?.revision||0;
   await store.preferences.update(PREFERENCE,old=>{check(connection);if((old?.revision||0)!==revision)throw Error('绑定已变化，请重新核对');if(old?.channel===channel)return old;return {schema:1,revision:revision+1,owner:connection.session.viewer,channel,label:c.name||'执行会话',source:null};});check(connection);
  };return {...state,save};
 }
 function Preview({connection,binding,allowed,localHtml}){
  const [state,setState]=R.useState({url:'',error:'',loading:false}),[refresh,setRefresh]=R.useState(0);
  const available=ctx.browser.available&&typeof ctx.host.spawn==='function';
  R.useEffect(()=>{setState({url:'',error:'',loading:false});if(!available||!allowed||!localHtml&&!binding?.source)return;const controller=new AbortController();let close;
   const guard=()=>{controller.signal.throwIfAborted();check(connection);const list=connection.session.channels.list(),c=list.channels.find(c=>c.id===binding.channel);if(list.status!=='ready'||!canBind(c,connection.session.viewer))throw Error('来源会话权限已变化');};
   setState({url:'',error:'',loading:true});
   (async()=>{guard();const html=localHtml||(await readSource(await readAttachment(connection,binding,guard),controller.signal)).html;guard();const preview=await startPreview(ctx.host,html,VIEWER_SOURCE,controller.signal);close=preview.close;guard();setState({url:preview.url,error:'',loading:false});preview.exited.then(()=>{if(!controller.signal.aborted)setState({url:'',error:'预览进程已停止',loading:false});});})().catch(error=>{close?.();if(!controller.signal.aborted)setState({url:'',error:error.message,loading:false});});
   return()=>{controller.abort();close?.();};
  },[connection.session,connection.scope,connection.generation,binding,allowed,localHtml,refresh,available]);
  R.useEffect(()=>{if(!binding?.source||typeof connection.session.subscribeLive!=='function')return;return connection.session.subscribeLive(batch=>{const id=binding.source.message;if(batch.events?.some(e=>e.id===id||e.tags?.some(t=>t[0]==='e'&&t[1]===id))){setState({url:'',error:'',loading:true});setRefresh(n=>n+1);}});},[connection.session,binding]);
  if(!available)return h('div',{style:inset},h('h2',null,'当前客户端不支持内嵌预览'),h('p',{style:muted},'本版需要Mac Buzz和Python 3；执行会话仍由宿主控制。'));
  if(state.url)return h('div',{style:{flex:1,minHeight:0,display:'flex',position:'relative'}},h(ctx.browser.View,{url:state.url,label:'OPCB 平台手机版设计计划与成果'}));
  return h('div',{style:inset,'aria-busy':state.loading},h('h2',null,state.loading?'正在打开设计稿':state.error?'未能读取设计稿':'等待关联HTML成果'),h('p',{style:muted},state.error||'原会话中的HTML附件保留原权限，不随公开插件分发。'),state.error&&button('重试',()=>setRefresh(n=>n+1)));
 }
 const skin=`.opcb-md{--md-paper:var(--bg-panel,var(--background-primary,#fefcfb));--md-ink:var(--text-primary,#202022);background:#0d0c0f;color:var(--md-ink);font-family:Nunito,"PingFang SC",sans-serif;padding:12px;gap:12px}.opcb-md .md-toolbar{background:#0d0c0f;color:#f7f5f3;border:0!important;padding:12px 8px!important;gap:12px!important}.opcb-md button{border:0;border-radius:26px;min-height:46px;padding:10px 18px;font:inherit;font-size:18px;font-weight:600;background:#29272c;color:#e5e1e8;cursor:pointer}.opcb-md button[aria-pressed=true]{background:#f7f5f3;color:#19191b}.opcb-md button:focus-visible{outline:3px solid #fa543c;outline-offset:3px}.opcb-md .md-surface{background:var(--md-paper);border-radius:22px;min-height:0;flex:1;overflow:hidden;display:flex;flex-direction:column}.opcb-md .md-plan{padding:32px;overflow:auto;flex:1}.opcb-md h2{font-size:30px;line-height:1.3;margin:0 0 24px;font-weight:800}.opcb-md .md-plan-row{display:flex;align-items:center;gap:20px;border-bottom:1px solid var(--border-standard,#e4e2e0);padding:24px 0}.opcb-md .md-plan-row strong{display:block;font-size:22px;font-weight:700}.opcb-md .md-plan-row p{font-size:20px;margin:10px 0 0;color:var(--text-subtle,#777)}.opcb-md .md-number{font-size:28px;color:var(--text-subtle,#888)}.opcb-md .md-plan-note{margin-top:32px;font-size:20px;line-height:1.6}.opcb-md .md-label{font-size:18px;color:#c1bbc6;margin-left:auto}@media(max-width:700px){.opcb-md{padding:8px}.opcb-md .md-plan{padding:24px}.opcb-md .md-label{display:none}.opcb-md .md-toolbar{flex-wrap:wrap}.opcb-md .md-plan-row{gap:12px}}`;
 const changes=['人物、作品、操作连在一起','对话里确认素材、查看制作状态','人物大图、素材横排、底部执行','作品占主屏，保存发布收在底部','完整画面开场，底部输入邀请码'];
 function Plan(){return h('div',{className:'md-plan'},h('h2',null,'把参考，变成页面'),...MAPPINGS.map((m,i)=>h('section',{key:m.reference,className:'md-plan-row'},h('span',{className:'md-number'},`0${i+1}`),h('div',null,h('strong',null,`${m.reference} → ${m.target}`),h('p',null,changes[i])))),h('div',{className:'md-plan-note'},h('strong',null,'R2 · 参考与改稿逐项对照'),h('p',null,'成果保留完整手机流程，并新增 Agent 对话演示。实际页面以本人关联的 HTML 为准。')))}
 function Content({connection,binding,allowed,open,close,isOpen}){
  const [mode,setMode]=R.useState('成果'),[notice,setNotice]=R.useState(''),[localHtml,setLocalHtml]=R.useState('');const input=R.useRef(null);
  const key=binding?`${binding.channel}:${binding.revision}`:'';const navigation=R.useRef({open,close,isOpen});navigation.current={open,close,isOpen};
  R.useEffect(()=>{setLocalHtml('');setNotice('');},[key]);
  R.useEffect(()=>{const nav=navigation.current;if(!binding||!allowed||!nav.open)return;const target={channelId:binding.channel};if(!nav.isOpen?.(target)&&nav.open(target)===false)setNotice('宿主未能打开执行会话，请核对成员权限');return()=>nav.close?.(target);},[connection.session,connection.scope,connection.generation,key,allowed]);
  async function importFile(file){if(!file)return;try{check(connection);if(!/\.html?$/i.test(file.name)||file.size<=0||file.size>50*1024*1024)throw Error('请选择不超过50MB的HTML');const html=await file.text();check(connection);setLocalHtml(html);setMode('成果');}catch(error){setNotice(error.message);}}
  return h('section',{className:'opcb-md',style:{height:'100%',minHeight:0,display:'flex',flexDirection:'column',minWidth:0}},h('style',null,skin),h('div',{className:'md-toolbar',style:{...row,...inset,borderBottom:'1px solid var(--border-standard)'}},...['计划','成果'].map(m=>button(m,()=>setMode(m),{'aria-pressed':mode===m,key:m})),h('span',{className:'md-label'},binding?.label||'尚未绑定执行会话'),button('导入HTML',()=>input.current?.click(),{disabled:!allowed}),binding&&open&&button('打开执行会话',()=>open({channelId:binding.channel}))),h('input',{type:'file',accept:'.html,.htm,text/html',hidden:true,ref:input,onChange:e=>{void importFile(e.target.files?.[0]);e.target.value='';}}),notice&&h('p',{role:'status',style:inset},notice),h('div',{className:'md-surface'},mode==='计划'?h(Plan):h(Preview,{connection,binding,allowed,localHtml})));
 }
 function Workspace({connection}){
  const binding=useBinding(connection);const roster=R.useSyncExternalStore(connection.session.channels.subscribeList,connection.session.channels.list,connection.session.channels.list);const [selected,setSelected]=R.useState(''),[notice,setNotice]=R.useState('');
  R.useEffect(()=>{connection.session.channels.ensureList();},[connection.session]);
  const allowed=roster.status==='ready'&&binding.binding&&canBind(roster.channels.find(c=>c.id===binding.binding.channel),connection.session.viewer);
  const Tabs=ctx.conversation.ui.Tabs;
  const pane=!binding.loading&&!allowed?h('div',{style:inset},h('h2',null,binding.binding?'执行会话暂不可用':'关联执行会话'),h('p',{style:muted},binding.error||'安装后可在原对话绑定HTML成果；也可由本人选择已有会话。'),h('div',{style:row},h('select',{value:selected,'aria-label':'选择执行会话',onChange:e=>setSelected(e.target.value),style:{minHeight:44,maxWidth:'100%'}},h('option',{value:''},'选择已有会话'),...(roster.status==='ready'?roster.channels.filter(c=>canBind(c,connection.session.viewer)):[]).map(c=>h('option',{key:c.id,value:c.id},c.name||c.id))),button('绑定',()=>{void binding.save(selected).catch(e=>setNotice(e.message));},{disabled:!selected})),notice&&h('p',{role:'alert'},notice),h(Plan)):null;
  if(pane)return pane;
  if(binding.loading)return h('p',{style:inset,role:'status'},'正在读取个人绑定…');
  if(!Tabs)return h('div',{style:inset},h('h2',null,'请启用Buzz的Channels插件'),h('p',{style:muted},'右侧执行会话使用宿主原生聊天，不另造聊天组件。'));
  return h(Tabs,{id:'opcb-mobile-design',session:connection.session,scope:connection.scope,label:'手机设计计划与成果',children:(open,close,isOpen)=>h(Content,{key:`${binding.binding.channel}:${binding.binding.revision}`,connection,binding:binding.binding,allowed,open,close,isOpen})});
 }
 function Page(){const connection=R.useSyncExternalStore(ctx.relay.subscribe,ctx.relay.snapshot,ctx.relay.snapshot);return connection.status==='ready'&&!connection.cached&&connection.session?.viewer?h(Workspace,{key:JSON.stringify([connection.scope,connection.generation]),connection}):h('p',{style:inset},'请连接社区并使用本人身份打开。');}
 ctx.pages.register({id:'design',title:'OPCB 平台手机版设计计划与成果',primary:true,placement:'sidebar',layout:'workspace',component:Page});
 ctx.agents.addTool({name:'opcb_mobile_design_context',description:'读取手机版设计插件在本人当前身份下的执行会话与HTML来源绑定，不读取其他聊天、不发送消息。',inputSchema:{type:'object',properties:{},additionalProperties:false},async call(client,context){const {check}=agentContext(ctx,client,context);const store=ctx.artifactStorage.open(COLLECTION);try{const binding=validateBinding(await store.preferences.get(PREFERENCE),client.owner);check();if(binding&&binding.channel!==context.channel)throw Error('请在已绑定的原执行会话读取');return JSON.stringify({binding,revision:binding?.revision||0,page:destination});}finally{store.close();}}});
 ctx.agents.addTool({name:'opcb_mobile_design_bind',description:'按本人明确原指令，将当前会话和其中的HTML附件关联为手机版设计插件的执行会话与成果。只存个人绑定，不新建聊天、不发消息、不扩大素材权限。',inputSchema:{type:'object',properties:{request_id:{type:'string'},source_message_id:{type:'string'},attachment_url:{type:'string'},label:{type:'string',maxLength:100},expected_revision:{type:'integer',minimum:0}},required:['request_id','source_message_id','expected_revision'],additionalProperties:false},async call(client,context,args){return JSON.stringify(await bindFromAgent(ctx,client,context,args));}});
}
