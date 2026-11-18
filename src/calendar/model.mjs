import {validDate,TASK_SOURCE} from '../tasks/source.mjs';
export {TASK_SOURCE};
export const TYPES=Object.freeze({leave:'请假',trip:'出差',online:'线上会议',offline:'线下会议',milestone:'里程碑'});
const BEGIN='<!-- opcb-calendar-v1:begin -->',END='<!-- opcb-calendar-v1:end -->';
const key=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const plain=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||[...v].length>max||/[\r\n]/.test(v)||v.includes('<!--'))throw Error(label+'无效');return v.trim();};
export function validateEvent(raw){
 if(!raw||!key(raw.id)||!key(raw.createdBy)||!key(raw.updatedBy)||!Number.isFinite(raw.updatedAt))throw Error('日程身份无效');
 if(!Object.hasOwn(TYPES,raw.type))throw Error('只支持请假、出差、线上会议、线下会议和里程碑');
 if(!validDate(raw.date)||!validDate(raw.endDate)||raw.endDate<raw.date)throw Error('请填写有效的开始和结束日期');
 if(Date.parse(raw.endDate)-Date.parse(raw.date)>366*86400000)throw Error('单项日程最长一年');
 if(typeof raw.allDay!=='boolean')throw Error('请确认全天或具体时间');
 const time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
 if(!raw.allDay&&(!time(raw.time)||!time(raw.endTime)||(raw.date===raw.endDate&&raw.endTime<=raw.time)))throw Error('结束时间需晚于开始时间');
 if(!Array.isArray(raw.participants)||raw.participants.length>50||raw.participants.some(p=>typeof p!=='string'||!p.trim()||[...p].length>80)||new Set(raw.participants).size!==raw.participants.length)throw Error('参与人员无效');
 return {id:raw.id,type:raw.type,title:plain(raw.title,60,'日程名称'),date:raw.date,endDate:raw.endDate,allDay:raw.allDay,time:raw.allDay?'':raw.time,endTime:raw.allDay?'':raw.endTime,participants:raw.participants.map(p=>p.trim()),location:typeof raw.location==='string'?raw.location.trim().slice(0,300):'',note:typeof raw.note==='string'?raw.note.trim().slice(0,1000):'',createdBy:raw.createdBy,updatedBy:raw.updatedBy,updatedAt:raw.updatedAt};
}
export function readEvents(content){
 const start=content.indexOf(BEGIN);if(start<0){if(content.includes(END))throw Error('日程区格式冲突');return [];}
 const end=content.indexOf(END,start);if(end<0||content.indexOf(BEGIN,start+BEGIN.length)>=0||content.indexOf(END,end+END.length)>=0)throw Error('日程区格式冲突');
 const block=content.slice(start+BEGIN.length,end).match(/```json\s*([\s\S]*?)\s*```/);if(!block)throw Error('日程区无法读取');
 const data=JSON.parse(block[1]);if(data.version!==1||!Array.isArray(data.events)||data.events.length>1000)throw Error('日程格式或数量无效');
 const events=data.events.map(validateEvent);if(new Set(events.map(e=>e.id)).size!==events.length)throw Error('日程编号重复');return events;
}
export function canEditEvent(event,viewer,creator){return !!viewer&&(viewer===creator||event?.createdBy===viewer);}
export function mutateEvents(content,{action,event,id,actor,creator,now=Date.now()/1000}){
 if(!key(actor))throw Error('日程操作者无效');const events=readEvents(content),index=events.findIndex(e=>e.id===(id||event?.id));
 if(!['add','update','remove'].includes(action))throw Error('操作无效');
 if(action!=='add'&&(index<0||!canEditEvent(events[index],actor,creator)))throw Error('仅登记人或来源管理员可修改此日程');
 if(action==='add'){
  if(events.length>=1000)throw Error('日程已满，请先整理来源');
  if(index>=0)throw Error('日程已存在，请刷新核对');
  events.push(validateEvent({...event,createdBy:actor,updatedBy:actor,updatedAt:now}));
 }else if(action==='update')events[index]=validateEvent({...event,id:events[index].id,createdBy:events[index].createdBy,updatedBy:actor,updatedAt:now});
 else events.splice(index,1);
 const block=BEGIN+'\n## 共享日历\n```json\n'+JSON.stringify({version:1,events},null,2)+'\n```\n'+END;
 const start=content.indexOf(BEGIN),next=start<0?content.trimEnd()+'\n\n'+block+'\n':content.slice(0,start)+block+content.slice(content.indexOf(END,start)+END.length);
 if(new TextEncoder().encode(next).length>256000)throw Error('来源已超过容量');readEvents(next);return next;
}
export function eventsOn(events,day){return events.filter(e=>e.date<=day&&e.endDate>=day).sort((a,b)=>(a.allDay?'00:00':a.time).localeCompare(b.allDay?'00:00':b.time)||a.title.localeCompare(b.title));}
export function sourceAccess(connection,write=false){
 const s=connection?.session,list=s?.channels.list(),c=list?.channels.find(c=>c.id===TASK_SOURCE);
 if(connection?.status!=='ready'||connection.cached||!s?.viewer||list?.status!=='ready'||!c||c.archived||c.cached||c.pending||c.metadataCached||c.metadataPending||!c.members?.includes(s.viewer)||write&&(c.readOnly||!s.canvas?.available||typeof s.canvas.save!=='function'))throw Error('当前账号无权'+(write?'修改':'读取')+'共享日历来源');return c;
}
export async function saveEvents({connection,check,expected,operation}){
 const s=connection.session;check();sourceAccess(connection,true);const head=await s.canvas.read(TASK_SOURCE);check();const c=sourceAccess(connection,true);
 if(head?.id!==expected)throw Error('日历已变化，草稿保留；请刷新核对后再保存');
 const content=mutateEvents(head.content,{...operation,actor:s.viewer,creator:c.creator});
 const saved=await s.canvas.save(TASK_SOURCE,content,head.id,{preserveApproval:true});check();sourceAccess(connection,true);
 if(!saved?.id||saved.content!==content)throw Error('保存结果未确认，请刷新核对后再操作');return saved;
}
