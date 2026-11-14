import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTaskCanvas,validDate} from '../src/tasks/live-model.mjs';
const event=content=>({id:'a'.repeat(64),created_at:1794660000,content});
const old='# 分工\n## 人员分工\n|负责人|主要工作|可检查的交付|\n|---|---|---|\n|甲|核对接口；记录问题|检查回执|\n';
const current='# 项目执行排期V1\n## 人员分工\n|人员|主要负责|边界|\n|---|---|---|\n|甲|核对接口|预算待确认|\n## 每日执行与验收\n### 上线前 D-1\n- **P01 10:00｜核对新方案**（甲＋乙）\n  交付：方案清单\n  验收：逐项有来源\n### 上线 D0\n- **P01 10:00｜核对新方案**（甲＋乙）\n  交付：方案清单\n  验收：逐项有来源\n';
test('legacy work baseline and current role schema retain truthful missing facts',()=>{
 const task=parseTaskCanvas(event(old)).tasks[0];assert.equal(task.assignee,'甲');assert.equal(task.status,'planning');assert.equal(task.progress,null);assert.equal(task.completionDefinition,'检查回执');
 const data=parseTaskCanvas(event(current));assert.equal(data.tasks.length,2);assert.equal(data.tasks[0].completionDefinition,'未登记');assert.equal(data.tasks[0].boundary,'预算待确认');
});
test('relative launch plans stay unscheduled; exact repeated plan IDs share one object',()=>{
 const plan=parseTaskCanvas(event(current)).tasks[1];assert.equal(plan.id,'plan-P01');assert.equal(plan.date,null);assert.equal(plan.slot,'10:00');assert.deepEqual(plan.phases,['上线前 D-1','上线 D0']);assert.equal(plan.completionDefinition,'方案清单');assert.equal(plan.acceptance,'逐项有来源');
});
test('conflicting duplicate IDs and malformed baselines fail without stale fallback',()=>{
 assert.throws(()=>parseTaskCanvas(event(current.replace('### 上线 D0\n- **P01 10:00｜核对新方案','### 上线 D0\n- **P01 10:00｜另一件事'))),/不同内容/);
 assert.throws(()=>parseTaskCanvas(event('# no table')),/缺少人员分工/);
 assert.throws(()=>parseTaskCanvas({...event(old),id:'wrong'}),/有效/);
 assert.throws(()=>parseTaskCanvas(event(old+'|甲|重复工作|交付|\n')),/重复姓名/);
});
test('only explicit, valid absolute dates become calendar dates',()=>{
 const source=old.replace('|可检查的交付|','|可检查的交付|计划日期|状态|').replace('|检查回执|','|检查回执|2026-11-15|进行中|');
 const task=parseTaskCanvas(event(source)).tasks[0];assert.equal(task.date,'2026-11-15');assert.equal(task.status,'doing');
 assert.throws(()=>parseTaskCanvas(event(source.replace('2026-11-15','2026-02-30'))),/日期无效/);
 assert(validDate('2024-02-29'));assert(!validDate('2026-02-29'));
});

test('IDs and explicit collaborator aliases are searchable without confusing a person with their agent', async()=>{
 const {filterTasks}=await import('../src/tasks/live-model.mjs');
 const tasks=[...['潘涛','潘涛 Studio','Moo（小莫）','Steven','周洋'].map(assignee=>({id:assignee,assignee,kind:'assignment'})),...['周洋 → 潘涛','Moo＋潘涛；Steven接入','Steven核账 → 潘涛决策','周洋＋Moo；Steven保障','潘涛 Studio'].map((assignee,i)=>({id:'plan-'+i,code:'P0'+i,assignee,kind:'plan'}))];
 assert.deepEqual(filterTasks(tasks,'','潘涛').map(t=>t.id),['潘涛','plan-0','plan-1','plan-2']);
 assert.deepEqual(filterTasks(tasks,'','Moo（小莫）').map(t=>t.id),['Moo（小莫）','plan-1','plan-3']);
 assert.deepEqual(filterTasks(tasks,' p01 ').map(t=>t.id),['plan-1']);
});
