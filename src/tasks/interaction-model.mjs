import {taskParticipants} from './live-model.mjs';
import {addDays,taskTime} from './schedule.mjs';
export const ROLE_NAMES={assignee:'负责人',collaborator:'协作',reviewer:'验收人',agent:'Agent'};
const aliases=name=>[name,...String(name||'').split(/[／/（）()]/).map(s=>s.trim()).filter(Boolean)];
export function participantNames(tasks){
 const declared=tasks.filter(t=>t.kind==='assignment').map(t=>t.assignee).filter(n=>typeof n==='string'&&n.trim());
 const direct=tasks.flatMap(t=>String(t.assignee||'').split(/\s*(?:＋|\+|、|；|;|→|，|,|／|\/)\s*/)).filter(Boolean);
 return [...new Set([...declared,...direct.filter(name=>!declared.some(person=>taskParticipants({assignee:name},[person]).length))])];
}
export function resolveParticipants(tasks,members=[],profiles=new Map(),media){
 const names=participantNames(tasks),people={};
 for(const name of names){const match=members.filter(id=>{const p=profiles.get(id);return p&&!p.nameIsFallback&&[p.name,p.username].some(n=>n&&aliases(name).includes(n));});const pubkey=match.length===1?match[0]:null,p=pubkey?profiles.get(pubkey):null;let avatar='';
  const picture=p?.picture;try{if(typeof picture==='string'&&/^https:\/\//.test(picture)&&typeof media==='function')avatar=media(picture,'small');}catch{}
  people[name]={name,pubkey,avatar,isAgent:p?.isAgent===true};
 }
 // Lifecycle roles carry canonical pubkeys even when a person has no assignee row.
 for(const id of new Set(tasks.flatMap(t=>[t.reviewer,t.executor]).filter(Boolean))){
  if(!members.includes(id)||Object.values(people).some(p=>p.pubkey===id))continue;
  const p=profiles.get(id);if(!p||p.nameIsFallback||!p.name||people[p.name])continue;
  let avatar='';try{if(typeof p.picture==='string'&&/^https:\/\//.test(p.picture)&&typeof media==='function')avatar=media(p.picture,'small');}catch{}
  people[p.name]={name:p.name,pubkey:id,avatar,isAgent:p.isAgent===true};
 }
 return people;
}
export function peopleForTask(task,people){
 const names=Object.keys(people);const result=taskParticipants({...task,assignee:task.assignee||''},names).map(name=>people[name]);
 if(task.executor&&!result.some(p=>p.pubkey===task.executor)){const p=Object.values(people).find(p=>p.pubkey===task.executor);if(p)result.push(p);}
 return result;
}
export function matchesParticipant(task,people,owner='',role=''){
 const participants=peopleForTask(task,people);
 if(role==='reviewer')return Object.values(people).some(p=>(!owner||p.name===owner)&&p.pubkey&&p.pubkey===task.reviewer);
 if(owner&&!participants.some(p=>p.name===owner))return false;
 const relevant=owner?participants.filter(p=>p.name===owner):participants;
 if(!role)return true;
 if(role==='agent')return relevant.some(p=>p.isAgent||p.pubkey===task.executor);
 if(role==='collaborator')return participants.length>1&&relevant.length>0;
 return role==='assignee'&&relevant.length>0;
}
export function timeTone(task,time,now=Date.now()){
 if(!task.date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||task.status==='done')return 'future';
 const target=Date.parse(`${task.date}T${time}:00+08:00`),delta=target-Number(now);
 return !Number.isFinite(delta)?'future':delta<0?'overdue':delta<=3600000?'soon':'future';
}
export function movedSchedule(task,date,time){
 const clocks=task.times?.length?task.times:[taskTime(task)].filter(Boolean),from=task.occurrenceTime||taskTime(task);
 return {date,times:[...new Set(clocks.length?clocks.map(t=>t===from?time:t):[time])].sort()};
}
export function keyboardSchedule(task,key){
 const time=taskTime(task)||'09:00',minute=Number(time.slice(0,2))*60+Number(time.slice(3));
 if(key==='ArrowLeft'||key==='ArrowRight')return movedSchedule(task,addDays(task.date,key==='ArrowLeft'?-1:1),time);
 if(!['ArrowUp','ArrowDown'].includes(key))return null;
 const next=Math.max(0,Math.min(1439,minute+(key==='ArrowUp'?-30:30)));
 return movedSchedule(task,task.date,`${String(Math.floor(next/60)).padStart(2,'0')}:${String(next%60).padStart(2,'0')}`);
}
