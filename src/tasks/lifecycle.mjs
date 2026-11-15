import {TASK_SOURCE, validDate} from './source.mjs';

export const FLOW_BEGIN='<!-- opcb-task-lifecycle-v1:begin -->';
export const FLOW_END='<!-- opcb-task-lifecycle-v1:end -->';
const actions=new Set(['create','start','revise','deliver','blocked','reschedule','accept','complete','reopen','remove','restore']);
export const isKey=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=(value,max=2000)=>typeof value==='string'&&value.length<=max&&!value.includes('<!-- opcb-task');
export function flowRecords(content){
 const a=content.split(FLOW_BEGIN),b=content.split(FLOW_END);
 if(a.length===1&&b.length===1)return [];
 if(a.length!==2||b.length!==2||content.indexOf(FLOW_END)<content.indexOf(FLOW_BEGIN))throw Error('任务事件区不完整');
 const match=a[1].split(FLOW_END)[0].trim().match(/^## 任务事件\s*\n```json\n([\s\S]+)\n```$/);
 if(!match)throw Error('任务事件区格式无效');
 let rows;try{rows=JSON.parse(match[1]);}catch{throw Error('任务事件无法解析');}
 if(!Array.isArray(rows)||rows.length>1000)throw Error('任务事件数量无效');
 const ids=new Set();
 for(const r of rows){
  if(!r||Object.keys(r).sort().join()!=='action,actor,at,event_id,payload,revision,task_id'||!text(r.event_id,600)||!r.event_id||ids.has(r.event_id)||!text(r.task_id,240)||!r.task_id||!isKey(r.actor)||!actions.has(r.action)||!Number.isInteger(r.revision)||r.revision<0||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.at)||!Number.isFinite(Date.parse(r.at))||!r.payload||typeof r.payload!=='object'||Array.isArray(r.payload)||!text(JSON.stringify(r.payload),12000))throw Error('任务事件格式无效或事件重复');
  ids.add(r.event_id);
 }
 return rows;
}
export function validDelivery(value){
 if(!text(value)||!value)throw Error('缺少可回读的交付链接');
 let u;try{u=new URL(value);}catch{throw Error('交付链接无效');}
 if(!['https:','buzz:'].includes(u.protocol)||u.username||u.password||[...u.searchParams.keys()].some(k=>/^(token|signature|password|expires|accesskeyid|ossaccesskeyid|x-amz-.+|x-oss-.+)$/i.test(k)))throw Error('交付链接含临时凭据或不支持的格式');
 return value;
}
export function reduceFlow(tasks,event){
 const {task_id:id,action,revision,actor,payload:p}=event;
 let task=tasks.find(t=>t.id===id);
 if(action==='create'){
  if(task)throw Error('任务已存在，请更新原任务');
  if(revision!==0||!text(p.title,240)||!p.title.trim()||!text(p.description)||!text(p.assignee,240)||!text(p.team,240)||!text(p.project,240)||!text(p.goal)||!isKey(p.reviewer)||!['agent','human'].includes(p.executionKind)||(p.executor&&!isKey(p.executor))||(p.date!==null&&!validDate(p.date)))throw Error('新任务字段无效');
  task={id,title:p.title,description:p.description,assignee:p.assignee,team:p.team,project:p.project,completionDefinition:p.goal,acceptance:'',boundary:'',kind:'task',date:p.date,status:'todo',progress:null,steps:[],revision:0,executionKind:p.executionKind,executor:p.executor||'',reviewer:p.reviewer,completed:false,origin:p.source,executionChannel:p.channel};
 }else{
  if(!task)throw Error('任务不在当前来源中');
  if((task.revision||0)!==revision)throw Error('任务轮次已变化，请读取最新任务');
  task={...task};
  if(task.removed&&!['restore'].includes(action))throw Error('任务已移除，旧结果只可留在对话中');
  if(task.status==='done'&&!['revise','reopen','remove','restore','reschedule'].includes(action))throw Error('任务已经完成，需明确修改或重新打开');
 }
 if(action==='start'){
  if(task.executor&&task.executor!==actor)throw Error('仅指定执行Agent可报告开工');
  if(!['todo','planning','blocked'].includes(task.status)&&!(task.status==='doing'&&task.blockReason))throw Error('当前状态不能再次开工');
  if(!text(p.summary)||!p.summary.trim())throw Error('请说明已经开始的实际工作');
  Object.assign(task,{status:'doing',completed:false,executionKind:'agent',executor:actor,blockReason:'',work:p.summary});
 }else if(action==='revise'){
  if(!text(p.summary)||!p.summary.trim())throw Error('修改需有具体要求');
  Object.assign(task,{revision:revision+1,status:'todo',completed:false,blockReason:'',work:p.summary,delivery:null,lastRevisionAt:event.at});
 }else if(action==='deliver'){
  if(task.executor&&task.executor!==actor)throw Error('仅指定执行Agent可交付');
  if(!text(p.version,120)||p.version.trim().length<2||!text(p.summary)||!p.summary||!text(p.evidence))throw Error('交付需包含版本、结果和来源');
  validDelivery(p.url);validDelivery(p.evidence);
  Object.assign(task,{status:'review',completed:false,executionKind:'agent',executor:actor,blockReason:'',delivery:{url:p.url,version:p.version,summary:p.summary,evidence:p.evidence,revision,actor,at:event.at,messageAt:p.messageAt}});
 }else if(action==='blocked'){
  if(task.executor&&task.executor!==actor)throw Error('仅执行Agent可报告受阻');
  if(!text(p.summary)||!p.summary.trim())throw Error('需说明卡点');
  task.blockReason=p.summary;
 }else if(action==='reschedule'){
  if(p.date!==null&&!validDate(p.date))throw Error('日期无效');
  if(p.times!==undefined&&(!Array.isArray(p.times)||p.times.length>12||p.times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))))throw Error('计划钟点无效');
  task.date=p.date;if(p.times!==undefined)task.times=[...new Set(p.times)];
 }else if(action==='accept'){
  if(task.reviewer&&task.reviewer!==actor)throw Error('仅指定验收人可确认');
  if(task.status!=='review'||!task.delivery)throw Error('尚无当前版本交付，请先让Agent找交付');
  if(p.version!==task.delivery.version||p.delivery!==task.delivery.url)throw Error('交付版本已变化，请查看当前结果');
  Object.assign(task,{status:'done',completed:true,accepted:{actor,at:event.at,version:p.version,delivery:p.delivery,source:p.source}});
 }else if(action==='complete'){
  if(task.executor||task.executionKind==='agent')throw Error('Agent任务需先提交当前版本，再由本人验收');
  Object.assign(task,{status:'done',completed:true,accepted:{actor,at:event.at,source:p.source}});
 }else if(action==='reopen'){
  Object.assign(task,{status:'todo',completed:false,revision:revision+1,delivery:null,blockReason:''});
 }else if(action==='remove'){
  Object.assign(task,{removed:true,removedFrom:task.status,revision:revision+1,completed:false,stopRequested:task.status==='doing'});
 }else if(action==='restore'){
  if(!task.removed)throw Error('任务尚未移除');
  Object.assign(task,{removed:false,status:task.removedFrom==='done'?'done':'todo',completed:task.removedFrom==='done',revision:revision+1,stopRequested:false,...(task.removedFrom!=='done'?{delivery:null}:{})});
 }
 task.lastEvent=event;
 if(p.channel&&!task.executionChannel)task.executionChannel=p.channel;
 return [...tasks.filter(t=>t.id!==id),task];
}
export function projectFlow(tasks,content){
 // Legacy checks reported completion, never owner acceptance. Normalize their display
 // to review so every view and count sees the same state without rewriting history.
 let result=tasks.map(t=>({...t,revision:0,...(t.completed&&t.status!=='done'?{status:'review',completed:false}:{} ),...(t.status==='review'&&t.execution?.delivery?{delivery:{url:t.execution.delivery,evidence:t.execution.delivery,version:'已登记交付',summary:t.execution.acceptance||'待本人验收',revision:0}}:{})}));
 for(const event of flowRecords(content))result=reduceFlow(result,event);
 return result;
}
export function appendFlow(data,event){
 const records=flowRecords(data.content),previous=records.find(r=>r.event_id===event.event_id);
 if(previous){
  if(JSON.stringify({...previous,at:''})!==JSON.stringify({...event,at:''}))throw Error('事件ID已用于不同内容');
  return data.content;
 }
 reduceFlow(data.tasks,event);
 if(records.length>=1000)throw Error('事件数量达到上限，请归档后继续');
 const block=`${FLOW_BEGIN}\n## 任务事件\n\`\`\`json\n${JSON.stringify([...records,event],null,2)}\n\`\`\`\n${FLOW_END}`;
 const a=data.content.indexOf(FLOW_BEGIN),b=data.content.indexOf(FLOW_END);
 const next=a<0?data.content+'\n\n'+block+'\n':data.content.slice(0,a)+block+data.content.slice(b+FLOW_END.length);
 if(new TextEncoder().encode(next).length>256000)throw Error('任务来源过大，请归档后继续');
 flowRecords(next);return next;
}
export async function saveFlow({session,check,data,events}){
 const access=()=>{
  check();const list=session.channels.list(),channel=list.channels.find(c=>c.id===TASK_SOURCE);
  if(list.status!=='ready'||!channel||channel.readOnly||channel.archived||channel.cached||channel.pending||channel.metadataPending||channel.metadataCached||!channel.members?.includes(session.viewer)||!session.canvas?.available||typeof session.canvas.save!=='function')throw Error('当前身份不可写入任务');
  return channel;
 };
 access();const head=await session.canvas.read(TASK_SOURCE);access();
 if(head?.id!==data.baselineRevision)throw Error('任务来源已变化，请刷新核对后重试；不会重复执行外部任务');
 let next=data;
 for(const event of events){const content=appendFlow(next,event);if(content!==next.content)next={...next,content,tasks:reduceFlow(next.tasks,event)};}
 if(next.content===head.content)return head;
 const saved=await session.canvas.save(TASK_SOURCE,next.content,head.id,{preserveApproval:true});access();
 if(!saved?.id||saved.content!==next.content)throw Error('保存结果未确认，请刷新核对；不要重复执行任务');
 return saved;
}
export async function saveHumanFlow({session,check,data,ids,action,completed}){
 check();const channel=session.channels.list().channels.find(c=>c.id===TASK_SOURCE);
 const events=ids.map(id=>{
  const task=data.tasks.find(t=>t.id===id);if(!task)throw Error('任务已变化，请刷新');
  if(session.viewer!==(task.reviewer||channel?.creator))throw Error('仅本人或指定验收人可确认或移除任务');
  let type=action,payload={source:'本人在任务中心直接操作'};
  if(action==='check'){
   type=completed?(task.delivery?'accept':'complete'):'reopen';
   if(completed&&(task.executor||task.executionKind==='agent'||task.status==='review')&&!task.delivery)throw Error('请让Agent先核对本轮交付');
   if(type==='accept')payload={...payload,version:task.delivery.version,delivery:task.delivery.url};
  }
  if(!['accept','complete','reopen','remove','restore'].includes(type))throw Error('不支持的本人操作');
  return {event_id:crypto.randomUUID(),task_id:id,revision:task.revision||0,action:type,actor:session.viewer,at:new Date().toISOString(),payload};
 });
 return saveFlow({session,check,data,events});
}
