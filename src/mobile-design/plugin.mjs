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
 function Plan(){return h('div',{style:{...inset,overflow:'auto',flex:1}},h('h2',null,'页面对应关系'),h('div',{style:{display:'grid',gap:16,marginTop:20}},...MAPPINGS.map(m=>h('section',{key:m.reference,className:'ui-card',style:{padding:20,display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}},h('strong',{style:{fontSize:21}},m.reference),h('span',{style:muted},'→'),h('strong',{style:{fontSize:21}},m.target)))),h('h2',{style:{marginTop:32}},'当前成果'),h('p',{style:{fontSize:19}},'手机机身效果、完整流程、原稿对比与独立作者参考。'),h('p',{style:muted},'对应关系已确定；具体视觉修订、真实生成和注册接入按后续交付核验。'))}
 function Content({connection,binding,allowed,open,close,isOpen}){
  const [mode,setMode]=R.useState('成果'),[notice,setNotice]=R.useState(''),[localHtml,setLocalHtml]=R.useState('');const input=R.useRef(null);
  const key=binding?`${binding.channel}:${binding.revision}`:'';const navigation=R.useRef({open,close,isOpen});navigation.current={open,close,isOpen};
  R.useEffect(()=>{setLocalHtml('');setNotice('');},[key]);
  R.useEffect(()=>{const nav=navigation.current;if(!binding||!allowed||!nav.open)return;const target={channelId:binding.channel};if(!nav.isOpen?.(target)&&nav.open(target)===false)setNotice('宿主未能打开执行会话，请核对成员权限');return()=>nav.close?.(target);},[connection.session,connection.scope,connection.generation,key,allowed]);
  async function importFile(file){if(!file)return;try{check(connection);if(!/\.html?$/i.test(file.name)||file.size<=0||file.size>50*1024*1024)throw Error('请选择不超过50MB的HTML');const html=await file.text();check(connection);setLocalHtml(html);setMode('成果');}catch(error){setNotice(error.message);}}
  return h('section',{style:{height:'100%',minHeight:0,display:'flex',flexDirection:'column',minWidth:0}},h('div',{style:{...row,...inset,borderBottom:'1px solid var(--border-standard)'}},...['计划','成果'].map(m=>button(m,()=>setMode(m),{'aria-pressed':mode===m,key:m})),h('span',{style:{...muted,marginLeft:'auto'}},binding?.label||'尚未绑定执行会话'),button('导入HTML',()=>input.current?.click(),{disabled:!allowed}),binding&&open&&button('打开执行会话',()=>open({channelId:binding.channel}))),h('input',{type:'file',accept:'.html,.htm,text/html',hidden:true,ref:input,onChange:e=>{void importFile(e.target.files?.[0]);e.target.value='';}}),notice&&h('p',{role:'status',style:inset},notice),mode==='计划'?h(Plan):h(Preview,{connection,binding,allowed,localHtml}));
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
