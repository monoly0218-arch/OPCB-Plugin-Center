import {TASK_SOURCE} from './source.mjs';
import {isKey} from './lifecycle.mjs';
import {canExecuteInChannel} from './execution-channels.mjs';

const BEGIN='<!-- opcb-task-bindings-v1:begin -->',END='<!-- opcb-task-bindings-v1:end -->';
export function bindingRecords(content){
 const a=content.split(BEGIN),b=content.split(END);
 if(a.length===1&&b.length===1)return [];
 if(a.length!==2||b.length!==2||content.indexOf(BEGIN)>content.indexOf(END))throw Error('任务会话绑定区不完整');
 const match=a[1].split(END)[0].trim().match(/^## 最近绑定的执行会话\s*\n```json\n([\s\S]+)\n```$/);
 let rows;try{rows=JSON.parse(match?.[1]);}catch{throw Error('任务会话绑定区无法解析');}
 if(!Array.isArray(rows)||rows.length>1000)throw Error('任务会话绑定数量无效');
 const seen=new Set();
 for(const row of rows){
  if(!row||Object.keys(row).sort().join()!=='actor,at,channel_id,task_id'||typeof row.task_id!=='string'||!row.task_id||row.task_id.length>240||row.task_id.includes('<!--')||seen.has(row.task_id)||!isKey(row.actor)||typeof row.channel_id!=='string'||row.channel_id.length>240||!/^[\w-]*$/.test(row.channel_id)||typeof row.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.at)||!Number.isFinite(Date.parse(row.at)))throw Error('任务会话绑定记录无效');
  seen.add(row.task_id);
 }
 return rows;
}
export function projectTaskBindings(tasks,content){
 const routes=new Map(bindingRecords(content).map(row=>[row.task_id,row]));
 return tasks.map(task=>routes.has(task.id)?{...task,executionBinding:routes.get(task.id),executionChannel:routes.get(task.id).channel_id}:task);
}
// Explicit selection saves only a route. It never creates a chat, sends or starts work.
export async function saveTaskBinding({session,check,read,taskId,channelId,expectedRevision}){
 const authorize=data=>{
  check();const roster=session.channels.list(),source=roster.channels.find(c=>c.id===TASK_SOURCE);
  if(roster.status!=='ready'||!canExecuteInChannel(source,session.viewer)||!session.canvas?.available||typeof session.canvas.save!=='function')throw Error('当前身份不可保存执行会话');
  const task=data.tasks.find(t=>t.id===taskId);
  if(!task||task.removed)throw Error('任务已移除或不存在');
  if((task.revision||0)!==expectedRevision)throw Error('任务轮次已变化，请重新选择');
  if(session.viewer!==(task.reviewer||source.creator))throw Error('仅本人或指定验收人可绑定执行会话');
  if(channelId&&!canExecuteInChannel(roster.channels.find(c=>c.id===channelId),session.viewer))throw Error('所选执行会话当前不可访问');
  return task;
 };
 const data=await read(),task=authorize(data);
 if(task.executionBinding?.channel_id===channelId)return {id:data.baselineRevision,created_at:Date.parse(data.syncedAt)/1000,content:data.content};
 const rows=bindingRecords(data.content).filter(row=>row.task_id!==taskId);
 rows.push({task_id:taskId,channel_id:channelId,actor:session.viewer,at:new Date().toISOString()});
 const block=`${BEGIN}\n## 最近绑定的执行会话\n\`\`\`json\n${JSON.stringify(rows,null,2)}\n\`\`\`\n${END}`;
 const start=data.content.indexOf(BEGIN),end=data.content.indexOf(END);
 const content=start<0?data.content+'\n\n'+block+'\n':data.content.slice(0,start)+block+data.content.slice(end+END.length);
 bindingRecords(content);if(new TextEncoder().encode(content).length>256000)throw Error('任务来源过大');
 const head=await session.canvas.read(TASK_SOURCE);authorize(data);
 if(head.id!==data.baselineRevision)throw Error('任务来源已变化，请刷新核对后重新选择');
 const saved=await session.canvas.save(TASK_SOURCE,content,head.id,{preserveApproval:true});
 authorize(data);if(!saved?.id||saved.content!==content)throw Error('绑定保存未确认，请刷新核对');
 const latest=await read();authorize(latest);
 if(latest.tasks.find(t=>t.id===taskId)?.executionBinding?.channel_id!==channelId)throw Error('绑定已变化，请刷新核对');
 return {id:latest.baselineRevision,created_at:Date.parse(latest.syncedAt)/1000,content:latest.content};
}
