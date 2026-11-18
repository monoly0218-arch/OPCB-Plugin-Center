import {STATUS,versionDifferences} from './production-model.mjs';
import {productionAccess} from './production-store.mjs';
import {exportProduction} from './production-export.mjs';
export function createProductionPanel(ctx,store,onChannel){
 const R=ctx.react,h=R.createElement,Context=R.createContext(null),drafts=new Map();
 ctx.effect(()=>()=>drafts.clear());
 function ProductionContext(props){const data=R.useContext(Context);return data?h('button',{type:'button',disabled:props.disabled,onClick:()=>{if(props.insertText('\n'+data+'\n'))props.focus();}},'制作版本'):null;}
 ctx.conversation.registerTool({id:'factory-production-context',title:'制作版本',component:ProductionContext});
 function Inputs({doc,version,record,connection,busy,run}){
  const draftKey=`${connection.scope}:${connection.session.viewer}:${doc.cardId}:${version.id}`;
  const [draft,setDraft]=R.useState(()=>drafts.get(draftKey)||{prompt:version.prompt,plan:version.plan,revision:doc.revision}),[kind,setKind]=R.useState('reference'),[failure,setFailure]=R.useState(''),[pack,setPack]=R.useState(null);
  const changed=draft.prompt!==version.prompt||draft.plan!==version.plan;
  R.useEffect(()=>{if(!drafts.has(draftKey))setDraft({prompt:version.prompt,plan:version.plan,revision:doc.revision});},[version.prompt,version.plan]);
  const edit=(field,value)=>{const next={...draft,[field]:value,revision:drafts.has(draftKey)?draft.revision:doc.revision};drafts.set(draftKey,next);setDraft(next);};
  const mutate=(action,extra={})=>store.mutate(doc.cardId,action,{expected_revision:doc.revision,version_id:version.id,...extra});
  const readonly=version.status!=='draft'||version.sealed;
  const upload=type=>async e=>{const files=[...(e.target.files||[])];e.target.value='';if(files.length!==1)return;run(()=>store.upload(doc.cardId,version.id,type,files[0]));};
  const download=async()=>{
   const controller=new AbortController(),c=connection;
   const check=()=>{const now=ctx.relay.snapshot();controller.signal.throwIfAborted();if(now.session!==c.session||now.scope!==c.scope||now.generation!==c.generation||!productionAccess(now,record.channel))throw Error('身份或执行Solo权限已变化，已停止打包');};
   const output=await exportProduction({doc,version,session:c.session,channel:record.channel,check,signal:controller.signal});check();setPack(output);
  };
  const media=file=>connection.session.media(file.url);
  return h('div',{className:'fp-inputs'},
   h('div',{className:'fp-version-heading'},h('strong',null,`制作 ${version.number}.0`),h('span',{'data-state':version.status,className:'fp-status'},STATUS[version.status].text),h('time',null,new Date(version.createdAt).toLocaleString('zh-CN'))),
   readonly&&h('p',{className:'fp-muted'},'此版物料已封存，新建下一版后修改'),
   h('form',{onSubmit:e=>{e.preventDefault();run(async()=>{const saved=await mutate('edit',{...draft,expected_revision:draft.revision});drafts.delete(draftKey);setDraft({prompt:saved.doc.versions.find(v=>v.id===version.id).prompt,plan:saved.doc.versions.find(v=>v.id===version.id).plan,revision:saved.doc.revision});});}},
    h('label',null,'执行规划',h('textarea',{'aria-label':'执行规划',rows:3,value:readonly?version.plan:draft.plan,readOnly:readonly,maxLength:16000,onChange:e=>edit('plan',e.target.value),placeholder:'本版目标、步骤与验收要求'})),
    h('label',null,'提示词',h('textarea',{'aria-label':'本版提示词',rows:4,value:readonly?version.prompt:draft.prompt,readOnly:readonly,maxLength:16000,onChange:e=>edit('prompt',e.target.value),placeholder:'保存本版实际使用的完整提示词'})),
    !readonly&&h('button',{type:'submit',disabled:busy||!changed},'保存规划与提示词')),
   h('div',{className:'fp-material-tools'},h('strong',null,`本版物料 · ${version.materials.length}`),!readonly&&h(R.Fragment,null,h('select',{'aria-label':'物料类型',value:kind,onChange:e=>setKind(e.target.value)},...Object.entries({reference:'参考图片',product:'产品图',person:'人物图',other:'其他物料'}).map(([value,label])=>h('option',{key:value,value},label))),h('label',{className:'fp-upload'},'上传物料',h('input',{type:'file','aria-label':'上传本版物料',disabled:busy||changed,onChange:upload(kind)})))),
   version.materials.length?h('ul',{className:'fp-materials'},...version.materials.map((m,i)=>h('li',{key:m.kind+':'+m.sha256},m.type.startsWith('image/')&&h('img',{src:connection.session.media(m.url,'small'),alt:'',loading:'lazy'}),h('a',{href:media(m),download:m.name},m.name),h('span',null,({reference:'参考图',product:'产品图',person:'人物图',other:'其他'})[m.kind]),!readonly&&h('button',{type:'button',disabled:busy||changed,'aria-label':'移除本版物料：'+m.name,onClick:()=>run(()=>mutate('remove_material',{sha256:m.sha256,kind:m.kind}))},'移除')))):h('p',{className:'fp-muted'},'本版还没有上传物料'),
   version.result?h('div',{className:'fp-result'},h('strong',null,'本版成片'),h('a',{href:media(version.result),download:version.result.name},version.result.name),version.result.type.startsWith('video/')&&h('video',{src:media(version.result),controls:true,preload:'metadata',style:{width:'100%',maxHeight:220,borderRadius:12}})):h('label',{className:'fp-upload'},'上传本版成片',h('input',{type:'file',accept:'video/*,image/*','aria-label':'上传本版成片',disabled:busy||changed||!['draft','running'].includes(version.status)||version.status==='draft'&&version.sealed,onChange:upload('result')})),
   version.reason&&h('p',{className:'fp-failure',role:'status'},version.reason),
   h('div',{className:'fp-actions'},doc.currentVersion===version.id&&h('button',{type:'button',disabled:busy||changed,onClick:()=>run(()=>mutate('new_version'))},'新建下一版'),version.status==='review'&&h('button',{type:'button',className:'fp-accept',disabled:busy,onClick:()=>run(()=>mutate('accept'))},`验收通过 ${version.number}.0`),version.status==='accepted'&&h('button',{type:'button',disabled:busy,onClick:()=>run(download)},'打包提示词工程')),
   ['draft','running','review'].includes(version.status)&&!(version.status==='draft'&&version.sealed)&&h('details',null,h('summary',null,'记录生成问题'),h('textarea',{'aria-label':'生成失败原因',rows:2,value:failure,maxLength:3000,onChange:e=>setFailure(e.target.value),placeholder:'本版实际出现的问题'}),h('button',{type:'button',disabled:busy||!failure.trim(),onClick:()=>run(()=>mutate('human_fail',{reason:failure}))},'标记生成失败')),
   pack&&h('a',{className:'fp-package',href:media(pack),download:pack.name},'下载已验收版本的完整工程包'),
   h('p',{className:'fp-muted'},'上传物料按版本保留；单文件最多64MB。Higgsfield号池待接入。'));
 }
 return function ProductionPanel({connection,card,onBack}){
  const snapshot=R.useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot),record=snapshot.records[card.id],doc=record?.doc;
  const [selected,setSelected]=R.useState(''),[compare,setCompare]=R.useState(''),[notice,setNotice]=R.useState(''),[busy,setBusy]=R.useState(false);
  const current=doc?.versions.find(v=>v.id===selected)||doc?.versions.find(v=>v.id===doc.currentVersion),previous=doc?.versions.find(v=>v.id===compare);
  R.useEffect(()=>{onChannel(record?.channel||'');return()=>onChannel('');},[record?.channel]);
  R.useEffect(()=>{setSelected(doc?.currentVersion||'');},[doc?.currentVersion]);
  const run=async fn=>{if(busy||snapshot.pending)return;setBusy(true);setNotice('');try{await fn();}catch(e){setNotice(e.message||'操作尚未完成');}finally{setBusy(false);}};
  const Workspace=ctx.conversation.ui?.Workspace;
  const context=doc&&current?`内容工厂：${doc.title}\n素材ID：${doc.cardId}\nproduction_version: ${current.id}\n制作版本：${current.number}.0\nrevision: ${doc.revision}\n先读取opcb_factory_execution；按本人明确要求执行，失败和成片均回写此版本，不代替本人验收。`:'';
  return h('aside',{className:'fp-plan','aria-label':'素材执行规划'},
   h('header',{className:'fp-heading'},h('div',null,onBack&&h('button',{type:'button','aria-label':'返回制作列表',onClick:onBack},'返回列表'),h('span',null,'执行规划'),h('h2',null,card.title)),h('button',{type:'button',disabled:busy||snapshot.pending,onClick:()=>run(()=>store.refresh())},'刷新状态')),
   (notice||snapshot.error)&&h('p',{role:'alert',className:'fp-notice'},notice||snapshot.error),
   snapshot.unfiled?.filter(item=>item.cardId===card.id).map(item=>h('div',{key:item.file.url,className:'fp-notice'},'待归档：'+item.file.name,h('button',{type:'button',disabled:busy||snapshot.pending,onClick:()=>run(()=>store.recoverUpload(item))},'重新归档此文件'))),
   !doc?h('div',{className:'fp-empty'},h('p',null,snapshot.pending?'正在建立专属Solo…':'点击左侧条目，建立或接续专属执行Solo'),h('p',null,'只建立会话，不发送指令或自动开始生成')):h(R.Fragment,null,
    h('section',{className:'fp-version-area'},h('nav',{'aria-label':'制作版本',className:'fp-version-tabs'},...doc.versions.map(v=>h('button',{type:'button',key:v.id,'aria-pressed':current.id===v.id,'data-state':v.status,onClick:()=>{setSelected(v.id);setCompare('');}},`${v.number}.0 · ${STATUS[v.status].text}`))),
     h('details',{open:true},h('summary',null,'规划、提示词与物料'),h(Inputs,{key:current.id,doc,version:current,record,connection,busy:busy||snapshot.pending,run})),
     doc.versions.length>1&&h('div',{className:'fp-compare'},h('select',{'aria-label':'选择对比版本',value:compare,onChange:e=>setCompare(e.target.value)},h('option',{value:''},'对比其他版本'),...doc.versions.filter(v=>v.id!==current.id).map(v=>h('option',{key:v.id,value:v.id},`${v.number}.0`))),previous&&h(R.Fragment,null,h('p',null,(()=>{const d=versionDifferences(previous,current);return `提示词${d.promptChanged?'已变更':'一致'} · 规划${d.planChanged?'已变更':'一致'} · 新增物料 ${d.added.length} · 减少 ${d.removed.length}`;})()),h('div',{className:'fp-prompt-diff'},h('pre',null,`${previous.number}.0\n${previous.prompt}`),h('pre',null,`${current.number}.0\n${current.prompt}`))))),
    h(Context.Provider,{value:context},h('div',{className:'fp-conversation'},Workspace?h(Workspace,{id:'opcb.content-factory.production:'+record.channel,session:connection.session,scope:connection.scope,target:{channelId:record.channel},label:doc.title+' · 执行规划'}):h('p',null,'完整原生会话暂不可用，请启用Channels')))));
 };
}
