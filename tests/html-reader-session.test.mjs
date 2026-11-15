import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import React from 'react';
import vm from 'node:vm';
import {COLLECTION,PREFERENCE,place,placeKey,emptyState,validateState,selectSource,selected,sourceId,toggleFavorite,visibleEntries,exactSource,readingPlace,sourceEventTouches} from '../src/html-reader/state.mjs';
import {apply} from '../plugins/opcb.html-reader/0.2.0-rc.4/plugin.js';
const owner='a'.repeat(64),agent='b'.repeat(64),m1='1'.repeat(64),m2='2'.repeat(64),request='3'.repeat(64),root='4'.repeat(64);
const source=(message=m1,channel='solo',thread=null)=>({message,channel,root:thread,version:message,url:'https://fixtures.test/'+message+'.html',name:'作品.html',mime:'text/html'});
const row=s=>({id:s.message,channelId:s.channel,threadRootId:s.root,authorId:agent,attachments:[{url:s.url,name:s.name,mime:s.mime}],content:'HTML',delivery:'accepted'});
function setup(){
 let state=emptyState(owner),listeners=new Set(),channels=[{id:'solo',name:'设计会话',members:[owner,agent]},{id:'other',name:'其他会话',members:[owner,agent]}];
 const messages=new Map([[m1,row(source())],[m2,row(source(m2))],[request,{id:request,channelId:'solo',authorId:owner,attachments:[],content:'把当前 HTML 改圆润'}]]);
 const session={viewer:owner,channels:{list:()=>({status:'ready',channels})},thread:(channel,id)=>({refresh:async()=>{},snapshot:()=>({targetStatus:'ready',target:messages.get(id)}),dispose(){}})};
 const connection={status:'ready',scope:'community:'+owner,origin:'https://fixtures.test',generation:1,session};
 const tools=new Map();let instructions,pages=[];
 const ctx={react:React,effect(){},relay:{snapshot:()=>connection},artifactStorage:{open:()=>({scope:{viewer:owner},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},close(){},preferences:{get:async()=>state,update:async(_,fn)=>{state=fn(state);listeners.forEach(fn=>fn());}}})},agents:{relay:()=>({snapshot:()=>connection}),addInstructions:x=>{instructions=x;},addTool:x=>tools.set(x.name,x)},pages:{register:p=>pages.push(p)},panels:{register(){}},conversation:{registerAttachment(){},registerAccessory(){}},browser:{available:false},host:{}};
 apply(ctx);
 const client={key:'agent',pubkey:agent,owner,signal:new AbortController().signal,effectiveEdit:async()=>{}};
 return {ctx,tools,client,connection,messages,get state(){return state;},set state(x){state=x;},get channels(){return channels;},set channels(x){channels=x;},instructions,pages};
}
test('selections remain separate in a channel, its thread and another channel',async()=>{
 const s1=source(),s2=source(m2,'solo',root),a=await sourceId(s1),b=await sourceId(s2);
 let state=selectSource(emptyState(owner),place('solo'),s1,a,1);state=selectSource(state,place('solo',root),s2,b,2);
 assert.equal(selected(state,place('solo')).id,a);assert.equal(selected(state,place('solo',root)).id,b);assert.equal(selected(state,place('other')),null);
 state=toggleFavorite(state,a);assert(state.entries.find(x=>x.id===a).favorite);assert.equal(state.bindings[placeKey(place('solo'))].revision,1);
 assert.throws(()=>selectSource(state,place('solo'),s2,b,3,0),/切换/);
 assert.equal(validateState(state,owner),state);assert.throws(()=>validateState(state,agent),/个人/);
 const connection={session:{viewer:owner,channels:{list:()=>({status:'ready',channels:[{id:'solo',members:[owner]}]})}}};
 assert.deepEqual(visibleEntries(state,connection,place('solo'),'session').map(e=>e.id),[a]);
 assert.deepEqual(visibleEntries(state,connection,place('solo',root),'session').map(e=>e.id),[b]);
});
test('recent/favorite listings hide sources whose membership has been revoked',async()=>{
 const env=setup(),s=source(),id=await sourceId(s);env.state=toggleFavorite(selectSource(env.state,place('solo'),s,id),id);
 assert.equal(visibleEntries(env.state,env.connection,place('solo'),'favorites').length,1);
 env.channels=[{id:'solo',members:[agent]}];assert.equal(visibleEntries(env.state,env.connection,place('solo'),'favorites').length,0);
 await assert.rejects(exactSource(env.connection,s,()=>{}),/无权/);
});
test('the native entry stays docked, removes manual imports and instructs agents to read the live selection',()=>{
 const env=setup();assert.equal(env.pages[0].placement,'dock');assert(env.instructions.text.includes('opcb_html_reader_context'));assert(env.instructions.text.includes('expected_revision'));
});
test('Agent context cannot infer a selection from a different channel or thread',async()=>{
 const env=setup(),s=source();env.state=selectSource(env.state,place('solo'),s,await sourceId(s));
 const tool=env.tools.get('opcb_html_reader_context');
 assert.equal(JSON.parse(await tool.call(env.client,{channel:'other'},{})).binding,null);
 assert.equal(JSON.parse(await tool.call(env.client,{channel:'solo',root},{})).binding,null);
 const result=JSON.parse(await tool.call(env.client,{channel:'solo'},{}));assert.equal(result.binding.source.message,m1);assert.equal(result.binding.expected_revision,1);
 assert.equal(JSON.parse(await tool.call(env.client,{channel:'solo',root,topLevel:true},{})).binding.source.message,m1);
 env.channels=[{id:'solo',members:[owner]}];await assert.rejects(tool.call(env.client,{channel:'solo'},{}),/无权/);
});
test('published revisions require the owner request, matching thread and the current selection revision',async()=>{
 const env=setup(),s=source();env.state=selectSource(env.state,place('solo'),s,await sourceId(s));
 const tool=env.tools.get('opcb_html_reader_update');
 const args={request_id:request,source_message_id:m2,expected_revision:1};
 const saved=JSON.parse(await tool.call(env.client,{channel:'solo'},args));assert.equal(saved.binding.source.message,m2);assert.equal(saved.binding.expected_revision,2);
 await assert.rejects(tool.call(env.client,{channel:'solo'},args),/切换/);
 env.messages.get(request).authorId=agent;await assert.rejects(tool.call(env.client,{channel:'solo'},{...args,expected_revision:2}),/本人/);
 env.messages.get(request).authorId=owner;env.messages.get(m2).threadRootId=root;await assert.rejects(tool.call(env.client,{channel:'solo'},{...args,expected_revision:2}),/会话/);
});
test('a source edit/deletion is rechecked before returning the selected HTML',async()=>{
 const env=setup(),s=source();env.state=selectSource(env.state,place('solo'),s,await sourceId(s));
 const tool=env.tools.get('opcb_html_reader_context');env.messages.get(m1).attachments=[];await assert.rejects(tool.call(env.client,{channel:'solo'},{}),/原消息/);
 env.messages.set(m1,{...row(s),attachmentSourceId:'5'.repeat(64)});await assert.rejects(tool.call(env.client,{channel:'solo'},{}),/版本/);
 env.client.signal=undefined;await assert.rejects(tool.call(env.client,{channel:'solo'},{}),/取消/);
});
test('memory preview isolates document frames, preserves doctype and shuts down on EOF',async t=>{
 const worker=await readFile(new URL('../src/html-reader/viewer.py',import.meta.url),'utf8'),helper=await readFile(new URL('../src/html-reader/fit.js',import.meta.url),'utf8');
 const child=spawn('python3',['-I','-u','-c','import json,sys;exec(json.loads(sys.stdin.readline()))'],{stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());
 const lines=createInterface({input:child.stdout}),ready=once(lines,'line');child.stdin.write(JSON.stringify(worker)+'\n'+JSON.stringify({helper})+'\n');const [line]=await ready;const {url}=JSON.parse(line);
 const loaded=once(lines,'line');child.stdin.write(JSON.stringify({type:'document',id:m1,html:'<!doctype html><html><head><meta name="opcb-preview" content="width=390,height=844"></head><body>完整文档</body></html>'})+'\n');assert.equal(JSON.parse((await loaded)[0]).type,'loaded');
 const shell=await fetch(url);const body=await shell.text();assert(body.includes("Math.min(width/view.width,height/view.height,1)"));new vm.Script(body.match(/<script>([\s\S]*)<\/script>/)[1]);assert(body.includes("frame.sandbox='allow-scripts'"));assert(!body.includes('allow-same-origin'));assert(body.includes('aspectRatio'));
 const doc=await fetch(url+'document/'+m1);assert((await doc.text()).startsWith('<!doctype html>'));assert.match(doc.headers.get('content-security-policy'),/connect-src 'none'/);assert.equal((await fetch(url+'document/'+'0'.repeat(64))).status,404);
 assert.equal((await fetch(url+'event',{method:'POST',body:'{}'})).status,403);
 const closed=once(child,'exit');child.stdin.end();assert.equal((await closed)[0],0);await assert.rejects(fetch(url));
});

test('Solo link roots bind to the flat composer while DM and ordinary threads stay isolated',()=>{
 const env=setup();env.channels[0].channelType='solo';assert.deepEqual(readingPlace(env.connection,'solo',root),place('solo'));
 env.channels[0].channelType='dm';assert.deepEqual(readingPlace(env.connection,'solo',root),place('solo',root));
 env.channels[0].channelType='stream';assert.deepEqual(readingPlace(env.connection,'solo',root),place('solo',root));
 env.channels[0].members=[];assert.throws(()=>readingPlace(env.connection,'solo',root),/无权/);
});
test('workspace cards stay in four standard ratios and long documents open at reading size',async()=>{
 const text=await readFile(new URL('../src/html-reader/viewer.py',import.meta.url),'utf8');
 const functions=text.slice(text.indexOf('function ratioFor('),text.indexOf('const observe='));
 const canvas={clientWidth:240,clientHeight:180,style:{},dataset:{}},frame={parentElement:canvas,dataset:{id:m1},style:{}};
 const state={gallery:true,ratio:'auto'},sizes=new Map([[m1,{width:1280,height:18000,viewportHeight:800}]]);
 const context={state,sizes,automatic:new Map(),ratios:{'16:9':16/9,'9:16':9/16,'4:3':4/3,'3:4':3/4},frame};vm.createContext(context);vm.runInContext(functions,context);vm.runInContext('fit(frame)',context);
 assert.equal(canvas.dataset.ratio,'4:3');assert.equal(JSON.parse(frame.dataset.fit).height,960);assert.equal(frame.style.height,'960px');
 for(const ratio of Object.keys(context.ratios)){state.ratio=ratio;canvas.clientHeight=240/context.ratios[ratio];vm.runInContext('fit(frame)',context);assert.equal(canvas.dataset.ratio,ratio);assert(Math.abs(JSON.parse(frame.dataset.fit).width/JSON.parse(frame.dataset.fit).height-context.ratios[ratio])<.005);}
 state.gallery=false;canvas.clientWidth=1100;canvas.clientHeight=750;vm.runInContext('fit(frame)',context);assert.match(frame.style.cssText,/width:100%;height:100%/);assert.match(frame.style.cssText,/transform:none/);assert.equal(JSON.parse(frame.dataset.fit).mode,'reading');
});

test('replies and reactions do not invalidate the viewed document; edits and deletions do',()=>{
 const s=source();for(const kind of [9,7,40002,40008])assert(!sourceEventTouches({id:m2,kind,tags:[['e',m1]]},s));
 for(const kind of [5,9005,40003]){assert(sourceEventTouches({id:m2,kind,tags:[['e',m1]]},s));assert(!sourceEventTouches({id:m2,kind,tags:[['e',root]]},s));}
 assert(sourceEventTouches({id:m1,kind:9},s));
});
test('repeated catalog/document events and favorite changes keep the current reading frame',async()=>{
 const text=await readFile(new URL('../src/html-reader/viewer.py',import.meta.url),'utf8');
 const render=text.slice(text.indexOf('function render(){'),text.indexOf("window.addEventListener('message'"));
 const events=text.slice(text.indexOf('const events=new EventSource'),text.indexOf('events.onerror='));
 let navigation=0,fitCount=0,content='document/'+m1+'?v=v1';const frame={getAttribute:()=>content,set src(x){content=x;navigation++;}};
 const context={state:{gallery:false,selected:m1,entries:[{id:m1,name:'HTML',favorite:false}]},stage:{hidden:false},empty:{hidden:true},frames:new Map([[m1,frame]]),fit:()=>fitCount++,ready:new Set([m1]),sizes:new Map(),automatic:new Map(),versions:new Map([[m1,'v1']]),positions:new Map(),catalogSignature:'',base:'/',EventSource:class{},status(){}};
 vm.createContext(context);vm.runInContext(render+events+';globalThis.receive=events.onmessage;',context);
 const catalog={type:'catalog',gallery:false,selected:m1,entries:[{id:m1,name:'HTML',favorite:false}]};
 context.receive({data:JSON.stringify(catalog)});context.receive({data:JSON.stringify(catalog)});catalog.entries[0].favorite=true;context.receive({data:JSON.stringify(catalog)});
 assert.equal(context.frames.get(m1),frame);assert.equal(fitCount,2);assert.equal(navigation,0);
 context.receive({data:JSON.stringify({type:'document',id:m1,version:'v1'})});assert.equal(navigation,0);
 context.receive({data:JSON.stringify({type:'document',id:m1,version:'v2'})});assert.equal(navigation,1);
 context.receive({data:JSON.stringify({type:'document',id:m1,version:'v2'})});assert.equal(navigation,1);
 context.receive({data:JSON.stringify({type:'error',id:m1,error:'来源已删除'})});assert.equal(content,'about:blank');assert(!context.ready.has(m1));
});
