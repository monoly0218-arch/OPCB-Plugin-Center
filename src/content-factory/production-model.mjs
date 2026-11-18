import {ensurePrompts,currentPrompt,savePrompt,promptKinds} from './prompt-modules.mjs';
export const PRODUCTION_MARKER='opcb-factory-production';
export const STATUS={draft:{text:'未开始',color:'neutral'},queued:{text:'等待执行',color:'blue'},running:{text:'正在执行',color:'blue'},review:{text:'待验收',color:'blue'},accepted:{text:'验收通过',color:'green'},failed:{text:'生成失败',color:'red'}};
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
 if(doc.prompts)for(const kind of promptKinds){
  const group=doc.prompts[kind];
  if(!group||!Array.isArray(group.versions)||!group.versions.length||group.versions.length>100||new Set(group.versions.map(p=>p.id)).size!==group.versions.length||!group.versions.some(p=>p.id===group.current)||group.versions.some((p,i)=>!id(p.id)||p.number!==i+1||!text(p.text,16000)||!Number.isSafeInteger(p.createdAt)))throw Error('提示词历史无效');
 }
 if(doc.referenceVideo){attachment(doc.referenceVideo);if(!doc.referenceVideo.type.startsWith('video/'))throw Error('参考视频类型无效');}
 const ids=new Set();
 doc.versions.forEach((v,i)=>{
  if(!id(v.id)||ids.has(v.id)||v.number!==i+1||!STATUS[v.status]||!Number.isSafeInteger(v.createdAt)||!text(v.prompt,16000)||!text(v.plan,16000)||!text(v.reason||'',3000)||!Array.isArray(v.materials)||v.materials.length>40)throw Error('制作版本信息不完整');
  ids.add(v.id);
  for(const m of v.materials){if(!['reference','product','person','other'].includes(m.kind))throw Error('物料类型无效');attachment(m);}
  if(v.notes!==undefined&&!text(v.notes,3000))throw Error('备注最多3000字');
  if(v.derivedPrompt!==undefined&&!text(v.derivedPrompt,16000))throw Error('模板提示词过长');
  if(v.workflowPrompt!==undefined&&!text(v.workflowPrompt,16000))throw Error('工作流提示词过长');
  if(v.revisedPrompt!==undefined&&!text(v.revisedPrompt,16000))throw Error('更新提示词过长');
  if(v.dispatch&&(!id(v.dispatch.id)||!/^[a-f0-9]{64}$/.test(v.dispatch.executor)||!['prepared','submitted'].includes(v.dispatch.state)||(v.dispatch.messageId&&!/^[a-f0-9]{64}$/.test(v.dispatch.messageId))))throw Error('执行指令回执无效');
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
 const doc={schema:1,kind:'opcb.factory.production',owner,cardId:card.id,title:card.title.slice(0,240),revision:0,currentVersion:v.id,versions:[v]};ensurePrompts(doc,now);return doc;
}
export function changeProduction(document,action,args,actor,{now=Date.now()}={}){
 validateProduction(document);
 if(args.expected_revision!==document.revision)throw Error('制作资料已有更新，请刷新后重试；未覆盖其他修改');
 const doc=structuredClone(document),version=doc.versions.find(v=>v.id===args.version_id);
 if(!version)throw Error('请选择准确制作版本');
 if(actor.owner!==doc.owner)throw Error('当前身份不可修改这份制作资料');
 const human=actor.pubkey===doc.owner;
 const editable=()=>{if(version.status!=='draft'||version.sealed)throw Error('此版本输入已封存，请新建版本修改');};
 if(action==='initialize_prompts'){
  if(!human)throw Error('请由本人初始化提示词');ensurePrompts(doc,now);
  if(!doc.referenceVideo){const video=version.materials.find(m=>m.kind==='reference'&&m.type.startsWith('video/'));if(video)doc.referenceVideo=attachment(video);}
 }else if(action==='save_prompt'){
  if(!human||doc.versions.some(v=>['queued','running'].includes(v.status)))throw Error('执行中的提示词已封存，请等待本轮结果');
  savePrompt(doc,args.prompt_kind,args.prompt,args.prompt_version,now);
 }else if(action==='reference_video'){
  if(!human||doc.versions.some(v=>['queued','running'].includes(v.status)))throw Error('执行中不能替换参考视频');
  const file=attachment(args.file);if(!file.type.startsWith('video/'))throw Error('请选择参考视频');
  doc.referenceVideo=file;
  if(version.status==='draft'&&!version.sealed)version.materials=[...version.materials.filter(m=>!(m.kind==='reference'&&m.type.startsWith('video/'))),{...file,kind:'reference'}];
 }else if(action==='edit'){
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
 }else if(action==='prepare_execution'){
  if(!human||version.id!==doc.currentVersion||['queued','running'].includes(version.status))throw Error('当前版本正在排队或执行，请先处理本轮结果');
  if(!text(args.prompt,16000)||!(args.prompt.trim()||args.workflowPrompt?.trim())||!/^[a-f0-9]{64}$/.test(args.executor)||!Array.isArray(args.materials)||args.materials.length>40)throw Error('请填写提示词并选择执行Agent与有效物料');
  let target=version;
  if(version.sealed||version.status!=='draft'){
   version.sealed=true;
   target={id:crypto.randomUUID(),number:doc.versions.length+1,createdAt:now,status:'draft',prompt:'',plan:'',materials:[],result:null,reason:''};
   doc.versions.push(target);doc.currentVersion=target.id;
  }
  if(args.notes!==undefined&&!text(args.notes,3000))throw Error('备注最多3000字');
  target.notes=(args.notes || '').trim();
  target.prompt=args.prompt.trim();
  if(args.workflowPrompt!==undefined){
   const workflow=currentPrompt(doc,'workflow'),template=currentPrompt(doc,'template');
   if(args.workflowPrompt!==workflow.text||args.prompt!==template.text)throw Error('提示词已有更新，请刷新后执行');
   if(!doc.referenceVideo)throw Error('请先同步或上传参考视频');
   target.workflowPrompt=workflow.text;target.workflowVersion=workflow.id;target.templateVersion=template.id;
   if(!args.materials.some(m=>m.kind==='reference'&&m.sha256===doc.referenceVideo.sha256))throw Error('执行物料缺少本模板参考视频');
  }
  target.plan='按本版提示词和已选物料执行，保留实际生成回执、成片及更新后的提示词，交付本人验收。';
  target.materials=args.materials.map(m=>({...attachment(m),kind:m.kind,...(m.libraryId?{libraryId:m.libraryId,libraryName:m.libraryName}: {})}));
  target.status='queued';target.sealed=true;
  target.dispatch={id:crypto.randomUUID(),executor:args.executor,state:'prepared',messageId:''};
 }else if(action==='dispatch_receipt'){
  if(!human||!version.dispatch||version.dispatch.id!==args.dispatch_id||!/^[a-f0-9]{64}$/.test(args.message_id))throw Error('执行指令回执不匹配');
  if(version.dispatch.messageId&&version.dispatch.messageId!==args.message_id)throw Error('已有执行指令，不重复发送');
  version.dispatch={...version.dispatch,state:'submitted',messageId:args.message_id};
 }else if(action==='update_template_prompt'){
  if(human||version.id!==doc.currentVersion||!['queued','running'].includes(version.status)||!version.dispatch||version.dispatch.executor!==actor.pubkey||version.dispatch.messageId!==args.request_id||!args.evidence_id||!text(args.prompt,16000)||!args.prompt.trim())throw Error('反推模板提示词需本轮执行Agent的真实回执');
  const group=ensurePrompts(doc,now).template;
  const next=savePrompt(doc,'template',args.prompt,group.current,now,{productionVersion:version.id,evidenceId:args.evidence_id});
  version.derivedPrompt=next.text;version.derivedTemplateVersion=next.id;
 }else if(action==='update_prompt'){
  if(human||!['review','accepted','failed'].includes(version.status)||!text(args.prompt,16000)||!args.prompt.trim()||!args.evidence_id||!args.request_id)throw Error('完成后更新提示词需对应版本的真实Agent回执');
  if(version.dispatch&&(version.dispatch.executor!==actor.pubkey||version.dispatch.messageId!==args.request_id))throw Error('执行Agent或本人指令与当前版本不一致');
  version.revisedPrompt=args.prompt.trim();version.promptEvidenceId=args.evidence_id;
  const group=ensurePrompts(doc,now).template,selected=group.current;savePrompt(doc,'template',version.revisedPrompt,selected,now,{productionVersion:version.id,evidenceId:args.evidence_id});if(version.id!==doc.currentVersion)group.current=selected;
 }else if(action==='new_version'){
  if(!human||version.id!==doc.currentVersion)throw Error('请从当前版本创建新版本');
  version.sealed=true;
  const next={...structuredClone(version),sealed:false,id:crypto.randomUUID(),number:doc.versions.length+1,createdAt:now,status:'draft',result:null,reason:''};
  if(next.revisedPrompt)next.prompt=next.revisedPrompt;
  delete next.derivedPrompt;delete next.derivedTemplateVersion;delete next.dispatch;delete next.revisedPrompt;delete next.promptEvidenceId;
  delete next.acceptedBy;delete next.acceptedAt;delete next.evidenceId;delete next.requestId;
  doc.versions.push(next);doc.currentVersion=next.id;
 }else if(action==='accept'){
  if(!human||version.status!=='review'||!version.result)throw Error('仅本人可验收此待验收版本');
  version.status='accepted';version.acceptedBy=actor.pubkey;version.acceptedAt=now;
 }else if(action==='human_fail'){
  if(!human||!['draft','queued','running','review'].includes(version.status)||version.status==='draft'&&version.sealed||!text(args.reason,3000)||!args.reason.trim())throw Error('请由本人填写失败原因');
  version.status='failed';version.sealed=true;version.reason=args.reason.trim();version.failureBy=actor.pubkey;
 }else if(['start','fail','deliver'].includes(action)){
  if(version.dispatch&&(version.dispatch.executor!==actor.pubkey||version.dispatch.messageId&&version.dispatch.messageId!==args.request_id))throw Error('执行Agent或本人指令与当前版本不一致');
  if(version.status==='accepted'||!args.request_id)throw Error('已验收版本已封存，或缺少本人执行指令');
  if(action==='start'){
   if(version.id!==doc.currentVersion||!['draft','queued'].includes(version.status)||version.status==='draft'&&version.sealed||!(version.prompt.trim()||version.workflowPrompt?.trim())||!version.plan.trim())throw Error('开始前须保存提示词与执行规划');
   version.status='running';version.sealed=true;
   if(version.dispatch)version.dispatch={...version.dispatch,state:'submitted',messageId:args.request_id};
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
