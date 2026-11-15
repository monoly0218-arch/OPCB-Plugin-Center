import test from 'node:test';
import assert from 'node:assert/strict';
import {companyGroups,companySummary} from '../src/tasks/company-model.mjs';
import {parseTaskCanvas} from '../src/tasks/live-model.mjs';
import {createCompanyRefresh} from '../src/tasks/company-refresh.mjs';
const task=(id,status='todo',extra={})=>({id,status,assignee:'潘涛',project:'品牌',kind:'task',...extra});
test('summary uses lifecycle facts, excludes removals and distinguishes delivery from acceptance',()=>{
 const s=companySummary([task('doing','doing'),task('block','doing',{blockReason:'等待输入'}),task('review','review'),task('done','done'),task('removed','done',{removed:true}),task('unknown','planning')]);
 assert.deepEqual(s,{total:5,doing:1,blocked:1,review:1,done:1,unregistered:1});
});
test('person groups retain explicit collaborators and distinguish people from their agents',()=>{
 const tasks=[task('pantao','planning',{kind:'assignment'}),task('agent','planning',{assignee:'潘涛 Studio',kind:'assignment'}),task('moo','planning',{assignee:'Moo（小莫）',kind:'assignment'}),task('shared','doing',{assignee:'Moo＋潘涛',kind:'plan'}),task('new','review',{assignee:'新增执行人'}),task('deleted','done',{removed:true})];
 const groups=companyGroups(tasks,'people');
 assert.deepEqual(groups.find(g=>g.name==='潘涛').tasks.map(t=>t.id),['pantao','shared']);
 assert.deepEqual(groups.find(g=>g.name==='潘涛 Studio').tasks.map(t=>t.id),['agent']);
 assert.deepEqual(groups.find(g=>g.name==='Moo（小莫）').tasks.map(t=>t.id),['moo','shared']);
 assert.equal(groups.find(g=>g.name==='新增执行人').summary.review,1);
});
test('project groups preserve source names; each active item has one project',()=>{
 const groups=companyGroups([task('a'),task('b','review',{project:'另一项目'}),task('c','todo',{project:''})]);assert.deepEqual(groups.map(g=>g.name),['品牌','另一项目','未分组']);assert.equal(groups.reduce((n,g)=>n+g.summary.total,0),3);
});
test('the company reader is the task center canonical parser, preserving current revision',()=>{
 const actor='1'.repeat(64),agent='2'.repeat(64),at='2026-11-15T01:00:00.000Z';
 const events=[{event_id:'create',action:'create',task_id:'new',actor,at,revision:0,payload:{title:'任务',description:'实际工作',assignee:'执行人',team:'团队',project:'品牌',goal:'交付',reviewer:actor,executor:agent,executionKind:'agent',date:null}},{event_id:'start',action:'start',task_id:'new',actor:agent,at,revision:0,payload:{summary:'已实际开工'}}];
 const content='# 工作\n## 人员分工\n| 人员 | 主要负责 | 边界 |\n|---|---|---|\n| 执行人 | 交付 | 明确验收 |\n<!-- opcb-task-lifecycle-v1:begin -->\n## 任务事件\n```json\n'+JSON.stringify(events)+'\n```\n<!-- opcb-task-lifecycle-v1:end -->';
 const data=parseTaskCanvas({id:'a'.repeat(64),created_at:1794700000,content});assert.equal(data.tasks.find(t=>t.id==='new').status,'doing');assert.equal(companySummary(data.tasks).done,0);
});
test('automatic/manual/live refreshes serialize reads and cleanup drops late results',async()=>{
 let calls=0,resolve;const states=[];const c=createCompanyRefresh({read:()=>{calls++;return new Promise(r=>resolve=r);},onState:s=>states.push(s),schedule:()=>1,cancel:()=>{}});
 const p=c.refresh();await Promise.resolve();c.refresh();assert.equal(calls,1);c.dispose();resolve({tasks:[]});await p;assert.equal(states.filter(s=>s.data).length,0);
});

test('business projects contain phases; source task IDs and execution facts stay unchanged',async()=>{
 const {companyTasks,companyStages}=await import('../src/tasks/company-model.mjs');
 const original=[task('role','planning',{kind:'assignment',project:'人员分工'}),task('plan','doing',{kind:'plan',project:'上线前／上线D0',phases:['上线前','上线D0'],date:'2026-11-17'}),task('new','review',{project:'另一业务项目'})];
 const before=JSON.stringify(original),view=companyTasks({title:'OPCB 平台商业化计划与报告',tasks:original});
 assert.deepEqual(companyGroups(view).map(g=>g.name),['OPCB 平台商业化','另一业务项目']);
 assert.deepEqual(companyStages(view),['人员分工','上线前','上线D0']);
 assert.equal(view[1].id,'plan');assert.equal(view[1].status,'doing');assert.equal(view[1].date,'2026-11-17');assert.equal(view[1].project,'上线前／上线D0');assert.equal(JSON.stringify(original),before);
 assert.equal(companyTasks({title:'未确认来源',tasks:[original[1]]})[0].businessProject,'未归属项目');
});
test('one employee card uses explicit identities, expired/ambiguous status stays unknown',async()=>{
 const {companyPeople}=await import('../src/tasks/company-people.mjs');
 const a='1'.repeat(64),b='2'.repeat(64),profiles=new Map([[a,{name:'Moo'}],[b,{name:'潘涛 Studio',isAgent:true}]]),statuses=new Map([[a,{userId:a,text:'在公司',updatedAt:100,expiresAt:200}]]);
 let data=companyPeople(['Moo（小莫）','潘涛 Studio'],[a,b],profiles,statuses,150);assert.equal(data['Moo（小莫）'].presence.text,'在公司');assert.equal(data['潘涛 Studio'].isAgent,true);
 assert.equal(companyPeople(['Moo'],[a],profiles,statuses,201).Moo.presence,null);
 profiles.set(b,{name:'Moo'});assert.equal(companyPeople(['Moo'],[a,b],profiles,statuses,150).Moo.presence,null);
 statuses.set(a,{userId:b,text:'在公司',updatedAt:100});assert.equal(companyPeople(['Moo'],[a],profiles,statuses,150).Moo.presence,null);
});
test('employee task progress excludes role rows and never turns planning into active work',async()=>{
 const {personWork}=await import('../src/tasks/company-people.mjs');
 const result=personWork([task('role','planning',{kind:'assignment'}),task('plan','planning',{kind:'plan'}),task('active','doing'),task('done','done'),task('removed','doing',{removed:true})]);
 assert.equal(result.total,3);assert.equal(result.done,1);assert.equal(result.unknown,1);assert.deepEqual(result.current.map(t=>t.id),['active']);
});

test('slash collaboration belongs to both known people without splitting registered aliases',()=>{
 const tasks=[task('pantao','planning',{kind:'assignment'}),task('runner','planning',{kind:'assignment',assignee:'小跑／夏明升'}),task('joint','doing',{kind:'plan',assignee:'潘涛／小跑'})];
 const groups=companyGroups(tasks,'people');assert.equal(groups.length,2);assert.deepEqual(groups.find(g=>g.name==='小跑／夏明升').tasks.map(t=>t.id),['runner','joint']);assert.deepEqual(groups.find(g=>g.name==='潘涛').tasks.map(t=>t.id),['pantao','joint']);
});
