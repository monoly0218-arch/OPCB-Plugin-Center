import test from 'node:test';
import assert from 'node:assert/strict';
import {executionRecords,updateExecution,saveExecution,BEGIN,END} from '../src/tasks/execution.mjs';
import {parseTaskCanvas,TASK_SOURCE} from '../src/tasks/live-model.mjs';
const owner='a'.repeat(64),id='b'.repeat(64),at='2026-11-14T20:00:00.000Z';
const content='# 基线\n## 人员分工\n|人员|主要负责|边界|\n|---|---|---|\n|甲|核对|未批准|\n';
const data=parseTaskCanvas({id,created_at:1,content}),taskId=data.tasks[0].id;
const draft={status:'review',date:'2026-11-15',delivery:'https://example.com/result',acceptance:'待本人核验'};
function setup(){let saved=0;const session={viewer:owner,channels:{list:()=>({status:'ready',channels:[{id:TASK_SOURCE,members:[owner],creator:owner}]})},canvas:{available:true,read:async()=>({id,content}),save:async(channel,next,expected,options)=>{assert.equal(channel,TASK_SOURCE);assert.equal(expected,id);assert.deepEqual(options,{preserveApproval:true});saved++;return {id:'c'.repeat(64),content:next,created_at:2};}}};return {session,count:()=>saved};}
test('execution records preserve the plan byte-for-byte and project only explicit facts',()=>{
 const updated=updateExecution(data,taskId,draft,owner,true,at);
 assert(updated.startsWith(content+'\n\n'));
 const parsed=parseTaskCanvas({id,created_at:1,content:updated});
 assert.equal(parsed.tasks[0].date,draft.date);assert.equal(parsed.tasks[0].status,'review');assert.equal(parsed.tasks[0].progress,null);
 assert.equal(parsed.tasks[0].boundary,'未批准');
 const next=updateExecution(parsed,taskId,{...draft,status:'done',acceptance:'检查通过'},owner,true,at);
 assert.equal(executionRecords(next).length,2);
 assert.equal(executionRecords(next)[0].status,'review');
});
test('rejects malformed records, dates, credential links, missing delivery and unauthorized acceptance',()=>{
 for(const change of [{date:'2026-02-30'},{status:'done',acceptance:''},{delivery:'javascript:alert(1)'},{delivery:''},{delivery:'https://a.test/?token=secret'},{acceptance:BEGIN}])assert.throws(()=>updateExecution(data,taskId,{...draft,...change},owner,true,at));
 assert.throws(()=>updateExecution(data,taskId,{...draft,status:'done'},owner,false,at),/创建者/);
 assert.throws(()=>executionRecords(content+BEGIN),/不完整/);
 assert.throws(()=>executionRecords(content+END+BEGIN),/不完整/);
});
test('real save requires current access and expected revision, and checks the accepted readback',async()=>{
 const {session,count}=setup();let checks=0;
 const saved=await saveExecution({session,check:()=>checks++,data,id:taskId,draft});
 assert.equal(saved.id,'c'.repeat(64));assert.equal(count(),1);assert(checks>=3);
 session.canvas.read=async()=>({id:'d'.repeat(64),content});
 await assert.rejects(saveExecution({session,check:()=>{},data,id:taskId,draft}),/草稿已保留/);assert.equal(count(),1);
});
test('revocation during read, rejected CAS and ambiguous receipt do not turn into success or automatic retry',async()=>{
 const {session,count}=setup();session.canvas.read=async()=>{session.channels.list=()=>({status:'ready',channels:[]});return {id,content};};
 await assert.rejects(saveExecution({session,check:()=>{},data,id:taskId,draft}),/不可保存/);assert.equal(count(),0);
 const a=setup();let attempts=0;a.session.canvas.save=async()=>{attempts++;throw Error('CAS conflict');};
 await assert.rejects(saveExecution({session:a.session,check:()=>{},data,id:taskId,draft}),/CAS conflict/);assert.equal(attempts,1);
 a.session.canvas.save=async()=>({id,content:'different'});
 await assert.rejects(saveExecution({session:a.session,check:()=>{},data,id:taskId,draft}),/未确认/);
});
