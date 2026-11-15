import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReportData} from '../src/commercial/model.mjs';
import {FLOW_BEGIN,FLOW_END} from '../src/tasks/lifecycle.mjs';
const actor='1'.repeat(64),agent='2'.repeat(64),taskId='agent-sync',at='2026-11-14T12:00:00.000Z';
const baseline='# 合成测试\n## 人员分工\n| 人员 | 主要负责 | 边界 |\n|---|---|---|\n| 合成成员 | 制作测试样片 | 隔离测试 |\n';
const create={title:'新增Agent交付',description:'隔离测试',assignee:'执行Agent',team:'测试',project:'品牌',goal:'可读交付',reviewer:actor,executionKind:'agent',executor:agent,date:null};
const event=(action,payload={},revision=0)=>({event_id:'event-'+action,task_id:taskId,action,actor:action==='accept'?actor:agent,at,revision,payload});
const created=event('create',create),start=event('start',{summary:'实际开工'}),delivery=event('deliver',{url:'https://example.com/new',evidence:'buzz://message?id='+actor,version:'v2',summary:'当前交付'});
export function reportFor(events){return buildReportData({id:'a'.repeat(64),created_at:1794700000,content:baseline+'\n'+FLOW_BEGIN+'\n## 任务事件\n```json\n'+JSON.stringify(events)+'\n```\n'+FLOW_END});}
const task=report=>report.tasks.find(t=>t.id===taskId);
test('new undated Agent task is included; start, delivery and acceptance remain distinct',()=>{
 let r=reportFor([created]);assert.equal(task(r).status,'todo');assert.equal(task(r).date,null);assert.equal(r.progress.total,2);
 r=reportFor([created,start]);assert.equal(task(r).status,'doing');assert.equal(r.progress.accepted,0);
 r=reportFor([created,start,delivery]);assert.equal(task(r).status,'review');assert.equal(task(r).delivery.version,'v2');assert.equal(r.progress.review,1);assert.equal(r.progress.completed,0);
 r=reportFor([created,start,delivery,event('accept',{version:'v2',delivery:delivery.payload.url,source:'本人核对'})]);assert.equal(task(r).status,'done');assert.equal(r.progress.accepted,1);assert.equal(r.progress.completed,1);assert.equal(task(r).acceptance,'本人已确认当前交付');
});
test('reschedule overrides dates and clocks; unscheduling clears the dated timeline',()=>{
 const r=reportFor([created,start,event('reschedule',{date:'2026-12-03',times:['14:30']})]);assert.equal(task(r).date,'2026-12-03');assert.equal(task(r).time,'14:30');assert.deepEqual(r.dates,['2026-12-03']);
 const r2=reportFor([created,event('reschedule',{date:null,times:[]})]);assert.equal(task(r2).date,null);assert.deepEqual(r2.dates,[]);
});
test('removed tasks disappear from timeline and all counts; restore keeps ID and revision',()=>{
 const removed=event('remove');let r=reportFor([created,start,delivery,removed]);assert.equal(task(r),undefined);assert.equal(r.progress.total,1);assert.equal(r.progress.review,0);
 r=reportFor([created,start,delivery,removed,event('restore',{},1)]);assert.equal(task(r).id,taskId);assert.equal(task(r).revision,2);assert.equal(task(r).status,'todo');assert.equal(task(r).delivery,null);
});
test('revision changes discard previous delivery; blocked and reopen do not imply completion',()=>{
 let r=reportFor([created,start,event('blocked',{summary:'供应商未返回'})]);assert.equal(task(r).blockReason,'供应商未返回');assert.equal(r.progress.accepted,0);
 r=reportFor([created,start,delivery,event('revise',{summary:'修改交付'})]);assert.equal(task(r).revision,1);assert.equal(task(r).delivery,null);assert.equal(task(r).status,'todo');assert.equal(r.progress.review,0);
});
test('malformed lifecycle data fails closed instead of showing stale baseline progress',()=>{
 assert.throws(()=>reportFor([created,created]),/重复/);
 assert.throws(()=>reportFor([created,event('start',{summary:'wrong'},2)]),/轮次/);
});
