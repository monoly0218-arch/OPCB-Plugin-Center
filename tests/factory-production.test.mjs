import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {newProduction,readProduction,productionContent,changeProduction,versionDifferences,attachment} from '../src/content-factory/production-model.mjs';
import {createProductionStore,productionAccess} from '../src/content-factory/production-store.mjs';
import {createProductionPanel} from '../src/content-factory/production-ui.mjs';
import {storeZip,exportProduction} from '../src/content-factory/production-export.mjs';
import {createFactoryWorkspace} from '../src/content-factory/plugin.mjs';
const owner='a'.repeat(64),agent='b'.repeat(64),person={owner,pubkey:owner},bot={owner,pubkey:agent};
const card={id:'card-01',title:'01 号产品短片'};
const file={name:'产品.png',url:'https://fixture.invalid/media/'+('c'.repeat(64))+'.png',type:'image/png',size:3,sha256:'c'.repeat(64)};
const mutate=(d,action,extra={},actor=person)=>changeProduction(d,action,{expected_revision:d.revision,version_id:d.currentVersion,...extra},actor);
const seeded=()=>mutate(newProduction(card,owner),'edit',{prompt:'v1 提示词',plan:'先核对产品参考，再生成并复验结果'});
function fixture(options={}){
 const heads=new Map(),memory=new Map(),listeners=new Set(),channels=[],messages=[];let serial=0,creation=0,saves=0;
 let roster={status:'ready',channels};
 const session={viewer:owner,channels:{list:()=>roster,subscribeList:()=>()=>{},ensureList(){}},canvas:{available:true,read:async id=>heads.get(id)||null,save:async(id,content,expected)=>{saves++;if((heads.get(id)?.id||null)!==(expected||null))throw Error('conflict');const event={id:'head-'+(++serial),content};heads.set(id,event);return event;}},channelWrites:{available:true,start(id,name){creation++;channels.push({id,name,creator:owner,private:true,channelType:'solo',members:[owner],archived:false});return{create:'operation',ready:Promise.resolve()};},refresh:async()=>{}},subscribeLive:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 const connection={status:'ready',scope:options.scope || 'test:'+owner,generation:1,session};let current=connection;
 const store=createProductionStore({relay:{snapshot:()=>current}},{storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},...options});store.bind(connection);
 return {store,heads,channels,session,connection,memory,emit:event=>listeners.forEach(fn=>fn({events:[event]})),switch:()=>{current={...connection,generation:2};store.bind(current);},counts:()=>({creation,saves,messages:messages.length})};
}

test('three complete versions preserve per-version prompts, files, timestamps and acceptance while a later draft changes independently',()=>{
 let doc=seeded();doc=mutate(doc,'material',{kind:'product',file});doc=mutate(doc,'start',{request_id:'request'},bot);assert.equal(doc.versions[0].status,'running');
 doc=mutate(doc,'result',{file});assert.equal(doc.versions[0].status,'review');doc=mutate(doc,'accept');const accepted=structuredClone(doc.versions[0]);
 doc=mutate(doc,'new_version');doc=mutate(doc,'edit',{prompt:'v2 提示词',plan:'新版规划'});doc=mutate(doc,'human_fail',{reason:'物体变形，需重做'});const failed=structuredClone(doc.versions[1]);
 doc=mutate(doc,'new_version');doc=mutate(doc,'edit',{prompt:'v3 提示词',plan:'第三版修正'});
 assert.equal(doc.versions.length,3);assert.equal(doc.versions[0].prompt,accepted.prompt);assert.deepEqual(doc.versions[0].materials,accepted.materials);assert.equal(doc.versions[0].acceptedAt,accepted.acceptedAt);assert.equal(doc.versions[1].reason,failed.reason);assert.equal(doc.versions[1].status,'failed');assert.equal(doc.versions[2].status,'draft');
 const diff=versionDifferences(doc.versions[0],doc.versions[2]);assert(diff.promptChanged);assert(diff.planChanged);assert.equal(diff.added.length,0);
});

test('green requires an exact owner acceptance; agent delivery/failure stays non-green; sealed inputs and stale revisions cannot be overwritten',()=>{
 let doc=seeded();assert.throws(()=>mutate(doc,'accept'),/本人/);doc=mutate(doc,'result',{file});assert.throws(()=>mutate(doc,'accept',{},bot),/本人/);
 assert.throws(()=>mutate(doc,'edit',{prompt:'overwrite',plan:''}),/封存/);
 assert.throws(()=>changeProduction(doc,'accept',{version_id:doc.currentVersion,expected_revision:0},person),/已有更新/);
 assert.throws(()=>mutate(doc,'human_fail',{reason:'issue'},{owner:'other',pubkey:'other'}),/身份/);
 const accepted=mutate(doc,'accept');assert.throws(()=>mutate(accepted,'result',{file}),/封存/);assert.throws(()=>mutate(accepted,'fail',{request_id:'req',evidence_id:'e',reason:'bug'},bot),/封存/);
 const delivered=mutate(mutate(seeded(),'start',{request_id:'owner-request'},bot),'deliver',{request_id:'owner-request',evidence_id:'agent-result',file},bot);assert.equal(delivered.versions[0].status,'review');
 assert.throws(()=>mutate(mutate(seeded(),'start',{request_id:'req'},bot),'fail',{request_id:'req',reason:'bug'},bot),/回执/);
});

