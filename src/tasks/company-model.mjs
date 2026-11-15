import {taskParticipants} from './live-model.mjs';
export const isBlocked=t=>t.status==='blocked'||t.status==='doing'&&!!t.blockReason;
export function companySummary(tasks){
 const active=tasks.filter(t=>!t.removed);
 return {total:active.length,doing:active.filter(t=>t.status==='doing'&&!isBlocked(t)).length,blocked:active.filter(isBlocked).length,review:active.filter(t=>t.status==='review').length,done:active.filter(t=>t.status==='done').length,unregistered:active.filter(t=>t.status==='planning').length};
}
export function companyGroups(tasks,mode='project'){
 const active=tasks.filter(t=>!t.removed),groups=new Map();
 const owners=[...new Set(active.filter(t=>t.kind==='assignment'||t.kind==='task').map(t=>t.assignee).filter(Boolean))];
 for(const task of active){
  const people=taskParticipants(task,owners),names=mode==='people'?(people.length?people:[task.assignee||'未分配']):[task.project||'未分组'];
  for(const name of names){if(!groups.has(name))groups.set(name,[]);groups.get(name).push(task);}
 }
 return [...groups].map(([name,tasks])=>({name,tasks,summary:companySummary(tasks)}));
}
