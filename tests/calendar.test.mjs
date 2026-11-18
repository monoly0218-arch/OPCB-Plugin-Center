import test from 'node:test';import assert from 'node:assert/strict';
import {TYPES,validateEvent,readEvents,mutateEvents,eventsOn,saveEvents,sourceAccess,TASK_SOURCE} from '../src/calendar/model.mjs';
const actor='a'.repeat(64),other='b'.repeat(64),id='c'.repeat(64);
const event={id,type:'leave',title:'跨天请假',date:'2026-11-18',endDate:'2026-11-20',allDay:true,time:'',endTime:'',participants:['甲'],createdBy:actor,updatedBy:actor,updatedAt:10};
const content='# 人员任务\n普通任务2026-11-18照常留在原文\n';
test('only explicitly registered five types enter calendar',()=>{assert.equal(Object.keys(TYPES).length,5);assert.deepEqual(readEvents(content),[]);assert.throws(()=>validateEvent({...event,type:'task'}));});
test('multi-day inclusive projection with validated dates and time',()=>{assert.equal(eventsOn([event],'2026-11-19').length,1);assert.equal(eventsOn([event],'2026-11-21').length,0);assert.throws(()=>validateEvent({...event,date:'2026-02-30'}));assert.throws(()=>validateEvent({...event,endDate:'2026-11-18',allDay:false,time:'12:00',endTime:'11:00'}));});
test('append/update/remove preserve original source and event authorship',()=>{const added=mutateEvents(content,{action:'add',event,actor,creator:actor});assert.ok(added.startsWith(content.trimEnd()));assert.equal(readEvents(added).length,1);const updated=mutateEvents(added,{action:'update',event:{...event,title:'改期',createdBy:other},actor:other,creator:other});assert.equal(readEvents(updated)[0].createdBy,actor);assert.equal(readEvents(updated)[0].updatedBy,other);const removed=mutateEvents(updated,{action:'remove',id,actor,creator:other});assert.deepEqual(readEvents(removed),[]);});
test('other members cannot modify or delete an event',()=>{const added=mutateEvents(content,{action:'add',event,actor,creator:actor});for(const action of ['update','remove'])assert.throws(()=>mutateEvents(added,{action,event,id,actor:other,creator:actor}),/仅登记人/);});
test('malformed, duplicate and oversized sources fail closed',()=>{assert.throws(()=>readEvents('<!-- opcb-calendar-v1:begin -->'));assert.throws(()=>readEvents('<!-- opcb-calendar-v1:end -->'));const added=mutateEvents(content,{action:'add',event,actor,creator:actor});assert.throws(()=>mutateEvents(added,{action:'add',event,actor,creator:actor}),/已存在/);assert.throws(()=>mutateEvents('x'.repeat(256000),{action:'add',event,actor,creator:actor}),/容量/);});
function connection(){let channel={id:TASK_SOURCE,creator:actor,members:[actor,other]},head={id:'d'.repeat(64),content};const calls=[];const session={viewer:actor,channels:{list:()=>({status:'ready',channels:[channel]})},canvas:{available:true,read:async()=>head,save:async(...args)=>{calls.push(args);return {id:'e'.repeat(64),content:args[1]};}}};return {connection:{status:'ready',session},calls,head,setChannel:c=>channel={...channel,...c}};}
test('save uses fresh version and CAS without changing tasks',async()=>{const m=connection();const result=await saveEvents({connection:m.connection,check(){},expected:m.head.id,operation:{action:'add',event}});assert.equal(m.calls.length,1);assert.equal(m.calls[0][2],m.head.id);assert.ok(result.content.startsWith(content.trimEnd()));});
test('conflicting save never sends and draft remains caller-owned',async()=>{const m=connection();await assert.rejects(saveEvents({connection:m.connection,check(){},expected:'f'.repeat(64),operation:{action:'add',event}}),/草稿保留/);assert.equal(m.calls.length,0);assert.equal(event.title,'跨天请假');});
test('revoked, cached and readonly channel cannot write',async()=>{for(const patch of [{members:[other]},{cached:true},{readOnly:true},{metadataCached:true}]){const m=connection();m.setChannel(patch);assert.throws(()=>sourceAccess(m.connection,true));assert.equal(m.calls.length,0);}});
test('permission loss during read prevents subsequent save',async()=>{const m=connection();m.connection.session.canvas.read=async()=>{m.setChannel({members:[other]});return m.head;};await assert.rejects(saveEvents({connection:m.connection,check(){},expected:m.head.id,operation:{action:'add',event}}));assert.equal(m.calls.length,0);});

test('native bundle registers one page with two views and a separately authorized tool',async()=>{const React={createElement(){},useState(){},createContext(){return {};}},pages=[],tools=[];const plugin=await import('../plugins/opcb.calendar/0.1.0-rc.2/plugin.js');plugin.apply({react:React,pages:{register:p=>pages.push(p)},agents:{addTool:t=>tools.push(t)}});assert.deepEqual(pages.map(p=>[p.id,p.title]),[['main','日历']]);assert.equal(tools[0].name,'opcb_calendar');assert.ok(pages[0].icon.startsWith('data:image/png;base64,'));});

test('agent tool refuses missing original owner instruction and stale revisions',async()=>{
 const {registerCalendarAgent}=await import('../src/calendar/agent.mjs');let tool;const m=connection(),agent='f'.repeat(64),routeId='private-chat';m.setChannel({members:[actor,agent]});const baseList=m.connection.session.channels.list;m.connection.session.channels.list=()=>({...baseList(),channels:[...baseList().channels,{id:routeId,members:[actor,agent]}]});
 const ctx={relay:{snapshot:()=>m.connection},agents:{addTool:t=>tool=t,relay:()=>({snapshot:()=>m.connection})}};registerCalendarAgent(ctx);const client={owner:actor,pubkey:agent,key:agent,signal:new AbortController().signal};
 const read=JSON.parse(await tool.call(client,{channel:routeId},{action:'read'}));assert.equal(read.baselineRevision,m.head.id);await assert.rejects(tool.call(client,{channel:routeId},{action:'add',expected_revision:'bad'}),/当前日历版本/);await assert.rejects(tool.call(client,{channel:routeId},{action:'add',expected_revision:m.head.id,request_id:actor,event}),/原消息/);assert.equal(m.calls.length,0);
});

test('week layout preserves calendar dates, midnight boundaries and overlapping events', async () => {
 const {weekDates,timedBlocks,rangeTitle} = await import('../src/calendar/grid.mjs');
 assert.deepEqual(weekDates('2026-01-01').map(cell => cell.date), [
  '2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04'
 ]);
 assert.equal(rangeTitle('2026-01-01','week'),'12月29日–1月4日');
 const overnight = {...event,allDay:false,time:'22:45',endTime:'00:00',endDate:'2026-11-19'};
 const overlaps = {...overnight,id:'different',time:'23:15',endTime:'23:45',endDate:'2026-11-18'};
 assert.deepEqual(timedBlocks([overnight,overlaps,event],'2026-11-18').map(
  ({start,end,lane,lanes}) => [start,end,lane,lanes]), [[1365,1440,0,2],[1395,1425,1,2]]);
 assert.deepEqual(timedBlocks([overnight],'2026-11-19'),[]);
});