test('native upload descriptors reject ephemeral tickets, credentials and incomplete file hashes',()=>{
 assert.equal(attachment(file).sha256,file.sha256);
 for(const patch of [{url:file.url+'?token=secret'},{url:'https://person:secret@fixture.invalid/a'},{sha256:'unknown'},{size:0}])assert.throws(()=>attachment({...file,...patch}));
});

test('signed Canvas text preserves unrelated prose and strictly binds one production document',()=>{
 const d=seeded(),text=productionContent('原会话资料\n',d);assert(text.startsWith('原会话资料'));
 assert.deepEqual(readProduction({content:text}),d);assert.equal(readProduction({content:'other document'}),null);
 assert.throws(()=>readProduction({content:text+'\n'+text}),/重复/);
 assert.throws(()=>readProduction({content:'```opcb-factory-production\n{bad'}),/损坏/);
});

test('explicit click creates one named Solo, persists the stable binding and never sends or starts execution; reopening finds the same record',async()=>{
 const f=fixture();const first=await f.store.open(card,1);assert.match(f.channels[0].name,/01 .*执行规划/);assert.equal(first.doc.versions[0].status,'draft');assert.equal(first.doc.owner,owner);
 const second=await f.store.open(card,1);assert.equal(second.channel,first.channel);assert.deepEqual(f.counts(),{creation:1,saves:1,messages:0});
 assert.equal(JSON.parse([...f.memory.values()][0]).solo,first.channel);
 f.store.dispose();
});

test('a save conflict preserves original version and uncertain Solo creation retains its UUID without creating a second Solo',async()=>{
 const f=fixture(),record=await f.store.open(card,1);const d=record.doc;
 await f.store.mutate(card.id,'edit',{expected_revision:d.revision,version_id:d.currentVersion,prompt:'saved',plan:'plan'});
 await assert.rejects(f.store.mutate(card.id,'edit',{expected_revision:d.revision,version_id:d.currentVersion,prompt:'stale',plan:'plan'}),/已有更新/);
 assert.equal((await f.store.read(record.channel)).doc.versions[0].prompt,'saved');
 const g=fixture();let starts=0;g.session.channelWrites.start=()=>{starts++;return{create:'uncertain',ready:Promise.reject(Error('lost response'))};};
 await assert.rejects(g.store.open(card,1),/lost response/);const reserved=[...g.memory.values()][0];await assert.rejects(g.store.open(card,1),/原 Solo/);assert.equal(starts,1);assert.equal([...g.memory.values()][0],reserved);
});

test('ownership changes, revoked access and duplicate card bindings fail closed rather than reading or rebuilding',async()=>{
 const f=fixture(),record=await f.store.open(card,1);f.channels[0].readOnly=true;assert(!productionAccess(f.connection,record.channel));await assert.rejects(f.store.read(record.channel),/不可访问/);
 f.channels[0].readOnly=false;f.switch();assert.deepEqual(f.store.snapshot().records,{});
 const g=fixture();for(const id of ['one','two']){g.channels.push({id,name:'existing',creator:owner,private:true,channelType:'solo',members:[owner]});g.heads.set(id,{id:'head-'+id,content:productionContent('',newProduction(card,owner))});}
 await g.store.refresh();assert(g.store.snapshot().error);assert(!g.store.snapshot().records[card.id]);await assert.rejects(g.store.open(card,1),/未完整核验/);assert.equal(g.counts().creation,0);
});

test('live Canvas updates turn the left-hand source status into blue/red/green without a manual refresh',async()=>{
 const f=fixture(),record=await f.store.open(card,1);let doc=seeded();f.heads.set(record.channel,{id:'live',content:productionContent('',doc)});await f.store.load(record.channel);
 doc=mutate(doc,'start',{request_id:'req'},bot);f.heads.set(record.channel,{id:'new-live',content:productionContent('',doc)});f.emit({kind:40100,tags:[['d',record.channel]]});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.store.snapshot().records[card.id].doc.versions[0].status,'running');
});

test('execution panel uses the host native Workspace and keeps the original channel identifier across version changes',()=>{
 const doc=seeded(),record={channel:'solo-one',doc},connection={status:'ready',scope:'test',generation:1,session:{viewer:owner,media:url=>url}};let props;
 const ctx={react:React,effect(){},relay:{snapshot:()=>connection},conversation:{registerTool(){},ui:{Workspace:p=>{props=p;return React.createElement('textarea',{'aria-label':'native draft'});}}}};
 const Panel=createProductionPanel(ctx,{snapshot:()=>({records:{[card.id]:record}}),subscribe:()=>()=>{}},()=>{});
 const html=renderToStaticMarkup(React.createElement(Panel,{connection,card,onBack(){}}));assert(html.includes('native draft'));assert(html.includes('执行规划'));assert(html.includes('提示词'));assert(!html.includes('验收通过 1.0'));
 assert.deepEqual(props.target,{channelId:'solo-one'});assert.equal(props.id,'opcb.content-factory.production:solo-one');
});

