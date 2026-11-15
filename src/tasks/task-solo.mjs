import {TASK_SOURCE} from './source.mjs';
import {isKey} from './lifecycle.mjs';
import {canExecuteInChannel} from './execution-channels.mjs';

const BEGIN='<!-- opcb-task-solos-v1:begin -->',END='<!-- opcb-task-solos-v1:end -->';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function soloRecords(content){
 const a=content.split(BEGIN),b=content.split(END);
 if(a.length===1&&b.length===1)return [];
 if(a.length!==2||b.length!==2||content.indexOf(BEGIN)>content.indexOf(END))throw Error('任务Solo绑定区不完整');
 const match=a[1].split(END)[0].trim().match(/^## 任务执行会话\s*\n```json\n([\s\S]+)\n```$/);
 let rows;try{rows=JSON.parse(match?.[1]);}catch{throw Error('任务Solo绑定区无法解析');}
 if(!Array.isArray(rows)||rows.length>1000)throw Error('任务Solo绑定数量无效');
 const seen=new Set(),latest=new Map(),owners=new Map();
 for(const row of rows){
  if(!row||Object.keys(row).sort().join()!=='actor,at,event_id,from,operation,phase,revision,solo_id,task_id'||typeof row.task_id!=='string'||!row.task_id||row.task_id.length>240||row.task_id.includes('<!--')||!uuid(row.solo_id)||!isKey(row.actor)||!uuid(row.event_id)||seen.has(row.event_id)||!['reserved','submitted','ready'].includes(row.phase)||!Number.isInteger(row.revision)||row.revision<0||typeof row.from!=='string'||row.from.length>240||typeof row.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.at)||!Number.isFinite(Date.parse(row.at))||(row.operation!==''&&!isKey(row.operation)))throw Error('任务Solo绑定记录无效');
  if(owners.has(row.solo_id)&&owners.get(row.solo_id)!==row.task_id)throw Error('一个任务Solo不能绑定不同任务');owners.set(row.solo_id,row.task_id);
  const prior=latest.get(row.task_id);
  if(prior&&(prior.solo_id!==row.solo_id||prior.actor!==row.actor||prior.from!==row.from||prior.phase==='ready'||row.phase==='reserved'))throw Error('任务Solo绑定冲突');
  if(!prior&&row.phase!=='reserved'||row.phase==='submitted'&&!row.operation)throw Error('任务Solo绑定顺序无效');
  seen.add(row.event_id);latest.set(row.task_id,row);
 }
 return rows;
}
export function projectTaskSolos(tasks,content){
 const routes=new Map();for(const row of soloRecords(content))routes.set(row.task_id,row);
 return tasks.map(task=>{const route=routes.get(task.id);return route?{...task,executionSolo:route,...(route.phase==='ready'?{executionChannel:route.solo_id}:{})}:task;});
}
function contentWith(data,record){
 const rows=soloRecords(data.content);if(rows.length>=1000)throw Error('任务Solo记录达到上限');
 const block=`${BEGIN}\n## 任务执行会话\n\`\`\`json\n${JSON.stringify([...rows,record],null,2)}\n\`\`\`\n${END}`;
 const a=data.content.indexOf(BEGIN),b=data.content.indexOf(END);
 const content=a<0?data.content+'\n\n'+block+'\n':data.content.slice(0,a)+block+data.content.slice(b+END.length);
 if(new TextEncoder().encode(content).length>256000)throw Error('任务来源过大');soloRecords(content);return content;
}
async function activeWait(promise,signal){
 if(!signal)return promise;signal.throwIfAborted();
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||Error('页面已关闭'));
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
// All external writes follow fresh task and permission reads. A reserved UUID
// survives retries and page closes, so a delayed result never creates a second chat.
export async function createTaskSolo({session,check,read,taskId,expectedRevision,signal}){
 const access=data=>{
  signal?.throwIfAborted();check();const list=session.channels.list(),source=list.channels.find(c=>c.id===TASK_SOURCE),task=data.tasks.find(t=>t.id===taskId);
  if(list.status!=='ready'||!source||!canExecuteInChannel(source,session.viewer)||!session.canvas?.available||!session.channelWrites?.available)throw Error('当前身份不能建立任务Solo');
  if(!task||task.removed)throw Error('任务已移除或不存在');
  if((task.revision||0)!==expectedRevision)throw Error('任务轮次已变化，请重新选择');
  if(session.viewer!==(task.reviewer||source.creator))throw Error('仅本人或指定验收人可建立任务Solo');
  return task;
 };
 const executorReady=task=>{
  if(task.executor&&!session.channels.list().channels.find(c=>c.id===TASK_SOURCE)?.members?.includes(task.executor))throw Error('指定执行Agent已无权读取任务来源');
  if(task.executor&&!session.agentChoices?.snapshot().selectable?.some(a=>a.pubkey===task.executor))throw Error('指定执行Agent当前不可用');
 };
 const latest=async()=>{const data=await read();access(data);return data;};
 const save=async(data,record)=>{
  access(data);const head=await session.canvas.read(TASK_SOURCE);access(data);
  if(head.id!==data.baselineRevision)throw Error('任务来源已变化，请检查原Solo后重试');
  const content=contentWith(data,record),saved=await session.canvas.save(TASK_SOURCE,content,head.id,{preserveApproval:true});
  access(data);if(!saved?.id||saved.content!==content)throw Error('Solo绑定保存未确认，请检查原会话后重试');
  return latest();
 };
 let data=await latest(),task=access(data),route=task.executionSolo,freshReservation=false;
 if(!route&&task.status==='doing')throw Error('任务正在执行，请先处理当前执行进度，再新建Solo');
 if(!route){
  executorReady(task);
  route={event_id:crypto.randomUUID(),task_id:taskId,revision:expectedRevision,actor:session.viewer,solo_id:crypto.randomUUID(),from:task.executionChannel||'',operation:'',phase:'reserved',at:new Date().toISOString()};
  data=await save(data,route);task=access(data);freshReservation=true;
 }
 const bound=()=>{const c=session.channels.list().channels.find(c=>c.id===route.solo_id);return c&&canExecuteInChannel(c,session.viewer)&&c.private===true&&c.channelType==='solo'&&c.creator===session.viewer?c:null;};
 const progress=async(phase,operation=route.operation)=>{
  data=await latest();const current=access(data).executionSolo;
  if(current?.solo_id!==route.solo_id||current.actor!==session.viewer)throw Error('任务Solo关联已变化');
  if(current.phase==='ready'){route=current;return;}
  route={...current,phase,operation,event_id:crypto.randomUUID(),at:new Date().toISOString()};data=await save(data,route);
 };
 if(route.phase==='ready'){
  if(!bound())await activeWait(session.channelWrites.refresh(route.solo_id,{member:session.viewer}),signal);
  access(await latest());if(!bound())throw Error('原Solo当前不可访问；不会另建重复会话');
  return {data:await latest(),channelId:route.solo_id,reused:true};
 }
 let start=session.channelWrites.starting?.(route.solo_id);
 const failed=route.operation&&session.channelWrites.failed?.(route.operation);
 if(!bound()&&!start&&route.operation&&!failed){
  await activeWait(session.channelWrites.delivered(route.operation,undefined,false,false),signal);
 }else if(!bound()&&!start){
  if(!freshReservation&&!failed){
   await activeWait(session.channelWrites.refresh(route.solo_id,{member:session.viewer}),signal);
   if(!bound())throw Error('Solo创建状态待确认；保留原编号，不重复创建');
  }
  if(!bound()){
   data=await latest();task=access(data);
   if(task.status==='doing')throw Error('任务已在执行，暂不切换会话');
   const title=Array.from(`Task · ${task.code?task.code+' · ':''}${task.title}`).slice(0,120).join('');
   const members=task.executor?[task.executor]:[];
   executorReady(task);
   const created=session.channelWrites.start(route.solo_id,title,members,undefined,true,undefined,{active:()=>{try{access(data);return true;}catch{return false;}}});
   start=created.ready;
   Promise.resolve(start).catch(()=>{});
   await progress('submitted',created.create);
  }
 }
 if(start)await activeWait(start,signal);
 if(!bound())await activeWait(session.channelWrites.refresh(route.solo_id,{member:session.viewer}),signal);
 data=await latest();task=access(data);if(task.status==='doing'&&task.executionChannel!==route.solo_id)throw Error('任务已在原会话开工，暂不切换');if(!bound())throw Error('Solo创建未确认，保留原编号，请检查后继续');
 await progress('ready');
 return {data,channelId:route.solo_id,reused:false};
}
