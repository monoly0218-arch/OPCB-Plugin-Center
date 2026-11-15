import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFlow,projectFlow,saveHumanFlow,saveFlow,flowRecords,FLOW_BEGIN} from '../src/tasks/lifecycle.mjs';
import {recordAgentFlow} from '../src/tasks/lifecycle-agent.mjs';
import {parseTaskCanvas,TASK_SOURCE} from '../src/tasks/live-model.mjs';
const owner='a'.repeat(64),agent='b'.repeat(64),other='d'.repeat(64),request='e'.repeat(64),receipt='f'.repeat(64);
const at='2026-11-14T20:00:00.000Z';
const content='# 任务测试\n## 人员分工\n|人员|主要负责|\n|---|---|\n|测试人|测试原任务|\n';
const event=content=>({id:'c'.repeat(64),created_at:1,content});
const initial=()=>parseTaskCanvas(event(content));
const create={event_id:'create',task_id:'template',revision:0,actor:agent,action:'create',at,payload:{title:'测试模板',description:'测试用',assignee:'测试 Agent',team:'OPCB 团队',project:'测试项目',goal:'生成一份可查看的交付',date:'2026-11-15',executionKind:'agent',executor:agent,reviewer:owner,source:'buzz://message?id='+request,channel:'solo'}};
function act(data,action,revision=0,payload={},actor=agent,id=action){const next={event_id:id,task_id:'template',revision,action,payload,actor,at};const text=appendFlow(data,next);return parseTaskCanvas(event(text));}
const created=()=>parseTaskCanvas(event(appendFlow(initial(),create)));
const delivered=()=>act(act(created(),'start',0,{summary:'已开始准备素材'}),'deliver',0,{url:'https://example.test/result.mp4',version:'V1',summary:'结果',evidence:'buzz://message?id='+receipt});