test('ZIP output opens with a standard reader, preserves Unicode names and refuses traversal',async()=>{
 const folder=await mkdtemp(tmpdir()+'/factory-zip-'),zip=storeZip([{name:'PROMPT.md',bytes:new TextEncoder().encode('你好提示词')},{name:'materials/产品.png',bytes:Uint8Array.from([1,2,3])}]);
 await writeFile(folder+'/result.zip',new Uint8Array(await zip.arrayBuffer()));
 const result=execFileSync('python3',['-c',"import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read('PROMPT.md').decode()=='你好提示词'; assert z.read('materials/产品.png')==bytes([1,2,3]); print('ok')",folder+'/result.zip'],{encoding:'utf8'});assert.equal(result.trim(),'ok');
 assert.throws(()=>storeZip([{name:'../file',bytes:new Uint8Array()}]),/文件名/);
});

test('engineering export includes real material bytes and rejects missing/hash-mismatched files or an unaccepted version',async()=>{
 const bytes=Uint8Array.from([1,2,3]),hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');const asset={...file,sha256:hash};
 let doc=seeded();doc=mutate(doc,'material',{kind:'product',file:asset});doc=mutate(doc,'result',{file:asset});doc=mutate(doc,'accept');let output;
 const session={media:url=>url,attachments:{upload:async file=>{output=file;return{name:file.name,url:'https://fixture.invalid/pack.zip'};}}};
 await exportProduction({doc,version:doc.versions[0],session,channel:'solo',check(){},signal:new AbortController().signal,fetchBytes:async()=>bytes});assert.equal(output.type,'application/zip');
 await assert.rejects(exportProduction({doc,version:doc.versions[0],session,channel:'solo',check(){},signal:new AbortController().signal,fetchBytes:async()=>new Uint8Array([4,5,6])}),/指纹不一致/);
 await assert.rejects(exportProduction({doc,version:{...doc.versions[0],status:'review'},session,channel:'solo',check(){},signal:new AbortController().signal}),/绿色/);
});

test('factory connections still reject a changed owner and website mode never exposes native material tools',async()=>{
 let c={status:'ready',scope:'test',generation:1,session:{viewer:owner}},calls=0;
 const w=createFactoryWorkspace({relay:{snapshot:()=>c},host:{request:async()=>{calls++;throw Error('must not reach service');}}});w.bind(c);w.website(true);
 await assert.rejects(w.tool({},{},{action:'read'}),/原站操作/);assert.equal(calls,0);w.dispose();
});

test('fast switching refuses a second concurrent open instead of returning the wrong Solo, and late reads cannot leak into a new connection',async()=>{
 const f=fixture();let release;const original=f.session.canvas.read;f.session.canvas.read=async id=>{await new Promise(r=>release=r);return original(id);};
 const opening=f.store.open(card,1);await new Promise(r=>setImmediate(r));
 await assert.rejects(f.store.open({id:'other',title:'other'},2),/上一项/);release();
 // The first open performs another read-back after saving.
 f.session.canvas.read=original;await opening;assert.equal(f.counts().creation,1);
 let resume;f.session.canvas.read=async id=>{await new Promise(r=>resume=r);return original(id);};
 const refreshing=f.store.refresh();await new Promise(r=>setImmediate(r));f.switch();resume();await refreshing;
 assert.deepEqual(f.store.snapshot().records,{});assert.equal(f.store.snapshot().loading,false);
 f.session.canvas.read=original;await f.store.refresh();assert(f.store.snapshot().records[card.id]);
});

test('uploaded file survives a Canvas conflict, recovery uses the original upload and sealed versions refuse to change',async()=>{
 const f=fixture(),record=await f.store.open(card,1);let uploads=0;
 f.session.attachments={upload:async()=>{uploads++;const doc=mutate((await f.store.read(record.channel)).doc,'edit',{prompt:'parallel edit',plan:'plan'});f.heads.set(record.channel,{id:'parallel',content:productionContent('',doc)});return file;}};
 await assert.rejects(f.store.upload(card.id,record.doc.currentVersion,'product',{size:3}),/待归档/);
 assert.equal(f.store.snapshot().unfiled.length,1);assert.equal(uploads,1);
 await f.store.recoverUpload(f.store.snapshot().unfiled[0]);assert.equal(uploads,1);assert.equal(f.store.snapshot().unfiled.length,0);
 let doc=(await f.store.read(record.channel)).doc;assert.equal(doc.versions[0].materials.length,1);
 await f.store.mutate(card.id,'new_version',{expected_revision:doc.revision,version_id:doc.currentVersion});
 await assert.rejects(f.store.upload(card.id,record.doc.currentVersion,'product',{size:3}),/封存/);assert.equal(uploads,1);
 doc=(await f.store.read(record.channel)).doc;
 const next=mutate(doc,'remove_material',{kind:'product',sha256:file.sha256});assert.equal(next.versions[1].materials.length,0);assert.equal(next.versions[0].materials.length,1);assert.equal(versionDifferences(next.versions[0],next.versions[1]).removed.length,1);
 assert.throws(()=>mutate(next,'start',{request_id:'req',version_id:doc.versions[0].id},bot),/开始前/);
});

test('failed or delivered versions retain their original evidence and result; retries cannot overwrite their history',()=>{
 const started=mutate(seeded(),'start',{request_id:'req'},bot),failed=mutate(started,'fail',{request_id:'req',evidence_id:'failure',reason:'real bug'},bot);
 assert.throws(()=>mutate(failed,'deliver',{request_id:'req',evidence_id:'new-result',file},bot),/封存/);
 assert.throws(()=>mutate(failed,'fail',{request_id:'req',evidence_id:'other',reason:'changed'},bot),/执行中/);
 assert.throws(()=>mutate(failed,'human_fail',{reason:'changed'}),/本人/);
 const delivered=mutate(started,'deliver',{request_id:'req',evidence_id:'result',file},bot);
 assert.throws(()=>mutate(delivered,'deliver',{request_id:'req',evidence_id:'other',file:{...file,name:'changed'}},bot),/封存/);
});

