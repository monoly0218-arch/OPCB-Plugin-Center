import test from 'node:test';
import assert from 'node:assert/strict';
import {plannedTimes,updateTaskCheck,checkRecords,saveTaskCheck,CHECK_BEGIN,CHECK_END} from '../src/tasks/task-details.mjs';
import {parseTaskCanvas,TASK_SOURCE} from '../src/tasks/live-model.mjs';
import {executionRecords} from '../src/tasks/execution.mjs';
import {canExecuteInChannel} from '../src/tasks/execution-channels.mjs';
const actor='a'.repeat(64),id='b'.repeat(64),at='2026-11-14T18:00:00.000Z';
const content='# 工作基线\n## 人员分工\n|人员|主要负责|\n|---|---|\n|甲|校对原文件|\n## 全部任务时间表（目标节点）\n| 编号/人员 | 日期 | 时间/持续安排 | 团队 | 执行状态 |\n|---|---|---|---|---|\n|甲|2026-11-15|10:00首轮；16日16:00二轮|OPCB 团队|待回执|\n## 每日执行与验收\n';
const event=content=>({id,created_at:1,content});
// The real source has explicit dates in execution records; a time row cannot invent that record.
const dated=content.replace('|主要负责|','|主要负责|日期|').replace('|甲|校对原文件|','|甲|校对原文件|2026-11-15|');
const data=parseTaskCanvas(event(dated)),taskId=data.tasks[0].id;
test('target time parsing keeps multiple same-date clocks and stops at a later dated phase',()=>{
 assert.deepEqual(plannedTimes('12:30首轮；16日16:00样片／19:00预算；17日10:00'),['12:30']);
 assert.deepEqual(plannedTimes('15:00首轮；17:00审计；17日18:00销项'),['15:00','17:00']);
 assert.deepEqual(plannedTimes('10:00复核；12:30／19:30发布'),['10:00','12:30','19:30']);
 assert.deepEqual(plannedTimes('25:00无效；9:30有效'),['09:30']);
});
test('explicit schedule fields preserve project, status and date without guessing completion',()=>{
 const task=data.tasks[0];assert.equal(task.team,'OPCB 团队');assert.deepEqual(task.times,['10:00']);assert.equal(task.project,'人员分工');assert.equal(task.status,'planning');
 assert.deepEqual(parseTaskCanvas(event(content)).tasks[0].times,[]);
 const other=dated.replace('|甲|校对原文件|2026-11-15|','|甲|校对原文件|2026-11-16|');assert.deepEqual(parseTaskCanvas(event(other)).tasks[0].times,[]);
 assert.throws(()=>parseTaskCanvas(event(dated.replace('2026-11-15|10:00','2026-02-30|10:00'))),/日期无效/);
});
test('checking and undo persist independently from acceptance and retain old reader compatibility',()=>{
 const checked=updateTaskCheck(data,taskId,true,actor,at);assert(checked.startsWith(dated));assert.deepEqual(executionRecords(checked),[]);
 const task=parseTaskCanvas(event(checked)).tasks[0];assert.equal(task.completed,false);assert.equal(task.status,'review');assert.equal(task.check.actor,actor);
 const undone=updateTaskCheck(parseTaskCanvas(event(checked)),taskId,false,actor,at);assert.equal(parseTaskCanvas(event(undone)).tasks[0].completed,false);assert.equal(checkRecords(undone).length,2);
 assert.throws(()=>updateTaskCheck({...data,tasks:[{...data.tasks[0],status:'done'}]},taskId,false,actor,at),/已验收/);
 assert.throws(()=>checkRecords(dated+CHECK_BEGIN),/不完整/);assert.throws(()=>checkRecords(dated+CHECK_END+CHECK_BEGIN),/不完整/);
});
function setup(){let writes=0,revoked=false;const session={viewer:actor,channels:{list:()=>({status:'ready',channels:revoked?[]:[{id:TASK_SOURCE,members:[actor]}]})},canvas:{available:true,read:async()=>({id,content:dated}),save:async(channel,next,expected,opts)=>{writes++;assert.equal(channel,TASK_SOURCE);assert.equal(expected,id);assert.deepEqual(opts,{preserveApproval:true});return {id:'c'.repeat(64),content:next,created_at:2};}}};return {session,writes:()=>writes,revoke:()=>{revoked=true;}};}
test('checkbox saves use native expected version, reject conflict/revocation and do not retry ambiguous writes',async()=>{
 const a=setup(),saved=await saveTaskCheck({...a,data,id:taskId,completed:true,check(){}});assert.equal(a.writes(),1);assert.equal(parseTaskCanvas(saved).tasks[0].completed,false);assert.equal(parseTaskCanvas(saved).tasks[0].status,'review');
 a.session.canvas.read=async()=>({id:'d'.repeat(64)});await assert.rejects(saveTaskCheck({...a,data,id:taskId,completed:false,check(){}}),/来源已变化/);assert.equal(a.writes(),1);
 const b=setup();b.session.canvas.read=async()=>{b.revoke();return {id};};await assert.rejects(saveTaskCheck({...b,data,id:taskId,completed:true,check(){}}),/不可保存/);assert.equal(b.writes(),0);
 const c=setup();let attempts=0;c.session.canvas.save=async()=>{attempts++;return {id:'d'.repeat(64),content:'wrong'};};await assert.rejects(saveTaskCheck({...c,data,id:taskId,completed:true,check(){}}),/未确认/);assert.equal(attempts,1);
});
test('execution channel choices admit only joined writable Solo and normal channels',()=>{
 const channel={channelType:'solo',members:[actor]};assert(canExecuteInChannel(channel,actor));assert(canExecuteInChannel({...channel,channelType:'stream'},actor));assert(canExecuteInChannel({...channel,channelType:'forum'},actor));
 for(const patch of [{readOnly:true},{archived:true},{cached:true},{pending:true},{metadataPending:true},{metadataCached:true},{members:[]},{channelType:'system'},{channelType:'dm'}])assert(!canExecuteInChannel({...channel,...patch},actor));
});
test('one task with multiple explicit clocks has several calendar occurrences and stays one task elsewhere',async()=>{
 const {taskOccurrences,sortByTime}=await import('../src/tasks/schedule.mjs');
 const task={id:'x',date:'2026-11-15',times:['10:00','19:30']},later={id:'y',date:'2026-11-15',times:['12:30']};
 assert.deepEqual(taskOccurrences([task]).map(t=>t.time),['10:00','19:30']);assert.deepEqual(sortByTime([later,task]).map(t=>t.id),['x','y']);assert.deepEqual(task.times,['10:00','19:30']);
});