test('one task carries start, delivery and exact owner acceptance through the original source',()=>{
 const data=delivered(),task=data.tasks.find(t=>t.id==='template');assert.equal(task.status,'review');assert.equal(task.completed,false);
 const done=act(data,'accept',0,{version:'V1',delivery:task.delivery.url},owner);
 assert.equal(done.tasks.find(t=>t.id==='template').status,'done');assert.equal(done.tasks.length,2);assert(done.content.startsWith(content));
 assert.throws(()=>act(data,'accept',0,{version:'V1',delivery:task.delivery.url},agent),/验收人/);
 assert.throws(()=>act(data,'accept',0,{version:'V0',delivery:task.delivery.url},owner),/版本/);
});
test('a revision preserves old delivery audit while late and cross-agent receipts cannot overwrite it',()=>{
 const data=act(delivered(),'revise',0,{summary:'只修文字'}),task=data.tasks.find(t=>t.id==='template');
 assert.equal(task.revision,1);assert.equal(task.status,'todo');assert.equal(task.delivery,null);assert.equal(flowRecords(data.content).length,4);
 assert.throws(()=>act(data,'deliver',0,{url:'https://a.test/',version:'V0',summary:'旧',evidence:'buzz://message?id='+receipt},agent,'old-late'),/轮次/);
 assert.throws(()=>act(data,'start',1,{summary:'开始'},other,'wrong-agent'),/执行Agent/);
 const next=act(act(data,'start',1,{summary:'实际修字'},agent,'start-r1'),'deliver',1,{url:'https://a.test/',version:'V2',summary:'只修文字',evidence:'buzz://message?id='+receipt},agent,'deliver-r1');
 assert.equal(next.tasks.find(t=>t.id==='template').delivery.version,'V2');
});
test('replayed event is idempotent and event ID cannot be reused for another payload',()=>{
 const data=created();assert.equal(appendFlow(data,create),data.content);
 assert.throws(()=>appendFlow(data,{...create,payload:{...create.payload,title:'different'}}),/不同内容/);
 assert.throws(()=>flowRecords(content+FLOW_BEGIN),/不完整/);
});
test('removed running task cannot be revived by late delivery, and restore does not execute',()=>{
 const data=act(act(created(),'start',0,{summary:'开始'}),'remove',0,{},owner),task=data.tasks.find(t=>t.id==='template');
 assert(task.removed);assert(task.stopRequested);assert.equal(task.revision,1);
 assert.throws(()=>act(data,'deliver',1,{}),/移除/);
 const restored=act(data,'restore',1,{},owner).tasks.find(t=>t.id==='template');assert.equal(restored.status,'todo');assert.equal(restored.revision,2);assert(!restored.removed);
});
function store(data=initial()){
 let head=event(data.content),writes=0,denied=false;
 const source={id:TASK_SOURCE,members:[owner,agent],creator:owner};
 const session={viewer:owner,canvas:{available:true,read:async()=>head,save:async(channel,text,expected)=>{assert.equal(expected,head.id);writes++;head={id:writes.toString(16).padStart(64,'0'),created_at:writes+1,content:text};return head;}},channels:{list:()=>({status:'ready',channels:denied?[]:[source,{id:'solo',private:true,channelType:'solo',members:[owner,agent]}]})}};
 return {session,writes:()=>writes,head:()=>head,deny:()=>{denied=true;}};
}
test('human checkbox completes own work without link; undo reopens without re-execution',async()=>{
 const data=initial(),id=data.tasks[0].id,s=store(data);
 const saved=await saveHumanFlow({...s,data,ids:[id],action:'check',completed:true,check(){}}),done=parseTaskCanvas(saved);
 assert.equal(done.tasks[0].status,'done');assert.equal(done.tasks[0].accepted.actor,owner);
 const undo=await saveHumanFlow({...s,data:done,ids:[id],action:'check',completed:false,check(){}});
 assert.equal(parseTaskCanvas(undo).tasks[0].status,'todo');assert.equal(s.writes(),2);
});
test('human accepts exact Agent output, cannot check an undelivered run, and bulk remove is atomic',async()=>{
 const d=delivered(),s=store(d);
 const result=await saveHumanFlow({...s,data:d,ids:['template'],action:'check',completed:true,check(){}});
 assert.equal(parseTaskCanvas(result).tasks.find(t=>t.id==='template').status,'done');
 const c=created();await assert.rejects(saveHumanFlow({...store(c),data:c,ids:['template'],action:'check',completed:true,check(){}}),/交付/);
 const a=store(d);await assert.rejects(saveHumanFlow({...a,data:d,ids:['template','missing'],action:'remove',check(){}}),/变化/);assert.equal(a.writes(),0);
});
test('CAS conflict, revoked access and ambiguous save never become success or a second external action',async()=>{
 const d=created(),s=store(d);s.session.canvas.read=async()=>({...event(d.content),id:'0'.repeat(64)});
 await assert.rejects(saveFlow({...s,data:d,events:[],check(){}}),/来源已变化/);assert.equal(s.writes(),0);
 const a=store(d);a.deny();await assert.rejects(saveFlow({...a,data:d,events:[],check(){}}),/不可写入/);
 const b=store(d);let tries=0;b.session.canvas.save=async()=>{tries++;return {id:'1'.repeat(64),content:'wrong'};};
 await assert.rejects(saveFlow({...b,data:d,events:[{...create,event_id:'remove',action:'remove',payload:{},actor:owner}],check(){}}),/未确认/);assert.equal(tries,1);
});
test('legacy completion is projected as review consistently and preserves original bytes',()=>{
 const task={id:'old',status:'planning',completed:true};assert.equal(projectFlow([task],content)[0].status,'review');assert.equal(projectFlow([task],content)[0].completed,false);assert.equal(task.status,'planning');
});
function agentFixture(){
 const s=store(),messages=new Map([[request,{id:request,channelId:'solo',authorId:owner,content:'请做测试模板',createdAt:1,attachments:[]}]]);let disposed=0;
 s.session.thread=(channel,id)=>({refresh:async()=>{},snapshot:()=>({targetStatus:messages.has(id)?'ready':'error',target:messages.get(id)}),dispose(){disposed++;}});
 const connection={status:'ready',scope:'fixture',generation:1,session:s.session};
 const ctx={agents:{relay:()=>({snapshot:()=>connection})},relay:{snapshot:()=>connection}};
 const client={key:'test',owner,pubkey:agent,signal:new AbortController().signal,effectiveEdit:async(id,channel)=>{assert.equal(channel,'solo');if(!messages.has(id))throw Error('denied');}};
 const call=args=>recordAgentFlow({ctx,client,context:{channel:'solo'},args});
 return {...s,messages,ctx,client,call,disposed:()=>disposed};
}
test('Agent tool creates once, starts, records actual delivery and updates the owner view without page authority',async()=>{
 const a=agentFixture(),args={action:'create',expected_revision:0,request_id:request,title:'测试模板',goal:'交视频'};
 const created=await a.call(args),id=created.task.id;assert.equal(created.task.executor,agent);assert.equal(a.writes(),1);
 assert((await a.call(args)).duplicate);assert.equal(a.writes(),1);
 await a.call({action:'start',task_id:id,expected_revision:0,request_id:request,summary:'已经开始整理素材'});
 a.messages.set(receipt,{id:receipt,channelId:'solo',authorId:agent,createdAt:2,content:`task_id: ${id}\nrevision: 0\nhttps://example.test/result.mp4`,attachments:[]});
 const result=await a.call({action:'deliver',task_id:id,expected_revision:0,request_id:request,evidence_id:receipt,version:'V1',summary:'生成完成'});
 assert.equal(result.task.status,'review');assert.match(result.task.delivery.url,/buzz:\/\/message/);assert.equal(a.disposed(),5);
});
test('Agent cannot forge user acceptance, attach old round media, cross routes or write after cancellation',async()=>{
 const a=agentFixture(),r=await a.call({action:'create',expected_revision:0,request_id:request,title:'测试模板'}),id=r.task.id;
 a.messages.set(receipt,{id:receipt,channelId:'solo',authorId:agent,content:`${id}\nrevision: 8\nhttps://example.test/result`,attachments:[]});
 await assert.rejects(a.call({action:'deliver',task_id:id,expected_revision:0,request_id:request,evidence_id:receipt,version:'V9',summary:'旧结果'}),/revision/);
 await assert.rejects(a.call({action:'accept',task_id:id,expected_revision:0,request_id:receipt}),/本人原始/);
 a.messages.get(request).content='是否通过了？';await assert.rejects(a.call({action:'accept',task_id:id,expected_revision:0,request_id:request}),/明确完成/);
 const controller=new AbortController();a.client.signal=controller.signal;controller.abort();await assert.rejects(a.call({action:'read'}));
 assert.equal(a.writes(),1);
});
test('completed work can be removed and restored without losing acceptance; blocked work resumes truthfully',()=>{
 const d=delivered(),task=d.tasks.find(t=>t.id==='template');
 const done=act(d,'accept',0,{version:'V1',delivery:task.delivery.url},owner);
 const removed=act(done,'remove',0,{},owner);
 const restored=act(removed,'restore',1,{},owner).tasks.find(t=>t.id==='template');
 assert.equal(restored.status,'done');assert.equal(restored.accepted.version,'V1');
 const b=act(act(created(),'start',0,{summary:'实际开工'}),'blocked',0,{summary:'等待本人登录'});
 assert.equal(b.tasks.find(t=>t.id==='template').blockReason,'等待本人登录');
 assert.equal(act(b,'start',0,{summary:'登录后继续'},agent,'resume').tasks.find(t=>t.id==='template').blockReason,'');
});
test('explicit reschedule changes dates and clocks together without claiming execution',()=>{
 const d=act(created(),'reschedule',0,{date:'2026-11-16',times:['10:00','19:30']});
 const t=d.tasks.find(t=>t.id==='template');assert.equal(t.status,'todo');assert.equal(t.date,'2026-11-16');assert.deepEqual(t.times,['10:00','19:30']);
 assert.throws(()=>act(created(),'reschedule',0,{date:'2026-11-16',times:['24:00']}),/钟点/);
});