test('Agent tool verifies the private Solo, owner request, exact version evidence and real attachments; it never accepts a version',async()=>{
 const {registerProductionAgent}=await import('../src/content-factory/production-agent.mjs');const f=fixture(),record=await f.store.open(card,1),channel=record.channel;
 f.channels[0].members.push(agent);let tool;const messages=new Map(),request='1'.repeat(64),evidence='2'.repeat(64),other='3'.repeat(64);
 const relay={snapshot:()=>f.connection};const ctx={relay,agents:{relay:()=>relay,addInstructions(){},addTool:t=>tool=t}};
 f.session.thread=(ch,id)=>({refresh:async()=>{},snapshot:()=>({targetStatus:'ready',target:messages.get(id)}),dispose(){}});
 const client={owner,pubkey:agent,key:'fixture-agent',signal:new AbortController().signal,effectiveEdit:async()=>{}};
 messages.set(request,{id:request,channelId:channel,authorId:owner,createdAt:Math.floor(Date.now()/1000),content:'保存输入并执行此版'});
 messages.set(other,{id:other,channelId:channel,authorId:agent,content:'agent cannot authorize'});
 registerProductionAgent(ctx,f.store);const call=args=>tool.call(client,{channel},args),args={expected_revision:record.doc.revision,version_id:record.doc.currentVersion,request_id:request};
 await assert.rejects(call({...args,action:'save_inputs',prompt:'p',plan:'plan',request_id:other}),/本人原始/);
 await call({...args,action:'save_inputs',prompt:'p',plan:'plan'});
 const doc=(await f.store.read(channel)).doc;await call({...args,expected_revision:doc.revision,action:'start'});
 const running=(await f.store.read(channel)).doc;const delivery={...args,expected_revision:running.revision,action:'deliver',evidence_id:evidence};
 messages.set(evidence,{id:evidence,channelId:channel,authorId:agent,createdAt:Math.floor(Date.now()/1000),content:'production_version: wrong',attachments:[file]});await assert.rejects(call(delivery),/准确制作版本/);
 messages.get(evidence).content='production_version: '+args.version_id;await call(delivery);
 assert.equal((await f.store.read(channel)).doc.versions[0].status,'review');
 const revision=(await f.store.read(channel)).doc.revision;
 await assert.rejects(call({...args,expected_revision:revision,action:'update_prompt',evidence_id:evidence,prompt:'更新后的提示词'}),/完整提示词/);
 messages.get(evidence).content+='\n更新后的提示词';
 await call({...args,expected_revision:revision,action:'update_prompt',evidence_id:evidence,prompt:'更新后的提示词'});
 assert.equal((await f.store.read(channel)).doc.versions[0].revisedPrompt,'更新后的提示词');
 assert.equal((await f.store.read(channel)).doc.versions[0].prompt,'p');
 await assert.rejects(call({...args,expected_revision:running.revision+2,action:'accept'}),/仅本人/);
 f.channels[0].members.push('outsider');await assert.rejects(call({action:'read'}),/专属Solo/);
});

test('start button sends one owner instruction with exact version, selected snapshots and Agent, and repeated checks reuse that receipt', async () => {
 const f=fixture(), record=await f.store.open(card,1), sends=[];
 f.session.agentChoices={snapshot:()=>({selectable:[{pubkey:agent,name:'制作Agent'}]})};
 f.session.channelWrites.addAgents=async(channel,keys,active)=>{assert(active());f.channels.find(c=>c.id===channel).members.push(...keys);};
 f.session.memberAdditions={add:()=>{throw Error('Add agents by tagging them in the chat composer instead.');}};
 f.session.messages={send:(channel,content,mentions,attachments,recovery)=>{
  sends.push({channel,content,mentions,attachments,recovery});return '9'.repeat(64);
 }};
 const args={expected_revision:record.doc.revision,version_id:record.doc.currentVersion,executor:agent,getExecutor:()=>agent,notes:'服装参考原视频，只替换所选角色的脸。',prompt:'一个提示词',materials:[{...file,kind:'person'}]};
 const sent=await f.store.execute(card.id,args), version=sent.doc.versions[0];
 assert.equal(version.status,'queued');assert.equal(version.dispatch.messageId,'9'.repeat(64));
 assert.equal(version.notes,args.notes);assert(sends[0].content.includes(args.notes));assert.equal(sends[0].channel,record.channel);
 assert.equal(sends.length,1);assert.deepEqual(sends[0].mentions,[agent]);assert.equal(sends[0].attachments[0].sha256,file.sha256);
 assert.match(sends[0].content,new RegExp('production_version: '+version.id));assert(sends[0].content.includes('一个提示词'));
 await f.store.execute(card.id,args);assert.equal(sends.length,1);
 assert.throws(()=>mutate(sent.doc,'prepare_execution',{...args,expected_revision:sent.doc.revision}),/正在排队/);
 const running=mutate(sent.doc,'start',{request_id:'9'.repeat(64)},bot);
 assert.equal(running.versions[0].status,'running');
 assert.throws(()=>mutate(sent.doc,'start',{request_id:'wrong'},bot),/指令/);
 assert.throws(()=>mutate(sent.doc,'start',{request_id:'9'.repeat(64)},{owner,pubkey:'d'.repeat(64)}),/Agent/);
});

