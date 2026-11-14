import {validDate, TASK_SOURCE} from './source.mjs';
export const BEGIN='<!-- opcb-task-execution-v1:begin -->',END='<!-- opcb-task-execution-v1:end -->';
const statuses=new Set(['planning','todo','doing','blocked','review','done']);
const keys=['id','status','date','delivery','acceptance','actor','at'];
export function validateRecord(record) {
 if(!record||typeof record!=='object'||Object.keys(record).sort().join()!==[...keys].sort().join()||
  typeof record.id!=='string'||record.id.length>240||!statuses.has(record.status)||
  (record.date!==null&&!validDate(record.date))||typeof record.delivery!=='string'||record.delivery.length>2000||
  typeof record.acceptance!=='string'||record.acceptance.length>2000||!record.acceptance.trim()&&record.status==='done'||
  !/^[a-f0-9]{64}$/.test(record.actor)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.at)||!Number.isFinite(Date.parse(record.at)))throw Error('执行记录格式无效');
 if([record.delivery,record.acceptance].some(text=>text.includes(BEGIN)||text.includes(END)))throw Error('执行说明包含保留标记');
 if(record.delivery){let url;try{url=new URL(record.delivery);}catch{throw Error('交付需填写完整链接');}if(!['https:','buzz:'].includes(url.protocol)||url.username||url.password||[...url.searchParams.keys()].some(key=>/^(?:token|signature|password|expires|accesskeyid|ossaccesskeyid|x-amz-.+|x-oss-.+)$/i.test(key)))throw Error('交付链接不支持此格式或临时凭据');}
 if(['review','done'].includes(record.status)&&!record.delivery)throw Error('交付或验收前请填写交付链接');
 return record;
}
export function executionRecords(content) {
 const begins=content.split(BEGIN),ends=content.split(END);
 if(begins.length===1&&ends.length===1)return [];
 if(begins.length!==2||ends.length!==2||content.indexOf(END)<content.indexOf(BEGIN))throw Error('执行记录区重复或不完整，请先核对来源');
 const body=begins[1].split(END)[0].trim();
 const match=body.match(/^## 任务执行记录\s*\n```json\n([\s\S]+)\n```$/);
 if(!match)throw Error('执行记录区格式无效');
 let records;try{records=JSON.parse(match[1]);}catch{throw Error('执行记录无法解析');}
 if(!Array.isArray(records)||records.length>1000)throw Error('执行记录数量无效');
 records.forEach(validateRecord);return records;
}
export function projectExecution(tasks,records) {
 const latest=new Map(records.map(record=>[record.id,record]));
 return tasks.map(task=>{const record=latest.get(task.id);return record?{...task,status:record.status,date:record.date,execution:record}:task;});
}
export function updateExecution(data,id,draft,actor,canAccept,now=new Date().toISOString()) {
 if(!data.tasks.some(task=>task.id===id))throw Error('任务已不在当前来源中');
 if(draft.status==='done'&&!canAccept)throw Error('验收需来源频道创建者本人确认');
 const record=validateRecord({id,status:draft.status,date:draft.date||null,delivery:draft.delivery.trim(),acceptance:draft.acceptance.trim(),actor,at:now});
 const records=executionRecords(data.content);if(records.length>=1000)throw Error('执行记录已达到上限，请先归档原来源');
 const block=`${BEGIN}\n## 任务执行记录\n\`\`\`json\n${JSON.stringify([...records,record],null,2)}\n\`\`\`\n${END}`;
 const start=data.content.indexOf(BEGIN),end=data.content.indexOf(END);
 const content=start<0?data.content+'\n\n'+block+'\n':data.content.slice(0,start)+block+data.content.slice(end+END.length);
 if(new TextEncoder().encode(content).length>256000)throw Error('来源文档过大，请先归档');
 return content;
}
export async function saveExecution({session,check,data,id,draft}) {
 const authorize=()=>{
  check();const roster=session.channels.list(),channel=roster.channels.find(c=>c.id===TASK_SOURCE);
  if(roster.status!=='ready'||!channel||channel.readOnly||channel.archived||channel.cached||channel.pending||channel.metadataPending||!channel.members?.includes(session.viewer)||!session.canvas?.available||typeof session.canvas.save!=='function')throw Error('当前身份或宿主不可保存执行记录');
  return channel;
 };
 let channel=authorize();
 const head=await session.canvas.read(TASK_SOURCE);channel=authorize();
 if(head?.id!==data.baselineRevision)throw Error('来源已变化，草稿已保留。请刷新并核对后重新保存');
 const content=updateExecution(data,id,draft,session.viewer,channel.creator===session.viewer);
 const saved=await session.canvas.save(TASK_SOURCE,content,head.id,{preserveApproval:true});
 authorize();
 if(!saved||saved.content!==content||!saved.id)throw Error('未确认实际保存结果，请先刷新来源核对，不要重复提交');
 return saved;
}
