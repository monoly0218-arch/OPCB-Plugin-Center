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
function fixture(){
 const heads=new Map(),memory=new Map(),listeners=new Set(),channels=[],messages=[];let serial=0,creation=0,saves=0;
 let roster={status:'ready',channels};
 const session={viewer:owner,channels:{list:()=>roster,subscribeList:()=>()=>{},ensureList(){}},canvas:{available:true,read:async id=>heads.get(id)||null,save:async(id,content,expected)=>{saves++;if((heads.get(id)?.id||null)!==(expected||null))throw Error('conflict');const event={id:'head-'+(++serial),content};heads.set(id,event);return event;}},channelWrites:{available:true,start(id,name){creation++;channels.push({id,name,creator:owner,private:true,channelType:'solo',members:[owner],archived:false});return{create:'operation',ready:Promise.resolve()};},refresh:async()=>{}},subscribeLive:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 const connection={status:'ready',scope:'test:'+owner,generation:1,session};let current=connection;
 const store=createProductionStore({relay:{snapshot:()=>current}},{storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}});store.bind(connection);
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
 f.session.memberAdditions={add:async(channel,key)=>{f.channels.find(c=>c.id===channel).members.push(key);}};
 f.session.messages={send:(channel,content,mentions,attachments,recovery)=>{
  sends.push({channel,content,mentions,attachments,recovery});return '9'.repeat(64);
 }};
 const args={expected_revision:record.doc.revision,version_id:record.doc.currentVersion,executor:agent,prompt:'一个提示词',materials:[{...file,kind:'person'}]};
 const sent=await f.store.execute(card.id,args), version=sent.doc.versions[0];
 assert.equal(version.status,'queued');assert.equal(version.dispatch.messageId,'9'.repeat(64));
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
 await assert.rejects(f.store.execute(card.id,args),/已进入原生发送队列/);assert.equal(sends,1);
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