test('rerunning a finished version snapshots revised prompt and replacement pictures into a new version without changing original inputs',()=>{
 let doc=seeded();doc=mutate(doc,'material',{kind:'person',file});doc=mutate(doc,'start',{request_id:'r'},bot);
 doc=mutate(doc,'deliver',{request_id:'r',evidence_id:'result',file},bot);
 doc=mutate(doc,'update_prompt',{request_id:'r',evidence_id:'revised-prompt',prompt:'修订后完整提示词'},bot);
 const old=structuredClone(doc.versions[0]);
 doc=mutate(doc,'prepare_execution',{executor:agent,prompt:doc.versions[0].revisedPrompt,materials:[{...file,kind:'product',name:'新产品.png'}]});
 assert.equal(doc.versions.length,2);assert.deepEqual(doc.versions[0],old);
 assert.equal(doc.versions[1].prompt,'修订后完整提示词');assert.equal(doc.versions[1].materials[0].kind,'product');assert.equal(doc.versions[1].status,'queued');
 assert.equal(doc.versions[0].prompt,'v1 提示词');
});

test('dispatch survives a Canvas receipt conflict and recovery never sends a second instruction',async()=>{
 const f=fixture(), record=await f.store.open(card,1);let sends=0;
 f.channels[0].members.push(agent);f.session.agentChoices={snapshot:()=>({selectable:[{pubkey:agent}]})};
 const save=f.session.canvas.save;let rejectReceipt=true;
 f.session.canvas.save=async(channel,content,expected)=>{
  if(readProduction({content})?.versions[0]?.dispatch?.messageId&&rejectReceipt)throw Error('conflict');
  return save(channel,content,expected);
 };
 f.session.messages={send:()=>{sends++;return '8'.repeat(64);}};
 const args={expected_revision:record.doc.revision,version_id:record.doc.currentVersion,executor:agent,prompt:'prompt',materials:[]};
 await assert.rejects(f.store.execute(card.id,args),/已交给 Buzz 发送/);assert.equal(sends,1);
 rejectReceipt=false;await f.store.execute(card.id,args);assert.equal(sends,1);
 const doc=(await f.store.read(record.channel)).doc;assert.equal(doc.versions[0].dispatch.messageId,'8'.repeat(64));
});

test('library retains owner scope and grouped reference files, while production versions contain independent file snapshots',async()=>{
 const {readLibrary,libraryContent,libraryChoices,selectedMaterials}=await import('../src/content-factory/material-library.mjs');
 const doc={schema:1,kind:'opcb.factory.library',owner,revision:0,entries:[{id:'anya',kind:'person',name:'Anya',files:[file]}]};
 const text=libraryContent('既有资料',doc);assert(text.startsWith('既有资料'));assert.deepEqual(readLibrary({content:text}),doc);
 const choices=libraryChoices(doc,seeded().versions[0],'person');const selected=selectedMaterials(choices,['anya']);
 assert.equal(selected[0].libraryName,'Anya');doc.entries[0].files[0]={...file,name:'replacement.png'};
 assert.equal(selected[0].name,'产品.png');
 const f=fixture();f.channels.push({id:'library',creator:owner,channelType:'solo',private:true,members:[owner]});f.heads.set('library',{id:'library-head',content:text});
 await f.store.refresh();assert.equal(f.store.snapshot().library.doc.entries[0].name,'Anya');
 f.switch();assert.equal(f.store.snapshot().library,null);
});

test('partial library uploads recover the successful originals and prevent a second upload from replacing the recovery record',async()=>{
 const {libraryContent}=await import('../src/content-factory/material-library.mjs');
 const f=fixture(),library={schema:1,kind:'opcb.factory.library',owner,revision:0,entries:[]};
 f.channels.push({id:'library',creator:owner,channelType:'solo',private:true,members:[owner]});
 f.heads.set('library',{id:'library-head',content:libraryContent('',library)});await f.store.refresh();
 let uploads=0;f.session.attachments={upload:async()=>{uploads++;if(uploads===2)throw Error('network');return file;}};
 const image={name:'原图.png',size:3,type:'image/png'};
 await assert.rejects(f.store.addLibraryFiles('person','角色',[image,image]),/已有1张图片上传/);
 await assert.rejects(f.store.addLibraryFiles('person','其他角色',[image]),/恢复上次上传/);assert.equal(uploads,2);
 const entry=await f.store.recoverLibraryUpload();assert.equal(entry.files.length,1);assert.equal(entry.files[0].sha256,file.sha256);
 assert.equal(uploads,2);assert.equal(f.store.snapshot().library.doc.entries.length,1);
 await assert.rejects(f.store.recoverLibraryUpload(),/没有待归档/);
});

test('legacy versions with one picture from a larger library group keep that exact picture selected for reruns',async()=>{
 const {libraryChoices,selectedMaterials}=await import('../src/content-factory/material-library.mjs');
 const second={...file,name:'全身.png',sha256:'d'.repeat(64),url:'https://fixture.invalid/full.png'};
 const library={entries:[{id:'character',kind:'person',name:'角色完整设定',files:[file,second]}]};
 const choices=libraryChoices(library,{materials:[{...file,kind:'person'}]},'person');
 const retained=choices.find(entry=>entry.id.startsWith('retained:'));
 assert(retained);assert.deepEqual(selectedMaterials(choices,[retained.id]).map(f=>f.sha256),[file.sha256]);
 assert.throws(()=>selectedMaterials(choices,['removed-entry']),/已变化/);
});

