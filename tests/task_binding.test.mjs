import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingRecords,saveTaskBinding} from '../src/tasks/task-binding.mjs';
import {parseTaskCanvas,TASK_SOURCE} from '../src/tasks/live-model.mjs';
import {saveHumanFlow} from '../src/tasks/lifecycle.mjs';
import {clampSplit,splitBounds,SPLIT_GUTTER} from '../src/tasks/split-pane.mjs';
const viewer='a'.repeat(64),agent='b'.repeat(64);
function fixture(){
 let head={id:'c'.repeat(64),created_at:1,content:'# 任务绑定\n## 人员分工\n|人员|主要负责|\n|---|---|\n|甲|整理方案|\n|乙|制作样片|\n'},writes=0;
 const channels=[{id:TASK_SOURCE,creator:viewer,channelType:'stream',members:[viewer,agent]},...['solo-a','solo-b'].map(id=>({id,creator:viewer,channelType:'solo',private:true,members:[viewer,agent]}))];
 const session={viewer,channels:{list:()=>({status:'ready',channels})},canvas:{available:true,read:async()=>head,save:async(channel,content,expected,options)=>{assert.equal(channel,TASK_SOURCE);assert.equal(expected,head.id);assert.deepEqual(options,{preserveApproval:true});writes++;head={id:writes.toString(16).padStart(64,'0'),content,created_at:writes+1};return head;}}};
 const read=async()=>parseTaskCanvas(head),run=(taskId,channelId)=>saveTaskBinding({session,check(){},read,taskId,channelId,expectedRevision:0});
 return {session,channels,read,run,head:()=>head,replace:v=>head=v,count:()=>writes};
}
test('each task persists its own last explicit channel without changing work, revision or original text',async()=>{
 const f=fixture(),before=f.head().content,[a,b]=(await f.read()).tasks;
 await f.run(a.id,'solo-a');await f.run(b.id,'solo-b');
 let tasks=(await f.read()).tasks;assert.deepEqual(tasks.map(t=>t.executionChannel),['solo-a','solo-b']);
 await f.run(a.id,'solo-b');tasks=(await f.read()).tasks;assert.deepEqual(tasks.map(t=>t.executionChannel),['solo-b','solo-b']);
 assert.equal(tasks[0].status,a.status);assert.equal(tasks[0].revision,0);assert(f.head().content.startsWith(before));assert.equal(bindingRecords(f.head().content).length,2);
 const n=f.count();await f.run(a.id,'solo-b');assert.equal(f.count(),n);
 await f.run(a.id,'');assert.equal((await f.read()).tasks[0].executionChannel,'');assert.equal((await f.read()).tasks[1].executionChannel,'solo-b');
});
test('binding cannot be saved by another reviewer or to an inaccessible, cached or read-only channel',async()=>{
 for(const mutate of [f=>f.session.viewer=agent,f=>f.channels[1].members=[agent],f=>f.channels[1].cached=true,f=>f.channels[1].readOnly=true,f=>f.channels[0].members=[]]){
  const f=fixture();mutate(f);await assert.rejects(f.run('baseline-%E7%94%B2','solo-a'));assert.equal(f.count(),0);
 }
});
test('removed/revised tasks and CAS conflicts prevent a route write',async()=>{
 const f=fixture(),data=await f.read(),taskId=data.tasks[0].id;
 f.replace(await saveHumanFlow({session:f.session,check(){},data,ids:[taskId],action:'remove'}));
 await assert.rejects(f.run(taskId,'solo-a'),/移除/);
 const g=fixture();await assert.rejects(saveTaskBinding({session:g.session,check(){},read:g.read,taskId,channelId:'solo-a',expectedRevision:1}),/轮次/);
 const h=fixture(),stale=await h.read();h.replace({...h.head(),id:'d'.repeat(64)});
 await assert.rejects(saveTaskBinding({session:h.session,check(){},read:async()=>stale,taskId,channelId:'solo-a',expectedRevision:0}),/来源已变化/);assert.equal(h.count(),0);
});
test('revocation during fresh read and ambiguous save receipt do not report success or retry',async()=>{
 const f=fixture(),id=(await f.read()).tasks[0].id;
 f.session.canvas.read=async()=>{f.channels[1].members=[];return f.head();};await assert.rejects(f.run(id,'solo-a'),/不可访问/);assert.equal(f.count(),0);
 const g=fixture();let attempts=0;g.session.canvas.save=async()=>{attempts++;return {...g.head(),content:'different'};};await assert.rejects(g.run(id,'solo-a'),/未确认/);assert.equal(attempts,1);
});
test('malformed or duplicate route records fail closed',async()=>{
 const f=fixture();await f.run((await f.read()).tasks[0].id,'solo-a');const row=bindingRecords(f.head().content)[0];
 const block=rows=>'<!-- opcb-task-bindings-v1:begin -->\n## 最近绑定的执行会话\n```json\n'+JSON.stringify(rows)+'\n```\n<!-- opcb-task-bindings-v1:end -->';
 assert.throws(()=>bindingRecords(block([row,row])),/无效/);
 assert.throws(()=>bindingRecords(block([{...row,channel_id:'https://evil'}])),/无效/);
 assert.throws(()=>bindingRecords('<!-- opcb-task-bindings-v1:begin -->'),/不完整/);
});
test('explicit binding wins over the original dedicated Solo, including explicit clearing',async()=>{
 const f=fixture();await f.run((await f.read()).tasks[0].id,'solo-a');const task=(await f.read()).tasks[0];
 const {projectTaskBindings}=await import('../src/tasks/task-binding.mjs');
 assert.equal(projectTaskBindings([{id:task.id,executionChannel:'original-solo',executionSolo:{solo_id:'original-solo'}}],f.head().content)[0].executionChannel,'solo-a');
 await f.run(task.id,'');assert.equal(projectTaskBindings([{id:task.id,executionChannel:'original-solo'}],f.head().content)[0].executionChannel,'');
});
test('split limits keep both panes readable at desktop and extreme drag positions',()=>{
 for(const width of [901,1024,1440,1920]){
  const [min,max]=splitBounds(width);assert((width-SPLIT_GUTTER)*min>=299.9);assert((width-SPLIT_GUTTER)*(1-max)>=299.9);
  assert.equal(clampSplit(-1,width),min);assert.equal(clampSplit(2,width),max);assert.equal(clampSplit(NaN,width),.6);
 }
});
