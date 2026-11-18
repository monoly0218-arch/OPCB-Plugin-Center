import {taskParticipants} from './live-model.mjs';
export const isBlocked=t=>t.status==='blocked'||t.status==='doing'&&!!t.blockReason;
export function companySummary(tasks){
 const active=tasks.filter(t=>!t.removed);
 return {total:active.length,doing:active.filter(t=>t.status==='doing'&&!isBlocked(t)).length,blocked:active.filter(isBlocked).length,review:active.filter(t=>t.status==='review').length,done:active.filter(t=>t.status==='done').length,unregistered:active.filter(t=>t.status==='planning').length};
}
// The owner named the business project. Source headings remain execution phases.
export function sourceProjectName(title){
 return ['OPCB平台商业化计划与报告','OPCB平台商业化'].includes(String(title||'').replace(/\s/g,''))?'OPCB 平台商业化':'';
}
export function companyTasks(data){
 const sourceProject=sourceProjectName(data?.title);
 const phaseNames=new Set((data?.tasks||[]).filter(t=>t.kind==='plan').flatMap(t=>t.phases||[t.project]));
 return (data?.tasks||[]).filter(t=>!t.removed).map(t=>{
  const legacy=t.kind==='plan'||t.kind==='assignment'||phaseNames.has(t.project);
  const businessProject=t.businessProject||(legacy?sourceProject:t.project)||'未归属项目';
  const stages=t.kind==='assignment'?['人员分工']:legacy?[...(t.phases||[t.project])].filter(Boolean):[];
  return {...t,businessProject,stages};
 });
}
export function companyStages(tasks){return [...new Set(tasks.flatMap(t=>t.stages||[]))];}
export function companyParticipants(task,owners){
 const found=new Set(taskParticipants(task,owners));
 // A whole registered name such as 小跑／夏明升 is one person. A slash between
 // separately known participants such as 潘涛／小跑 is explicit collaboration.
 for(const segment of task.assignee.split(/\s*(?:＋|\+|、|；|;|→|，|,)\s*/)){
  if(!/[／/]/.test(segment)||taskParticipants({...task,assignee:segment},owners).length)continue;
  for(const part of segment.split(/[／/]/))for(const name of taskParticipants({...task,assignee:part.trim()},owners))found.add(name);
 }
 return owners.filter(name=>found.has(name));
}
export function companyGroups(tasks,mode='project'){
 const active=tasks.filter(t=>!t.removed),groups=new Map();
 const owners=[...new Set(active.filter(t=>t.kind==='assignment'||t.kind==='task').map(t=>t.assignee).filter(Boolean))];
 for(const task of active){
  const people=companyParticipants(task,owners),names=mode==='people'?(people.length?people:[task.assignee||'未分配']):[(task.businessProject??task.project)||'未分组'];
  for(const name of names){if(!groups.has(name))groups.set(name,[]);groups.get(name).push(task);}
 }
 return [...groups].map(([name,tasks])=>({name,tasks,summary:companySummary(tasks)}));
}