test('library rename uses current revision, preserves archived snapshots and rejects stale writes',async()=>{
 const {libraryContent,selectedMaterials}=await import('../src/content-factory/material-library.mjs');
 const f=fixture(),doc={schema:1,kind:'opcb.factory.library',owner,revision:0,entries:[{id:'product',kind:'product',name:'旧名',files:[file]}]};
 f.channels.push({id:'library',creator:owner,channelType:'solo',private:true,members:[owner]});
 f.heads.set('library',{id:'library-head',content:libraryContent('保留文字',doc)});await f.store.refresh();
 const archived=selectedMaterials(doc.entries,['product']);
 await f.store.renameLibrary('product','新产品名',0);
 assert.equal(f.store.snapshot().library.doc.entries[0].name,'新产品名');
 assert.equal(archived[0].libraryName,'旧名');assert.equal(archived[0].sha256,file.sha256);
 assert(f.heads.get('library').content.startsWith('保留文字'));
 const saves=f.counts().saves;await assert.rejects(f.store.renameLibrary('product','覆盖',0),/已有更新/);
 await assert.rejects(f.store.renameLibrary('product','  ',1),/名称/);assert.equal(f.counts().saves,saves);
 f.switch();await assert.rejects(f.store.renameLibrary('product','其他身份',1),/读取/);
});


test('workflow and template prompt histories are independent; switching versions never changes sealed production inputs',()=>{
 let doc=newProduction(card,owner),workflow=doc.prompts.workflow.current,template=doc.prompts.template.current;
 assert.match(doc.prompts.workflow.versions[0].text,/higgsfield_usage_update/);
 assert.equal(doc.prompts.template.versions[0].text,'');
 doc=mutate(doc,'save_prompt',{prompt_kind:'workflow',prompt_version:workflow,prompt:'工作流第二版'});
 assert.equal(doc.prompts.workflow.versions.length,2);assert.equal(doc.prompts.template.versions.length,1);
 doc=mutate(doc,'save_prompt',{prompt_kind:'template',prompt_version:template,prompt:'模板1.0'});
 doc=mutate(doc,'reference_video',{file:{...file,type:'video/mp4',name:'原视频.mp4'}});
 doc=mutate(doc,'prepare_execution',{executor:agent,prompt:'模板1.0',workflowPrompt:'工作流第二版',materials:doc.versions[0].materials});
 const snapshot=structuredClone(doc.versions[0]);
 assert.throws(()=>mutate(doc,'save_prompt',{prompt_kind:'workflow',prompt_version:workflow,prompt:'覆盖'}),/执行中/);
 doc=mutate(doc,'human_fail',{reason:'实际平台错误'});
 doc=mutate(doc,'save_prompt',{prompt_kind:'workflow',prompt_version:workflow,prompt:doc.prompts.workflow.versions[0].text});
 assert.equal(doc.prompts.workflow.current,workflow);assert.equal(doc.prompts.workflow.versions.length,2);
 assert.equal(doc.versions[0].workflowPrompt,snapshot.workflowPrompt);assert.equal(doc.versions[0].templateVersion,snapshot.templateVersion);
});

test('an empty template dispatch includes the full workflow and original video; exact derived prompt evidence creates a template version',async()=>{
 const video={...file,type:'video/mp4',name:'原视频.mp4'},f=fixture({readReference:async()=>new File(['abc'],'原视频.mp4',{type:'video/mp4'})});
 f.session.attachments={upload:async()=>video};const record=await f.store.open({...card,media_url:'signed'},1);
 f.session.agentChoices={snapshot:()=>({selectable:[{pubkey:agent}]})};f.session.channelWrites.addAgents=async(id,keys)=>f.channels.find(c=>c.id===id).members.push(...keys);
 const sends=[];f.session.messages={send:(...args)=>{sends.push(args);return '9'.repeat(64);}};
 const workflow=record.doc.prompts.workflow.versions[0].text;
 const queued=await f.store.execute(card.id,{expected_revision:record.doc.revision,version_id:record.doc.currentVersion,executor:agent,prompt:'',workflowPrompt:workflow,materials:[{...video,kind:'reference'}]});
 assert.equal(sends.length,1);assert(sends[0][1].includes(workflow));assert.match(sends[0][1],/尚未反推/);assert.equal(sends[0][3][0].url,video.url);
 let doc=mutate(queued.doc,'update_template_prompt',{request_id:'9'.repeat(64),evidence_id:'proof',prompt:'实际反推模板1.0'},bot);
 assert.equal(doc.prompts.template.versions.length,1);assert.equal(doc.prompts.template.versions[0].number,1);assert.equal(doc.versions[0].prompt,'');assert.equal(doc.versions[0].derivedPrompt,'实际反推模板1.0');
 assert.throws(()=>mutate(doc,'update_template_prompt',{request_id:'other',evidence_id:'proof',prompt:'wrong'},bot),/真实回执/);
});

