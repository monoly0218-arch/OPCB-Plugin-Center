import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/store.mjs';
import {demoState} from '../server/seed.mjs';
const owner={actor:'owner',role:'owner'},viewer={actor:'viewer',role:'viewer'};
const task={sourceId:'work-1',title:'同一任务跨天',projectId:'brand',assigneeId:'tao',status:'todo',dates:['2026-11-16','2026-11-17']};
const request=(id='request-1',revision=0)=>({requestId:id,expectedRevision:revision,action:'upsert',sourceKey:'weekly-import',tasks:[task],plan:{sourceId:'week-1',title:'周计划',weekStart:'2026-11-16'}});
function fixture(){const path=join(mkdtempSync(join(tmpdir(),'team-calendar-test-')),'test.sqlite');return {path,store:openStore(path,demoState())};}

test('跨天安排引用唯一任务，重复来源更新原记录',()=>{
  const {store}=fixture();try{const before=store.read(owner).tasks.length;store.mutate(owner,request());const first=store.read(owner),id=first.tasks.find(t=>t.sourceId==='work-1').id;
  assert.equal(first.tasks.length,before+1);assert.equal(first.allocations.filter(a=>a.taskId===id).length,2);
  store.mutate(owner,{...request('request-2',1),tasks:[{...task,title:'更新后的工作'}]});
  const second=store.read(owner);assert.equal(second.tasks.length,before+1);assert.equal(second.tasks.find(t=>t.sourceId==='work-1').id,id);assert.equal(second.plans.filter(p=>p.title==='周计划').length,1);
  }finally{store.close();}
});
test('同一个请求重试返回原回执，不新增版本',()=>{const {store}=fixture();try{const r=request();assert.equal(store.mutate(owner,r).revision,1);assert.equal(store.mutate(owner,r).replayed,true);assert.equal(store.read(owner).revision,1);assert.equal(store.operation(owner,'request-1').saved,true);}finally{store.close();}});
test('同一请求 ID 不能携带不同内容',()=>{const {store}=fixture();try{store.mutate(owner,request());assert.throws(()=>store.mutate(owner,{...request(),tasks:[{...task,title:'不同内容'}]}),/标识/);}finally{store.close();}});
test('不同客户端版本冲突不覆盖已有编辑',()=>{const {store,path}=fixture(),second=openStore(path,demoState());try{const original=second.read(owner);store.mutate(owner,request());assert.throws(()=>second.mutate(owner,{...request('concurrent',original.revision),tasks:[{...task,title:'另一端旧草稿'}]}),/已被更新/);assert.equal(second.read(owner).tasks.find(t=>t.sourceId==='work-1').title,task.title);}finally{second.close();store.close();}});
test('批量中一项非法，整批与回执均不保存',()=>{const {store}=fixture();try{const count=store.read(owner).tasks.length;assert.throws(()=>store.mutate(owner,{...request(),tasks:[task,{...task,sourceId:'invalid',projectId:'missing'}]}),/项目不存在/);assert.equal(store.read(owner).revision,0);assert.equal(store.read(owner).tasks.length,count);assert.throws(()=>store.operation(owner,'request-1'),/尚未保存/);}finally{store.close();}});
test('数据库重新打开后保留任务、版本与原回执',()=>{const {store,path}=fixture();store.mutate(owner,request());store.close();const next=openStore(path,demoState());try{assert.equal(next.read(owner).revision,1);assert.equal(next.mutate(owner,request()).replayed,true);assert.equal(next.read(viewer).tasks.some(t=>t.sourceId==='work-1'),true);}finally{next.close();}});
test('viewer 可读但不能写或查看他人操作回执',()=>{const {store}=fixture();try{store.mutate(owner,request());assert.ok(store.read(viewer).tasks.length);assert.throws(()=>store.mutate(viewer,request('viewer',1)),/编辑权限/);assert.throws(()=>store.operation(viewer,'request-1'),/无权/);}finally{store.close();}});
test('无效日期和倒置时间被拒绝',()=>{const {store}=fixture();try{for(const dates of [['2026-02-30'],['bad-date'],[{date:'2026-11-16',start:'15:00',end:'14:00'}]])assert.throws(()=>store.mutate(owner,{...request(),tasks:[{...task,dates}]}));assert.equal(store.read(owner).revision,0);}finally{store.close();}});
test('修改多日任务状态不复制身份，改期只更新关联',()=>{const {store}=fixture();try{store.mutate(owner,request());const s=store.read(owner),t=s.tasks.find(t=>t.sourceId==='work-1'),a=s.allocations.filter(a=>a.taskId===t.id);store.mutate(owner,{action:'update',taskId:t.id,changes:{status:'review'},allocations:a.map((x,i)=>i?x:{...x,date:'2026-11-18'}),expectedRevision:1,requestId:'move'});const next=store.read(owner);assert.equal(next.tasks.find(x=>x.id===t.id).status,'review');assert.equal(next.allocations.filter(x=>x.taskId===t.id).length,2);assert.ok(next.allocations.some(x=>x.id===a[0].id&&x.date==='2026-11-18'));}finally{store.close();}});
test('重复批次来源 ID 和跨任务日程 ID 被拒绝',()=>{const {store}=fixture();try{assert.throws(()=>store.mutate(owner,{...request(),tasks:[task,task]}),/不能重复/);const s=store.read(owner);assert.throws(()=>store.mutate(owner,{action:'update',taskId:s.tasks[0].id,changes:{},allocations:[{id:s.allocations[1].id,date:'2026-11-17'}],expectedRevision:0,requestId:'bad-slot'}),/ID 重复/);}finally{store.close();}});
test('项目成员配置保留 ID，不能移除有任务关联的成员',()=>{const {store}=fixture();try{const s=store.read(owner);const r={action:'configure',requestId:'config',expectedRevision:0,members:s.members,projects:s.projects.map((p,i)=>i? p:{...p,name:'改名项目'})};store.mutate(owner,r);assert.equal(store.read(owner).projects[0].id,s.projects[0].id);assert.equal(store.read(owner).projects[0].name,'改名项目');assert.throws(()=>store.mutate(owner,{...r,requestId:'bad-config',expectedRevision:1,members:s.members.slice(1)}),/不能移除/);}finally{store.close();}});
