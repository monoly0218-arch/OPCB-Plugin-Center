import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReportData,reportRecord,readReportSource,saveSharedReport,REPORT_BEGIN,REPORT_END,TASK_SOURCE} from '../src/commercial/model.mjs';
import {createReportRefresh} from '../src/commercial/refresh.mjs';
const actor='1'.repeat(64),id='a'.repeat(64),at='2026-11-15T01:00:00.000Z';
const original=`# 合成测试计划
## 人员分工
| 人员 | 主要负责 | 边界 |
|---|---|---|
| 合成成员 | 制作测试样片 | 仅隔离测试 |
## 每日执行与验收
### 准备
- **P01 10:00｜测试交付**（合成成员）
  交付：合成证据
  验收：本人核对
## 全部任务时间表（目标节点）
| 编号/人员 | 日期 | 时间/持续安排 | 团队 |
|---|---|---|---|
| P01 | 2026-11-17 | 10:00 | 测试团队 |
`;
const execution=[{id:'plan-P01',status:'review',date:'2026-11-17',delivery:'https://example.com/result',acceptance:'待本人验收',actor,at}];
const content=original+'\n<!-- opcb-task-execution-v1:begin -->\n## 任务执行记录\n```json\n'+JSON.stringify(execution)+'\n```\n<!-- opcb-task-execution-v1:end -->\n<!-- opcb-task-checks-v1:begin -->\n## 任务勾选记录\n```json\n'+JSON.stringify([{id:'plan-P01',completed:true,actor,at}])+'\n```\n<!-- opcb-task-checks-v1:end -->';
const event={id,content,created_at:1794700000};
const block=value=>REPORT_BEGIN+'\n```json\n'+JSON.stringify(value)+'\n```\n'+REPORT_END;
function fixture(){let roster={status:'ready',channels:[{id:TASK_SOURCE,members:[actor]}]};const session={viewer:actor,channels:{list:()=>roster},canvas:{available:true,read:async()=>event}};const connection={status:'ready',scope:'test',generation:1,session};let current=connection;return {connection,current:()=>current,setCurrent:v=>current=v,setRoster:v=>roster=v,collection:{preferences:{get:async()=>null}}};}
test('same task IDs, record dates, evidence and check marks; work is not acceptance',()=>{const result=buildReportData(event);const t=result.tasks.find(t=>t.id==='plan-P01');assert.equal(t.completed,false);assert.equal(t.status,'review');assert.equal(t.date,'2026-11-17');assert.equal(t.time,'10:00');assert.equal(t.execution.delivery,'https://example.com/result');assert.equal(result.progress.accepted,0);assert.equal(result.metrics.paidUsers,undefined);});
test('shared real zero differs from missing, and shared records override local estimates',()=>{const result=buildReportData({...event,content:content+'\n'+block({schema:1,metrics:{paidUsers:0,revenue:0},asOf:'2026-11-15',evidence:'https://example.com/ledger'})});assert.equal(result.metrics.paidUsers,0);assert.equal(result.metrics.refunds,null);assert.equal(result.metricSource,'共享记录');});
test('unverified actual data, injected duplicate markers and negative counts fail closed',()=>{assert.throws(()=>reportRecord(block({schema:1,metrics:{paidUsers:3}})));assert.throws(()=>reportRecord(block({schema:1,metrics:{paidUsers:-1},asOf:'2026-11-15',evidence:'https://example.com'})));assert.throws(()=>reportRecord(block({schema:1,metrics:{}})+'\n'+REPORT_END));});
test('permission revoked while source read is pending cannot release the old data',async()=>{const f=fixture();let finish;f.connection.session.canvas.read=()=>new Promise(r=>finish=r);const reading=readReportSource(f.connection,f.current,f.collection);f.setRoster({status:'ready',channels:[]});finish(event);await assert.rejects(reading,/无权/);});
test('account generation change and cached membership deny source data',async()=>{const f=fixture();f.setCurrent({...f.connection,generation:2});await assert.rejects(readReportSource(f.connection,f.current,f.collection),/已变化/);f.setCurrent(f.connection);f.setRoster({status:'ready',channels:[{id:TASK_SOURCE,members:[actor],metadataCached:true}]});await assert.rejects(readReportSource(f.connection,f.current,f.collection),/无权/);});
test('conflicting shared save never writes or mutates task execution or the draft',async()=>{const f=fixture();let writes=0;f.connection.session.canvas.read=async()=>({...event,id:'b'.repeat(64)});f.connection.session.canvas.save=async()=>writes++;const record={schema:1,metrics:{},asOf:'',evidence:''};const before=JSON.stringify(record);await assert.rejects(saveSharedReport({...f,current:f.current,data:{revision:id},record}),/来源已变化/);assert.equal(writes,0);assert.equal(JSON.stringify(record),before);});
test('shared save preserves the whole task source and confirms by reading back',async()=>{const f=fixture();let head=event,calls=[];f.connection.session.canvas.read=async()=>head;f.connection.session.canvas.save=async(ch,next,expected,options)=>{calls.push({ch,expected,options});head={...event,id:'b'.repeat(64),content:next};return head;};const saved=await saveSharedReport({connection:f.connection,current:f.current,data:{revision:id},record:{schema:1,metrics:{},asOf:'',evidence:''}});assert.ok(saved.content.startsWith(event.content+'\n\n'));assert.deepEqual(calls,[{ch:TASK_SOURCE,expected:id,options:{preserveApproval:true}}]);assert.deepEqual(buildReportData(saved).tasks,buildReportData(event).tasks);});
test('read-only channel cannot write a shared report',async()=>{const f=fixture();f.setRoster({status:'ready',channels:[{id:TASK_SOURCE,members:[actor],readOnly:true}]});await assert.rejects(saveSharedReport({connection:f.connection,current:f.current,data:{revision:id},record:{schema:1,metrics:{}}}),/不可保存/);});
test('refresh coalesces concurrent signals, rereads once, and disposal suppresses late results',async()=>{let reads=0,resolveFirst,resolveSecond;const states=[];const c=createReportRefresh({read:()=>{reads++;return new Promise(r=>{if(reads===1)resolveFirst=r;else resolveSecond=r;});},onState:s=>states.push(s),schedule:()=>1,cancel:()=>{}});const first=c.refresh();c.refresh();await Promise.resolve();assert.equal(reads,1);resolveFirst({revision:'one'});await first;await Promise.resolve();assert.equal(reads,2);c.dispose();const before=states.length;resolveSecond({revision:'two'});await new Promise(r=>setImmediate(r));assert.equal(states.length,before);});
test('a synchronous reader exception does not permanently lock manual refresh',async()=>{let count=0;const c=createReportRefresh({read:()=>{count++;throw Error('offline');},onState:()=>{},schedule:()=>1,cancel:()=>{}});await c.refresh();await c.refresh();assert.equal(count,2);c.dispose();});
test('daily saves retain prior days and replace the current date without changing task records',async()=>{
 const f=fixture();let head={...event,content:event.content+'\n'+block({schema:1,metrics:{arrivals:3},asOf:'2026-11-16',evidence:'https://example.com/16'})};
 f.connection.session.canvas.read=async()=>head;f.connection.session.canvas.save=async(ch,next,expected)=>{assert.equal(expected,head.id);head={...head,id:'c'.repeat(64),content:next};return head;};
 const save=arrivals=>saveSharedReport({connection:f.connection,current:f.current,data:{revision:head.id},record:{schema:1,metrics:{arrivals},asOf:'2026-11-17',evidence:'https://example.com/17'}});
 await save(0);await save(2);const record=reportRecord(head.content);assert.deepEqual(record.history.map(x=>[x.date,x.metrics.arrivals]),[['2026-11-16',3],['2026-11-17',2]]);assert.deepEqual(buildReportData(head).tasks,buildReportData(event).tasks);
});