test('reference video import is idempotent per Solo and conflict recovery reuses uploaded bytes',async()=>{
 let reads=0,uploads=0;
 const video={...file,type:'video/mp4'},f=fixture({readReference:async()=>{reads++;return new File(['abc'],'原片.mp4',{type:'video/mp4'});}});
 f.session.attachments={upload:async()=>{uploads++;return video;}};
 const record=await f.store.open({...card,media_url:'signed-secret-ticket'},1);
 assert.equal(record.doc.referenceVideo.url,file.url);assert.equal(record.doc.versions[0].materials[0].kind,'reference');
 assert(!JSON.stringify(record.doc).includes('signed-secret-ticket'));
 await f.store.open({...card,media_url:'new-ticket'},1);assert.equal(reads,1);assert.equal(uploads,1);
 const save=f.session.canvas.save;let conflict=true;f.session.canvas.save=async(...args)=>{if(conflict)throw Error('conflict');return save(...args);};
 await assert.rejects(f.store.syncReference(card,new File(['def'],'替换.mp4',{type:'video/mp4'})),/conflict/);
 assert.equal(uploads,2);conflict=false;await f.store.syncReference(card);assert.equal(uploads,2);assert.equal(reads,1);
});

test('reference source validation rejects unrelated URLs and reports host byte limits without trimming',async()=>{
 const {loadReferenceVideo,referenceSource}=await import('../src/content-factory/reference-video.mjs');
 for(const media_url of ['https://example.org/movie.mp4','https://staging.paolab.cn/ins/media/a.mp4','https://staging.paolab.cn/ins/media/../private?opcb_media=x'])assert.throws(()=>referenceSource({media_url}));
 const video={media_url:'https://staging.paolab.cn/ins/media/a.mp4?opcb_media=private'};let input;
 const f=await loadReferenceVideo({host:{requestBytes:async args=>{input=args;return{status:200,headers:{'content-type':'video/mp4'},body:new Uint8Array([1,2,3])};}}},video);
 assert.equal(input.maxBytes,16*1024*1024);assert.equal(f.size,3);
 await assert.rejects(loadReferenceVideo({host:{requestBytes:async()=>{throw Error('cap');}}},video),/16MB/);
});

test('legacy input archives migrate without losing original prompts or evidence',async()=>{
 const f=fixture();const old=seeded();delete old.prompts;
 f.channels.push({id:'legacy',creator:owner,private:true,channelType:'solo',members:[owner]});f.heads.set('legacy',{id:'old',content:productionContent('其他资料',old)});
 const record=await f.store.open(card,1);assert(record.doc.prompts);assert.equal(record.doc.prompts.template.versions[0].text,old.versions[0].prompt);
 assert.deepEqual(record.doc.versions,old.versions);assert(f.heads.get('legacy').content.startsWith('其他资料'));assert.equal(f.counts().creation,0);
});


test('derived template tool requires exact owner dispatch and Agent prompt evidence',async()=>{
 const {registerProductionAgent}=await import('../src/content-factory/production-agent.mjs');const f=fixture(),record=await f.store.open(card,1),channel=record.channel,request='1'.repeat(64),evidence='2'.repeat(64);
 f.channels[0].members.push(agent);
 let doc=mutate(record.doc,'prepare_execution',{executor:agent,prompt:'原模板',materials:[]});
 doc=mutate(doc,'dispatch_receipt',{dispatch_id:doc.versions[0].dispatch.id,message_id:request});
 f.heads.set(channel,{id:'queued',content:productionContent('',doc)});
 const messages=new Map([[request,{id:request,authorId:owner,channelId:channel,createdAt:Math.floor(Date.now()/1000),content:'production_version: '+doc.currentVersion+'\ndispatch_id: '+doc.versions[0].dispatch.id}],[evidence,{id:evidence,authorId:agent,channelId:channel,createdAt:Math.floor(Date.now()/1000),content:'production_version: '+doc.currentVersion}]]);
 f.session.thread=(ch,id)=>({refresh:async()=>{},snapshot:()=>({targetStatus:'ready',target:messages.get(id)}),dispose(){}});
 let tool;const relay={snapshot:()=>f.connection},ctx={relay,agents:{relay:()=>relay,addInstructions(){},addTool:t=>tool=t}},client={owner,pubkey:agent,key:'test',signal:new AbortController().signal,effectiveEdit:async()=>{}};
 registerProductionAgent(ctx,f.store);
 const args={action:'update_template_prompt',expected_revision:doc.revision,version_id:doc.currentVersion,request_id:request,evidence_id:evidence,prompt:'真实反推模板1.0'};
 await assert.rejects(tool.call(client,{channel},args),/完整提示词/);
 messages.get(evidence).content+='\n'+args.prompt;
 await tool.call(client,{channel},args);
 assert.equal((await f.store.read(channel)).doc.versions[0].derivedPrompt,args.prompt);
 assert.equal((await f.store.read(channel)).doc.versions[0].status,'queued');
});


test('notes are immutable execution snapshots; a new round keeps its own notes and limits input',()=>{
 let doc=seeded();doc=mutate(doc,'prepare_execution',{executor:agent,prompt:'template',materials:[],notes:'保持原片服装，只换脸'});
 const original=structuredClone(doc.versions[0]);
 doc=mutate(doc,'start',{request_id:'9'.repeat(64)},bot);
 doc=mutate(doc,'deliver',{request_id:'9'.repeat(64),evidence_id:'result',file},bot);
 doc=mutate(doc,'prepare_execution',{executor:agent,prompt:'template 2',materials:[],notes:'改为产品特写'});
 assert.equal(doc.versions[0].notes,original.notes);assert.equal(doc.versions[1].notes,'改为产品特写');
 assert.throws(()=>mutate(seeded(),'prepare_execution',{executor:agent,prompt:'p',materials:[],notes:'x'.repeat(3001)}),/备注/);
});

