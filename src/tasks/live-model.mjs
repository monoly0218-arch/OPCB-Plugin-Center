import {executionRecords,projectExecution} from './execution.mjs';
/** Read-only projection of the current, authorized work Canvas. No inferred execution. */
import {TASK_SOURCE,validDate} from './source.mjs';
export {TASK_SOURCE,validDate} from './source.mjs';
const plain = text => text.replace(/\*\*/g,'').trim();
// Names come from the explicit people table, never from substring matching.
// Keep roles verbatim; only common collaboration separators split participants.
export function taskParticipants(task, people) {
 const parts=task.assignee.split(/\s*(?:＋|\+|、|；|;|→|，|,)\s*/);
 return people.filter(person=>{
  const aliases=[person,...person.split(/[／/（）()]/).map(s=>s.trim()).filter(Boolean)];
  return aliases.some(alias=>parts.some(part=>part===alias||(part.startsWith(alias)&&/^(?:接入|决策|核账|负责|执行|协作|验收|审核|保障|批准投放|定价|数据|账单)$/.test(part.slice(alias.length).trim()))));
 });
}
export function filterTasks(tasks, query='', owner='') {
 const people=[...new Set(tasks.filter(t=>t.kind==='assignment').map(t=>t.assignee))];
 const search=query.trim().toLocaleLowerCase();
 return tasks.filter(t=>(!owner||taskParticipants(t,people).includes(owner))&&
  [t.code,t.id,t.title,t.assignee,t.description,t.project,t.completionDefinition,t.acceptance].filter(Boolean).join(' ').toLocaleLowerCase().includes(search));
}
export function parseTaskCanvas(event) {
 if (!event || !/^[a-f0-9]{64}$/.test(event.id) || typeof event.content !== 'string' || !Number.isFinite(event.created_at)) throw new Error('指定频道没有有效的工作基线');
 if (event.content.length > 256000) throw new Error('工作基线过大，请先核对来源');
 const title = event.content.match(/^#\s+(.+)$/m)?.[1] || '工作分配';
 const section = event.content.split('## 人员分工')[1]?.split(/\n## /)[0];
 if (!section) throw new Error('当前 Canvas 缺少人员分工，未恢复历史任务');
 const rows = section.split('\n').filter(line=>/^\s*\|/.test(line)).map(line=>line.trim().replace(/^\||\|$/g,'').split('|').map(plain));
 const head = rows.shift() || [];
 const column = (...names) => names.map(name=>head.indexOf(name)).find(index=>index>=0) ?? -1;
 const owner = column('负责人','人员'), work = column('主要工作','主要负责'), delivery = column('可检查的交付','交付'), boundary = column('边界');
 if (owner<0 || work<0) throw new Error('人员分工表结构不受支持，请核对来源');
 const day = column('计划日期','截止日期','日期'), status = column('状态'), project = column('项目');
 const statuses = new Map([['待开始','todo'],['待办','todo'],['进行中','doing'],['受阻','blocked'],['已阻塞','blocked'],['待验收','review'],['验收中','review'],['已验收','done']]);
 const seen = new Set();
 const tasks = rows.filter(row=>!row.every(cell=>/^[-: ]*$/.test(cell))).map(row=>{
  const assignee = row[owner]?.trim(), assignment = row[work]?.trim();
  if (!assignee || !assignment) throw new Error('人员分工缺少姓名或工作内容');
  const id = `baseline-${encodeURIComponent(assignee)}`;
  if(seen.has(id)) throw new Error('人员分工有重复姓名，请补充唯一标识');
  seen.add(id);
  if(day>=0 && row[day] && !validDate(row[day])) throw new Error('分工表日期无效；未猜测日期');
  return {id,title:assignment.split(/[。；]/)[0],assignee,team:row[project]||title.split('｜')[0].trim(),project:row[project]||'人员分工',description:assignment,completionDefinition:delivery>=0?row[delivery]||'未登记':'未登记',boundary:boundary>=0?row[boundary]||'':'',date:day>=0?row[day]||null:null,status:status>=0?statuses.get(row[status])||'planning':'planning',progress:null,steps:assignment.split(/[。；]/).filter(Boolean).map(name=>({name,status:'planning'})),kind:'assignment'};
 });
 // Execution entries can have relative D0/D1 slots and alternative launch dates.
 // Keep those slots verbatim; an absolute date requires an explicit date field.
 const planSection = event.content.split('## 每日执行与验收')[1]?.split(/\n## /)[0] || '';
 const lines=planSection.split('\n');let phase='执行计划';
 const plans = new Map();
 for(let i=0;i<lines.length;i++){
  if(/^###\s/.test(lines[i])) phase=plain(lines[i].replace(/^###\s+/,''));
  const match=lines[i].match(/^-\s+\*\*([A-Z]\d{2})\s+(.+?)｜(.+?)\*\*[（(](.+)[）)]\s*$/);
  if(!match) continue;
  const [,code,slot,name,assignee]=match;let deliver='',acceptance='';
  for(let n=i+1;n<lines.length&&!/^(?:-\s+\*\*|###\s)/.test(lines[n]);n++){
   const text=plain(lines[n]);if(text.startsWith('交付：')) deliver=text.slice(3);if(text.startsWith('验收：'))acceptance=text.slice(3);
  }
  const entry={id:`plan-${code}`,code,title:plain(name),assignee:plain(assignee),team:'执行计划',project:phase,phases:[phase],slot:plain(slot),date:null,status:'planning',progress:null,description:plain(name),completionDefinition:deliver||'未登记',acceptance,boundary:'建议排期；不代表执行、验收或预算已批准',steps:[],kind:'plan'};
  const previous=plans.get(code);
  if(previous){
   if(previous.title!==entry.title||previous.assignee!==entry.assignee||previous.completionDefinition!==entry.completionDefinition||previous.acceptance!==entry.acceptance||previous.slot!==entry.slot) throw new Error(`计划 ${code} 有不同内容，请先核对来源`);
   previous.phases.push(phase);previous.project=previous.phases.join('／');
  }else plans.set(code,entry);
 }
 tasks.push(...plans.values());
 if(!tasks.length) throw new Error('当前基线没有分工或任务');
 return {tasks:projectExecution(tasks,executionRecords(event.content)),source:`buzz://channel/${TASK_SOURCE}`,baselineRevision:event.id,syncedAt:new Date(event.created_at*1000).toISOString(),projection:'channel_baseline',title,content:event.content,companyMilestones:[]};
}
