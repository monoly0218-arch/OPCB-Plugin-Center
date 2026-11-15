import {TASK_SOURCE,validDate} from './source.mjs';
export const CHECK_BEGIN='<!-- opcb-task-checks-v1:begin -->',CHECK_END='<!-- opcb-task-checks-v1:end -->';
const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.replace(/\*\*/g,'').trim());
export function plannedTimes(text) {
 const segments=String(text||'').split('；'),kept=[];
 for(const [index,segment] of segments.entries()){
  // A later dated segment describes continuing work, not more clocks on the first date.
  if(index&&/^\s*\d{1,2}(?:日|[—–-]\d{1,2}日)/.test(segment))break;
  kept.push(segment);
 }
 return [...new Set([...kept.join('；').matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g)].map(m=>m[1].padStart(2,'0')+':'+m[2]))];
}
export function checkRecords(content) {
 const a=content.split(CHECK_BEGIN),b=content.split(CHECK_END);
 if(a.length===1&&b.length===1)return [];
 if(a.length!==2||b.length!==2||content.indexOf(CHECK_BEGIN)>content.indexOf(CHECK_END))throw Error('任务勾选记录区不完整');
 const body=a[1].split(CHECK_END)[0].trim().match(/^## 任务勾选记录\s*\n```json\n([\s\S]+)\n```$/);
 if(!body)throw Error('任务勾选记录格式无效');
 let rows;try{rows=JSON.parse(body[1]);}catch{throw Error('任务勾选记录无法解析');}
 if(!Array.isArray(rows)||rows.length>1000)throw Error('任务勾选记录数量无效');
 for(const r of rows)if(!r||Object.keys(r).sort().join()!=='actor,at,completed,id'||typeof r.id!=='string'||r.id.length>240||typeof r.completed!=='boolean'||!/^[a-f0-9]{64}$/.test(r.actor)||typeof r.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.at)||!Number.isFinite(Date.parse(r.at)))throw Error('任务勾选记录无效');
 return rows;
}
export function projectTaskDetails(tasks,content) {
 const section=content.split('## 全部任务时间表（目标节点）')[1]?.split(/\n## /)[0];
 const lines=(section||'').split('\n').filter(line=>/^\s*\|/.test(line)).map(cells),head=lines.shift()||[];
 const key=head.indexOf('编号/人员'),date=head.indexOf('日期'),time=head.indexOf('时间/持续安排'),team=head.indexOf('团队');
 const schedule=new Map();
 if(key>=0&&date>=0&&time>=0)for(const row of lines.filter(row=>!row.every(cell=>/^[-: ]*$/.test(cell)))){
  if(!validDate(row[date]))throw Error('目标排期日期无效');
  if(schedule.has(row[key]))throw Error('目标排期有重复编号或人员');
  schedule.set(row[key],{date:row[date],times:plannedTimes(row[time]),scheduleNote:row[time],team:team>=0?row[team]:''});
 }
 const checks=new Map(checkRecords(content).map(r=>[r.id,r]));
 return tasks.map(task=>{
  const row=schedule.get(task.code||task.assignee),check=checks.get(task.id);
  return {...task,...(row?{team:row.team||task.team,times:row.date===task.date?row.times:[],scheduleNote:row.scheduleNote,scheduleDate:row.date}:{}),...(check?{completed:check.completed,check}:{}),...(task.status==='done'?{completed:true}:{})};
 });
}
export function updateTaskCheck(data,id,completed,actor,at=new Date().toISOString()) {
 const task=data.tasks.find(t=>t.id===id);if(!task)throw Error('任务已不在当前来源中');
 if(task.status==='done')throw Error('已验收任务请在详情核对状态');
 if(typeof completed!=='boolean'||!/^[a-f0-9]{64}$/.test(actor)||!Number.isFinite(Date.parse(at)))throw Error('勾选操作无效');
 const records=checkRecords(data.content);if(records.length>=1000)throw Error('勾选记录已达到上限，请先归档');
 const block=`${CHECK_BEGIN}\n## 任务勾选记录\n\`\`\`json\n${JSON.stringify([...records,{id,completed,actor,at}],null,2)}\n\`\`\`\n${CHECK_END}`;
 const start=data.content.indexOf(CHECK_BEGIN),end=data.content.indexOf(CHECK_END);
 const next=start<0?data.content+'\n\n'+block+'\n':data.content.slice(0,start)+block+data.content.slice(end+CHECK_END.length);
 if(new TextEncoder().encode(next).length>256000)throw Error('来源文档过大，请先归档');
 checkRecords(next);return next;
}
export async function saveTaskCheck({session,check,data,id,completed}) {
 const authorize=()=>{check();const list=session.channels.list(),c=list.channels.find(c=>c.id===TASK_SOURCE);if(list.status!=='ready'||!c||c.readOnly||c.archived||c.cached||c.pending||c.metadataCached||c.metadataPending||!c.members?.includes(session.viewer)||!session.canvas?.available||typeof session.canvas.save!=='function')throw Error('当前身份不可保存勾选');};
 authorize();const head=await session.canvas.read(TASK_SOURCE);authorize();
 if(head?.id!==data.baselineRevision)throw Error('来源已变化，未保存勾选；请刷新核对');
 const content=updateTaskCheck(data,id,completed,session.viewer);
 const saved=await session.canvas.save(TASK_SOURCE,content,head.id,{preserveApproval:true});authorize();
 if(!saved?.id||saved.content!==content)throw Error('未确认保存结果，请刷新核对，不要重复点击');
 return saved;
}
