import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskSolo,soloRecords} from '../src/tasks/task-solo.mjs';
import {parseTaskCanvas,TASK_SOURCE} from '../src/tasks/live-model.mjs';
import {saveHumanFlow} from '../src/tasks/lifecycle.mjs';
const owner='a'.repeat(64),agent='b'.repeat(64);
function fixture(){
 let head={id:'c'.repeat(64),created_at:1,content:'# Solo测试\n## 人员分工\n|人员|主要负责|\n|---|---|\n|测试人|验证专属Solo|\n'},saves=0,starts=0,fail=false,denied=false,badCreator=false;
 const source={id:TASK_SOURCE,creator:owner,members:[owner,agent],channelType:'stream'};
 const channels=[source],pending=new Map(),failed=new Set(),seen=[];
 const session={viewer:owner,channels:{list:()=>({status:'ready',channels:denied?[]:channels})},canvas:{available:true,read:async()=>head,save:async(channel,content,expected)=>{assert.equal(channel,TASK_SOURCE);assert.equal(expected,head.id);saves++;head={id:saves.toString(16).padStart(64,'0'),content,created_at:saves+1};return head;}},channelWrites:{available:true,start(id,title,members,ttl,named,setup,options){assert(options.active());assert.equal(ttl,undefined);assert.equal(named,true);assert.equal(setup,undefined);starts++;seen.push({id,title,members});const create=starts.toString(16).padStart(64,'0');const ready=Promise.resolve().then(()=>{if(fail){failed.add(create);throw Error('Relay refused');}if(!channels.some(c=>c.id===id))channels.push({id,name:title,creator:badCreator?agent:owner,members:[owner,...members],private:true,channelType:'solo'});});pending.set(id,ready);ready.catch(()=>{}).finally(()=>pending.delete(id));return {create,ready};},starting:id=>pending.get(id),failed:id=>failed.has(id),delivered:async id=>{if(failed.has(id))throw Error('Relay refused');},refresh:async id=>{if(!channels.some(c=>c.id===id))throw Error('Membership unconfirmed');}},agentChoices:{snapshot:()=>({selectable:[{pubkey:agent}]})}};
 const read=async()=>parseTaskCanvas(head),id=parseTaskCanvas(head).tasks[0].id;
 return {session,read,id,run:()=>createTaskSolo({session,check(){},read,taskId:id,expectedRevision:0}),head:()=>head,replace:e=>head=e,counts:()=>({saves,starts}),seen,channels,fail:v=>fail=v,deny:()=>denied=true,badCreator:v=>badCreator=v};
}
test('New Solo creates a private task route without messages, status change or duplicate chats',async()=>{
 const f=fixture(),before=(await f.read()).tasks[0],result=await f.run(),after=result.data.tasks[0];
 assert.equal(after.status,before.status);assert.equal(after.revision,0);assert.equal(after.executionChannel,result.channelId);assert.equal(after.executionSolo.phase,'ready');assert.equal(f.counts().starts,1);assert.deepEqual(f.seen[0].members,[]);
 assert.deepEqual(soloRecords(f.head().content).map(x=>x.phase),['reserved','submitted','ready']);
 const again=await f.run();assert.equal(again.channelId,result.channelId);assert(again.reused);assert.equal(f.counts().starts,1);
 assert(f.head().content.startsWith('# Solo测试\n'));assert.equal(result.data.tasks.length,1);
});
test('two concurrent requests do not reserve or create two Solo identities',async()=>{
 const f=fixture();const outcomes=await Promise.allSettled([f.run(),f.run()]);assert(outcomes.some(x=>x.status==='fulfilled'));assert.equal(f.counts().starts,1);assert.equal(new Set(f.seen.map(x=>x.id)).size,1);
});
test('source denial and non-reviewers cannot create a chat',async()=>{
 const f=fixture();f.deny();await assert.rejects(f.run(),/不能建立/);assert.equal(f.counts().starts,0);
 const other=fixture();other.session.viewer=agent;await assert.rejects(other.run(),/仅本人/);assert.equal(other.counts().starts,0);
});
test('removed or revised tasks block creation before any external operation',async()=>{
 const f=fixture(),data=await f.read();f.replace(await saveHumanFlow({session:f.session,check(){},data,ids:[f.id],action:'remove'}));
 await assert.rejects(f.run(),/移除/);assert.equal(f.counts().starts,0);
 const g=fixture();await assert.rejects(createTaskSolo({session:g.session,check(){},read:g.read,taskId:g.id,expectedRevision:1}),/轮次/);assert.equal(g.counts().starts,0);
});
test('a known refused create retries the same reserved UUID and records the new operation',async()=>{
 const f=fixture();f.fail(true);await assert.rejects(f.run(),/Relay refused/);const id=soloRecords(f.head().content)[0].solo_id;assert.equal((await f.read()).tasks[0].executionChannel,undefined);
 f.fail(false);const result=await f.run();assert.equal(result.channelId,id);assert.equal(f.counts().starts,2);assert.equal(new Set(f.seen.map(x=>x.id)).size,1);
});
test('membership or creator mismatch cannot bind a result; recovery reuses its exact id',async()=>{
 const f=fixture();f.badCreator(true);await assert.rejects(f.run(),/未确认/);assert.equal((await f.read()).tasks[0].executionChannel,undefined);assert.equal(f.counts().starts,1);
 f.channels.find(c=>c.channelType==='solo').creator=owner;const result=await f.run();assert.equal(result.data.tasks[0].executionSolo.phase,'ready');assert.equal(f.counts().starts,1);
});
test('a Canvas conflict before reservation never creates a Solo',async()=>{
 const f=fixture(),initial=await f.read();f.replace({...f.head(),id:'d'.repeat(64)});
 await assert.rejects(createTaskSolo({session:f.session,check(){},read:async()=>initial,taskId:f.id,expectedRevision:0}),/来源已变化/);assert.equal(f.counts().starts,0);
});
test('a removed task during acknowledgement is never rebound by its late creation result',async()=>{
 const f=fixture(),start=f.session.channelWrites.start;let finish;const gate=new Promise(resolve=>finish=resolve);
 f.session.channelWrites.start=(...args)=>{const result=start(...args);return {...result,ready:result.ready.then(()=>gate)};};
 const running=f.run();
 for(let i=0;i<30&&!soloRecords(f.head().content).some(r=>r.phase==='submitted');i++)await Promise.resolve();
 assert(soloRecords(f.head().content).some(r=>r.phase==='submitted'));
 const data=await f.read();f.replace(await saveHumanFlow({session:f.session,check(){},data,ids:[f.id],action:'remove'}));finish();
 await assert.rejects(running,/移除/);const task=(await f.read()).tasks[0];assert(task.removed);assert.equal(task.executionChannel,undefined);assert.equal(f.counts().starts,1);
});
test('an unconfirmed native operation is checked without issuing another create',async()=>{
 const f=fixture(),start=f.session.channelWrites.start;f.session.channelWrites.start=(...args)=>{const result=start(...args);return {...result,ready:result.ready.then(()=>{f.channels.splice(1);throw Error('Unconfirmed');})};};
 await assert.rejects(f.run(),/Unconfirmed/);f.session.channelWrites.delivered=async()=>{throw Error('Still unconfirmed');};
 await assert.rejects(f.run(),/unconfirmed/);assert.equal(f.counts().starts,1);
});
test('binding history rejects one private Solo being shared across unrelated tasks',async()=>{
 const f=fixture();await f.run();const rows=soloRecords(f.head().content);const other={...rows[0],task_id:'another-task',event_id:crypto.randomUUID()};
 const invalid='<!-- opcb-task-solos-v1:begin -->\n## 任务执行会话\n```json\n'+JSON.stringify([...rows,other])+'\n```\n<!-- opcb-task-solos-v1:end -->';
 assert.throws(()=>soloRecords(invalid),/不同任务/);
});
test('an assigned Agent must remain available and authorized before any reservation or chat create',async()=>{
 const f=fixture(),read=async()=>{const data=await f.read();data.tasks[0].executor=agent;return data;};
 f.channels[0].members=[owner];await assert.rejects(createTaskSolo({session:f.session,check(){},read,taskId:f.id,expectedRevision:0}),/无权读取/);assert.equal(f.counts().saves,0);assert.equal(f.counts().starts,0);
 f.channels[0].members.push(agent);const result=await createTaskSolo({session:f.session,check(){},read,taskId:f.id,expectedRevision:0});assert(result.channelId);assert.deepEqual(f.seen[0].members,[agent]);
});
