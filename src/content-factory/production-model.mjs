export const PRODUCTION_MARKER='opcb-factory-production';
export const STATUS={draft:{text:'未开始',color:'neutral'},running:{text:'正在执行',color:'blue'},review:{text:'待验收',color:'blue'},accepted:{text:'验收通过',color:'green'},failed:{text:'生成失败',color:'red'}};
const id=v=>typeof v==='string'&&v.length>0&&v.length<=240;
const text=(v,n)=>typeof v==='string'&&v.length<=n;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function attachment(value){
 if(!value||!text(value.name,240)||!value.name||!text(value.type,150)||!Number.isSafeInteger(value.size)||value.size<1||value.size>64*1024*1024||!digest(value.sha256))throw Error('文件信息不完整');
 let url;try{url=new URL(value.url);}catch{throw Error('文件地址无效');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('只保留原生上传后的稳定文件地址');
 return {name:value.name,url:url.href,type:value.type,size:value.size,sha256:value.sha256};
}
export function validateProduction(doc){
 if(!doc||doc.schema!==1||doc.kind!=='opcb.factory.production'||!id(doc.owner)||!id(doc.cardId)||!text(doc.title,240)||!Number.isSafeInteger(doc.revision)||doc.revision<0||!Array.isArray(doc.versions)||!doc.versions.length||doc.versions.length>100)throw Error('制作版本记录无效');
 const ids=new Set();
 doc.versions.forEach((v,i)=>{
  if(!id(v.id)||ids.has(v.id)||v.number!==i+1||!STATUS[v.status]||!Number.isSafeInteger(v.createdAt)||!text(v.prompt,16000)||!text(v.plan,16000)||!text(v.reason||'',3000)||!Array.isArray(v.materials)||v.materials.length>40)throw Error('制作版本信息不完整');
  ids.add(v.id);
  for(const m of v.materials){if(!['reference','product','person','other'].includes(m.kind))throw Error('物料类型无效');attachment(m);}
  if(v.result){attachment(v.result);if(!/^(video|image)\//.test(v.result.type))throw Error('成片须为视频或结果图片');}
  if(['review','accepted'].includes(v.status)&&!v.result)throw Error('待验收版本必须保留真实成片');
  if(v.status==='accepted'&&(!v.acceptedBy||!v.acceptedAt))throw Error('验收记录缺失');
 });
 if(!ids.has(doc.currentVersion)||new TextEncoder().encode(JSON.stringify(doc)).length>220000)throw Error('制作记录超出容量或当前版本无效');
 return doc;
}
const fence=/```opcb-factory-production\n([\s\S]*?)\n```/g;
export function readProduction(event){
 const content=event?.content||'',matches=[...content.matchAll(fence)];
 if(!matches.length){if(content.includes('```'+PRODUCTION_MARKER))throw Error('制作资料标记损坏');return null;}
 if(matches.length!==1)throw Error('同一会话存在重复制作资料，请核对');
 let value;try{value=JSON.parse(matches[0][1]);}catch{throw Error('制作资料不是有效JSON');}
 return validateProduction(value);
}
export function productionContent(original,doc){
 validateProduction(doc);const block='```'+PRODUCTION_MARKER+'\n'+JSON.stringify(doc)+'\n```';
 return [...String(original||'').matchAll(fence)].length?String(original).replace(fence,()=>block):String(original||'').trimEnd()+'\n\n'+block;
}
export function newProduction(card,owner,now=Date.now()){
 const v={id:crypto.randomUUID(),number:1,createdAt:now,status:'draft',prompt:'',plan:'',materials:[],result:null,reason:''};
 return {schema:1,kind:'opcb.factory.production',owner,cardId:card.id,title:card.title.slice(0,240),revision:0,currentVersion:v.id,versions:[v]};
}
export function changeProduction(document,action,args,actor,{now=Date.now()}={}){
 validateProduction(document);
 if(args.expected_revision!==document.revision)throw Error('制作资料已有更新，请刷新后重试；未覆盖其他修改');
 const doc=structuredClone(document),version=doc.versions.find(v=>v.id===args.version_id);
 if(!version)throw Error('请选择准确制作版本');
 if(actor.owner!==doc.owner)throw Error('当前身份不可修改这份制作资料');
 const human=actor.pubkey===doc.owner;
 const editable=()=>{if(version.status!=='draft'||version.sealed)throw Error('此版本输入已封存，请新建版本修改');};
 if(action==='edit'){
  editable();if(!text(args.prompt,16000)||!text(args.plan,16000))throw Error('提示词和规划各最多16000字');
  version.prompt=args.prompt;version.plan=args.plan;
 }else if(action==='material'){
  editable();if(!['reference','product','person','other'].includes(args.kind))throw Error('请选择物料类型');
  const file=attachment(args.file);
  if(!version.materials.some(m=>m.sha256===file.sha256&&m.kind===args.kind))version.materials.push({...file,kind:args.kind});
 }else if(action==='remove_material'){
  editable();if(!human)throw Error('请由本人移除本版物料');
  version.materials=version.materials.filter(m=>m.sha256!==args.sha256||m.kind!==args.kind);
 }else if(action==='result'){
  if(!human||!['draft','running'].includes(version.status)||version.status==='draft'&&version.sealed||version.result)throw Error('此版本成片已封存，请新建版本');
  version.result=attachment(args.file);version.status='review';version.sealed=true;version.reason='';
 }else if(action==='new_version'){
  if(!human||version.id!==doc.currentVersion)throw Error('请从当前版本创建新版本');
  version.sealed=true;
  const next={...structuredClone(version),sealed:false,id:crypto.randomUUID(),number:doc.versions.length+1,createdAt:now,status:'draft',result:null,reason:''};
  delete next.acceptedBy;delete next.acceptedAt;delete next.evidenceId;delete next.requestId;
  doc.versions.push(next);doc.currentVersion=next.id;
 }else if(action==='accept'){
  if(!human||version.status!=='review'||!version.result)throw Error('仅本人可验收此待验收版本');
  version.status='accepted';version.acceptedBy=actor.pubkey;version.acceptedAt=now;
 }else if(action==='human_fail'){
  if(!human||!['draft','running','review'].includes(version.status)||version.status==='draft'&&version.sealed||!text(args.reason,3000)||!args.reason.trim())throw Error('请由本人填写失败原因');
  version.status='failed';version.sealed=true;version.reason=args.reason.trim();version.failureBy=actor.pubkey;
 }else if(['start','fail','deliver'].includes(action)){
  if(version.status==='accepted'||!args.request_id)throw Error('已验收版本已封存，或缺少本人执行指令');
  if(action==='start'){
   if(version.id!==doc.currentVersion||version.sealed||version.status!=='draft'||!version.prompt.trim()||!version.plan.trim())throw Error('开始前须保存提示词与执行规划');
   version.status='running';version.sealed=true;
  }else if(action==='fail'){
   if(version.status!=='running')throw Error('仅执行中版本可记录生成失败');
   if(!text(args.reason,3000)||!args.reason.trim()||!args.evidence_id)throw Error('失败须保留原因及真实执行回执');
   version.status='failed';version.sealed=true;version.reason=args.reason.trim();version.evidenceId=args.evidence_id;
  }else{
   if(version.status!=='running'||version.result)throw Error('仅执行中版本可提交成片，原交付已封存');
   if(args.file)version.result=attachment(args.file);
   if(!version.result||!args.evidence_id)throw Error('交付须有该版本成片及真实回执');
   version.status='review';version.sealed=true;version.evidenceId=args.evidence_id;
  }
  version.requestId=args.request_id;
 }else throw Error('未知制作操作');
 doc.revision++;return validateProduction(doc);
}
export function versionDifferences(a,b){
 const map=v=>new Map(v.materials.map(m=>[m.kind+':'+m.sha256,m]));const left=map(a),right=map(b);
 return {promptChanged:a.prompt!==b.prompt,planChanged:a.plan!==b.plan,added:[...right].filter(([k])=>!left.has(k)).map(([,m])=>m),removed:[...left].filter(([k])=>!right.has(k)).map(([,m])=>m)};
}