test('changing the right Solo audience during preparation aborts before saving or sending',async()=>{
 const f=fixture(),record=await f.store.open(card,1);let selected=agent,sends=0;
 f.session.agentChoices={snapshot:()=>({selectable:[{pubkey:agent}]})};
 f.session.channelWrites.addAgents=async(id,keys,active)=>{assert(active());f.channels[0].members.push(...keys);selected='c'.repeat(64);};
 f.session.messages={send:()=>{sends++;return '9'.repeat(64);}};
 await assert.rejects(f.store.execute(card.id,{expected_revision:record.doc.revision,version_id:record.doc.currentVersion,executor:agent,getExecutor:()=>selected,prompt:'p',materials:[]}),/Agent已变化/);
 assert.equal(sends,0);assert.equal((await f.store.read(record.channel)).doc.versions[0].status,'draft');
});


test('the real community key limit is respected and a stranded original dispatch resumes with its sealed inputs',async()=>{
 const scope='https://paogroup.communities.buzz.xyz:'+owner;
 const f=fixture({scope}), record=await f.store.open(card,1);
 f.channels[0].members.push(agent);
 const original=mutate(record.doc,'prepare_execution',{
  executor:agent,prompt:'原提示词',notes:'保留原盔甲',materials:[{...file,kind:'person'}],
 });
 const originalVersion=original.versions[0];
 const legacyKey=`opcb.factory.dispatch.v1:${scope}:${owner}:${originalVersion.dispatch.id}`;
 assert(legacyKey.length>200);
 f.heads.set(record.channel,{id:'legacy-rc9',content:productionContent('',original)});
 const sends=[];
 f.session.outbox={ready:async()=>{},snapshot:()=>[],recovery:async()=>undefined};
 f.session.messages={send:(channel,content,mentions,attachments,recovery)=>{
  if(recovery.key.length>200)throw Error('Invalid outbox recovery state');
  sends.push({channel,content,mentions,attachments,recovery});
  return '9'.repeat(64);
 }};
 const result=await f.store.execute(card.id,{getExecutor:()=>agent});
 await f.store.execute(card.id,{getExecutor:()=>agent});
 assert.equal(sends.length,1);
 assert.equal(sends[0].channel,record.channel);
 assert.deepEqual(sends[0].mentions,[agent]);
 assert.match(sends[0].content,/保留原盔甲/);
 assert.match(sends[0].content,new RegExp('dispatch_id: '+originalVersion.dispatch.id));
 assert.deepEqual(sends[0].attachments,originalVersion.materials);
 assert.equal(result.doc.versions.length,1);
 assert.equal(result.doc.currentVersion,originalVersion.id);
 assert.equal(result.doc.versions[0].dispatch.messageId,'9'.repeat(64));
});

test('a synchronously rejected send can continue and a native delivery failure retries only its original event',async()=>{
 const f=fixture(), record=await f.store.open(card,1);
 f.channels[0].members.push(agent);
 f.session.agentChoices={snapshot:()=>({selectable:[{pubkey:agent}]})};
 const entries=[], retries=[];let attempts=0;
 f.session.outbox={ready:async()=>{},snapshot:()=>entries,recovery:async key=>entries.find(item=>item.recovery.key===key),retry:id=>retries.push(id)};
 f.session.messages={send:(channel,content,mentions,attachments,recovery)=>{
  if(++attempts===1)throw Error('native pre-queue rejection');
  const id='8'.repeat(64);
  entries.push({event:{id},delivery:'unknown',recovery});
  return id;
 }};
 const args={expected_revision:record.doc.revision,version_id:record.doc.currentVersion,executor:agent,getExecutor:()=>agent,prompt:'保留同一版',materials:[]};
 await assert.rejects(f.store.execute(card.id,args),/native pre-queue rejection/);
 const failed=(await f.store.read(record.channel)).doc.versions[0];
 assert.equal(failed.dispatch.state,'retryable');
 const submitted=await f.store.execute(card.id,args);
 assert.equal(submitted.doc.versions[0].dispatch.id,failed.dispatch.id);
 const retried=await f.store.execute(card.id,args);
 assert.match(retried.deliveryNotice,/原消息/);
 assert.deepEqual(retries,['8'.repeat(64)]);
 assert.equal(attempts,2);
});

test('an interrupted native submission with no surviving receipt never creates a second event',async()=>{
 const f=fixture(), record=await f.store.open(card,1);
 f.channels[0].members.push(agent);
 const prepared=mutate(record.doc,'prepare_execution',{executor:agent,prompt:'p',materials:[],nativeDispatch:true});
 const interrupted=mutate(prepared,'dispatch_attempt',{dispatch_id:prepared.versions[0].dispatch.id});
 f.heads.set(record.channel,{id:'interrupted',content:productionContent('',interrupted)});
 f.session.messages={send:()=>assert.fail('an ambiguous submission cannot be sent again')};
 await assert.rejects(f.store.execute(card.id,{getExecutor:()=>agent}),/结果待核对/);
});
