import {TASK_SOURCE} from './source.mjs';
import {exactFlowMessage} from './lifecycle-agent.mjs';
const BEGIN='<!-- opcb-company-people-v1:begin -->',END='<!-- opcb-company-people-v1:end -->';
const key=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export function companyReports(content){
 const start=content.indexOf(BEGIN);if(start<0)return [];
 const end=content.indexOf(END,start),block=content.slice(start+BEGIN.length,end);
 if(end<0||content.indexOf(BEGIN,start+BEGIN.length)>=0)throw Error('人员同步记录格式冲突');
 const match=block.match(/```json\s*([\s\S]*?)\s*```/);if(!match)throw Error('人员同步记录无法读取');
 const data=JSON.parse(match[1]);if(data.version!==1||!Array.isArray(data.records)||data.records.length>1000)throw Error('人员同步记录版本或数量无效');
 for(const r of data.records){
  if(typeof r.id!=='string'||!r.id||r.id.length>220||!key(r.person)||!key(r.setBy)||!key(r.recordedBy)||!Number.isFinite(r.at)||r.at<0||typeof r.source!=='string'||!/^buzz:\/\/message\?channel=[a-z0-9-]+&id=[a-f0-9]{64}$/.test(r.source)||!r.fields||typeof r.fields!=='object')throw Error('人员同步记录身份或来源无效');
  for(const [field,value]of Object.entries(r.fields))if(!['status','current'].includes(field)||value!==null&&(typeof value!=='string'||!value.trim()||value.length>(field==='status'?80:180)||value.includes(BEGIN)||value.includes(END)))throw Error('人员同步内容无效');
 }
 return data.records;
}
export function appendCompanyReports(content,records){
 const previous=companyReports(content),seen=new Set(previous.map(r=>r.id));
 const all=[...previous,...records.filter(r=>!seen.has(r.id))];
 const block=BEGIN+'\n## 人员状态与当前事情同步\n```json\n'+JSON.stringify({version:1,records:all},null,2)+'\n```\n'+END;
 const start=content.indexOf(BEGIN),next=start<0?content.trimEnd()+'\n\n'+block+'\n':content.slice(0,start)+block+content.slice(content.indexOf(END,start)+END.length);
 if(next.length>256000)throw Error('工作来源超出容量');companyReports(next);return next;
}
export function reportedPerson(identity,records,now=Date.now()/1000){
 if(!identity?.pubkey)return identity;
 const latest={};for(const r of records)if(r.person===identity.pubkey&&r.at<=now+300)for(const [field,value]of Object.entries(r.fields))if(!latest[field]||r.at>=latest[field].at)latest[field]={value,at:r.at,setBy:r.setBy,source:r.source};
 const status=latest.status,activeStatus=status?.value&&(!identity.presence||status.at>=identity.presence.updatedAt)?{text:status.value,updatedAt:status.at,source:status.source,setBy:status.setBy,reported:true}:identity.presence;
 const current=latest.current;const day=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t*1000));
 return {...identity,presence:activeStatus,currentReport:current?.value&&day(current.at)===day(now)?{text:current.value,updatedAt:current.at,source:current.source,setBy:current.setBy}:null};
}
export async function recordCompanyReports({ctx,client,context,args}){
 const relay=ctx.agents.relay(client.key),initial=relay?.snapshot(),owner=ctx.relay.snapshot();
 const check=()=>{
  client.signal?.throwIfAborted();const live=relay?.snapshot(),current=ctx.relay.snapshot();
  if(!client.signal||initial?.status!=='ready'||initial.cached||live?.session!==initial.session||live?.scope!==initial.scope||live?.generation!==initial.generation||current.status!=='ready'||current.cached||current.session!==owner.session||current.generation!==owner.generation||current.scope!==initial.scope||current.session.viewer!==client.owner||initial.session.viewer!==client.owner)throw Error('本人或Agent身份已变化');
  for(const session of [initial.session,current.session]){
   const list=session.channels.list(),route=list.channels.find(c=>c.id===context.channel),source=list.channels.find(c=>c.id===TASK_SOURCE);
   if(list.status!=='ready'||[route,source].some(c=>!c||c.archived||c.readOnly||c.cached||c.pending||c.metadataCached||c.metadataPending||!c.members?.includes(client.owner)||!c.members?.includes(client.pubkey)))throw Error('当前会话或人员来源权限不足');
  }
 };
 check();const session=initial.session,head=await session.canvas.read(TASK_SOURCE);check();
 const records=companyReports(head.content);
 if(args.action==='read'||!args.action)return {baselineRevision:head.id,records};
 if(args.action!=='update'||args.expected_revision!==head.id)throw Error('人员来源已变化，请先重新读取');
 const request=await exactFlowMessage(session,client,context.channel,args.request_id,check);
 if(request.authorId!==client.owner)throw Error('需本人的原始工作指令');
 if(!Array.isArray(args.updates)||!args.updates.length||args.updates.length>30)throw Error('人员更新数量无效');
 const members=session.channels.list().channels.find(c=>c.id===TASK_SOURCE).members;
 const updates=await Promise.all(args.updates.map(async u=>{
  if(!members.includes(u.person)||!key(u.person))throw Error('人员不在当前授权来源中');
  const creator=session.channels.list().channels.find(c=>c.id===TASK_SOURCE).creator;
  if(client.owner!==creator&&u.person!==client.owner&&u.person!==client.pubkey)throw Error('仅来源负责人可代其他人员同步');
  const fields={};for(const field of ['status','current'])if(Object.hasOwn(u,field))fields[field]=u[field];
  if(!Object.keys(fields).length)throw Error('缺少人员更新内容');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fields))),hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  return {id:request.id+':'+u.person+':'+hash,person:u.person,setBy:client.owner,recordedBy:client.pubkey,at:Date.now()/1000,requestAt:request.createdAt,source:`buzz://message?channel=${context.channel}&id=${request.id}`,fields};
 }));
 const content=appendCompanyReports(head.content,updates);if(content===head.content)return {baselineRevision:head.id,duplicate:true};
 check();if(!session.canvas.available||typeof session.canvas.save!=='function')throw Error('当前宿主不支持人员同步写入');
 const latest=await session.canvas.read(TASK_SOURCE);check();if(latest?.id!==head.id)throw Error('人员来源已变化，请重新读取，不重复执行');
 const saved=await session.canvas.save(TASK_SOURCE,content,head.id,{preserveApproval:true});check();
 if(saved?.content!==content||!saved?.id)throw Error('保存结果未确认，请读取核对');
 return {baselineRevision:saved.id,updated:updates.length};
}
export function registerCompanyReports(ctx){
 ctx.agents.addTool({
  name:'opcb_company_people',
  description:'读取或同步看板人员状态、当前事情；更新需本人原始工作指令和最新baselineRevision。保留设置人和来源，不代发他人原生个人状态，不改变任务完成或验收。',
  inputSchema:{type:'object',additionalProperties:false,properties:{
   action:{type:'string',enum:['read','update']},expected_revision:{type:'string'},request_id:{type:'string'},
   updates:{type:'array',maxItems:30,items:{type:'object',additionalProperties:false,required:['person'],properties:{person:{type:'string'},status:{type:['string','null'],maxLength:80},current:{type:['string','null'],maxLength:180}}}}
  }},
  async call(client,context,args){return JSON.stringify(await recordCompanyReports({ctx,client,context,args}));}
 });
 ctx.agents.addInstructions({id:'company-people-sync',text:'公司看板人员同步：本人要求更改人员状态或当前事情时，先用opcb_company_people读取，再以最新baselineRevision、本轮本人request_id更新；实际开工/交付时可按原授权同步自己的当前事情，完成或切换后更新/清空。其他人只能依据本人明确指定或可核实的本人执行回执更新。不得把Agent活动推成所属人正在工作；不得代发其他人的原生个人状态。此工具不更改任务进度、验收或权限。'});
}
