import test from 'node:test';
import assert from 'node:assert/strict';
import {timeTone,resolveParticipants,peopleForTask,matchesParticipant,movedSchedule,keyboardSchedule} from '../src/tasks/interaction-model.mjs';
import {inboxGroups,taskOccurrences} from '../src/tasks/schedule.mjs';
import {saveTaskSchedule} from '../src/tasks/schedule-write.mjs';
import {flowRecords,projectFlow} from '../src/tasks/lifecycle.mjs';
import {TASK_SOURCE} from '../src/tasks/source.mjs';
const viewer='a'.repeat(64),agent='b'.repeat(64);
test('schedule colors use Beijing instants, including the exact one-hour boundary and mixed clocks',()=>{
 const task={date:'2026-11-16',status:'todo'},now=Date.parse('2026-11-15T16:00:00Z');
 assert.equal(timeTone(task,'00:00',now),'soon');assert.equal(timeTone(task,'00:59',now),'soon');assert.equal(timeTone(task,'01:00',now),'soon');assert.equal(timeTone(task,'01:01',now),'future');
 assert.equal(timeTone({...task,date:'2026-11-15'},'23:59',now),'overdue');assert.equal(timeTone({...task,status:'done'},'00:00',now+999999),'future');assert.equal(timeTone({...task,date:null},'00:00',now),'future');
});
test('Inbox contains only original unscheduled open objects, never planned dates or removed work',()=>{
 const keep={id:'u',date:null,status:'todo'},items=[keep,{id:'past',date:'2026-11-14',status:'doing'},{id:'future',date:'2026-11-17',status:'todo'},{id:'done',date:null,status:'done'},{id:'removed',date:null,status:'todo',removed:true}];
 const groups=inboxGroups(items,'2026-11-15');assert.equal(groups.length,1);assert.deepEqual(groups[0][2],[keep]);assert.strictEqual(groups[0][2][0],keep);
});
test('multi-person identities and filters use source members, exact aliases and agent metadata',()=>{
 const tasks=[{kind:'assignment',assignee:'潘涛'},{kind:'assignment',assignee:'小跑／夏明升'},{kind:'task',assignee:'潘涛／小跑'}];
 const profiles=new Map([[viewer,{name:'潘涛',picture:'https://fixture.test/a.png'}],[agent,{name:'小跑',isAgent:true}]]),people=resolveParticipants(tasks,[viewer,agent],profiles,url=>'/media/'+url.split('/').at(-1));
 assert.deepEqual(Object.keys(people),['潘涛','小跑／夏明升']);const task={assignee:'潘涛／小跑',reviewer:viewer,executor:agent};
 assert.equal(peopleForTask(task,people).length,2);assert.equal(people['潘涛'].avatar,'/media/a.png');assert(matchesParticipant(task,people,'小跑／夏明升','agent'));assert(matchesParticipant(task,people,'潘涛','reviewer'));assert(!matchesParticipant({assignee:'潘涛'},people,'小跑／夏明升'));
 const duplicate=resolveParticipants(tasks,[viewer,agent],new Map([[viewer,{name:'潘涛'}],[agent,{name:'潘涛'}]]));assert.equal(duplicate['潘涛'].pubkey,null);
});
test('moving a repeated clock preserves other clocks and original task identity',()=>{
 const task={id:'multi',date:'2026-11-15',times:['10:00','12:00'],status:'doing'};const occurrence=taskOccurrences([task])[1];
 assert.deepEqual(movedSchedule(occurrence,'2026-11-16','13:00'),{date:'2026-11-16',times:['10:00','13:00']});assert.deepEqual(task.times,['10:00','12:00']);
 assert.deepEqual(keyboardSchedule(occurrence,'ArrowRight'),{date:'2026-11-16',times:['10:00','12:00']});assert.equal(keyboardSchedule({...task,time:'23:50'},'ArrowDown').times.includes('23:59'),false);
});
function fixture(){
 const task={id:'task-1',assignee:'潘涛',reviewer:viewer,date:'2026-11-15',times:['10:00'],status:'doing',revision:0};const data={baselineRevision:'c'.repeat(64),content:'# 源任务',tasks:[task]};let saves=0,head=data.baselineRevision;
 const channel={id:TASK_SOURCE,creator:viewer,members:[viewer],readOnly:false};const session={viewer,channels:{list:()=>({status:'ready',channels:[channel]})},canvas:{available:true,read:async()=>({id:head,content:data.content}),save:async(id,content,expected,options)=>{assert.equal(id,TASK_SOURCE);assert.equal(expected,data.baselineRevision);assert.equal(options.preserveApproval,true);saves++;return {id:'d'.repeat(64),content};}}};
 return {session,channel,data,task,get saves(){return saves;},conflict(){head='e'.repeat(64);}};
}
test('explicit calendar move persists through original lifecycle without changing status or revision',async()=>{
 const f=fixture(),saved=await saveTaskSchedule({...f,check(){},id:f.task.id,date:'2026-11-16',times:['12:30'],expectedRevision:0});
 assert.equal(f.saves,1);assert.equal(flowRecords(saved.content).at(-1).action,'reschedule');const task=projectFlow(f.data.tasks,saved.content)[0];assert.equal(task.status,'doing');assert.equal(task.revision,0);assert.equal(task.date,'2026-11-16');assert.deepEqual(task.times,['12:30']);
});
test('calendar writes reject stale heads, missing authority, removed tasks and changed revisions',async()=>{
 for(const mode of ['conflict','readonly','reviewer','removed','revision']){const f=fixture();if(mode==='conflict')f.conflict();if(mode==='readonly')f.channel.readOnly=true;if(mode==='reviewer')f.task.reviewer=agent;if(mode==='removed')f.task.removed=true;if(mode==='revision')f.task.revision=1;
 await assert.rejects(saveTaskSchedule({...f,check(){},id:f.task.id,date:'2026-11-16',times:['12:30'],expectedRevision:0}));assert.equal(f.saves,0,mode);}
});

test('reviewer-only members can be selected by role without becoming execution avatars',()=>{
 const tasks=[{assignee:'Agent',executor:agent,reviewer:viewer}],profiles=new Map([[viewer,{name:'验收人'}],[agent,{name:'Agent',isAgent:true}]]);
 const people=resolveParticipants(tasks,[viewer,agent],profiles);
 assert(matchesParticipant(tasks[0],people,'验收人','reviewer'));
 assert(!matchesParticipant(tasks[0],people,'验收人','assignee'));
 assert.deepEqual(peopleForTask(tasks[0],people).map(p=>p.name),['Agent']);
 assert(!Object.values(resolveParticipants(tasks,[agent],profiles)).some(p=>p.pubkey===viewer));
});
