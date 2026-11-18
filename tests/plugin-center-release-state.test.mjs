import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {releaseState,releaseAction,currentEntries,compareCatalogVersions} from '../src/plugin-center/release-state.mjs';
import {createNativeReview,validateInstallations} from '../src/plugin-center/native-review.mjs';
import {createDirectoryStore,validateRegistry,installSource,REPOSITORY,CATALOG_REFERENCE} from '../src/plugin-center/directory.mjs';
import {createPage} from '../src/plugin-center/page.mjs';
import {createInstallCard,formatInstallCard} from '../src/plugin-center/install-card.mjs';

const viewer='1'.repeat(64),revision='a'.repeat(64),head='b'.repeat(40);
const source={repository:`https://github.com/${REPOSITORY}`,reference:'distribution/example',path:'.',commit:head};
const entry={id:'opcb.example',name:'示例插件',version:'0.3.5',category:'工具',summary:'简介',requirements:'条件',sourcePath:'plugins/opcb.example/0.3.5',downloadPath:'releases/example.zip',reviewSource:source,release:{revision,publisher:null}};
const row=patch=>({id:entry.id,enabled:true,bundled:false,revision:'c'.repeat(64),source:{kind:'git',repository:source.repository,reference:'distribution/old',commit:'d'.repeat(40)},...patch});
const relay=()=>({snapshot:()=>({status:'ready',viewer,scope:'community:owner',session:{profiles:{snapshot:()=>new Map([[viewer,{name:'测试本人'}]])}}})});
const response=data=>({status:200,body:JSON.stringify(data)});
const request=async({url})=>url.endsWith('/commits/'+encodeURIComponent(CATALOG_REFERENCE))?response({sha:head}):response({encoding:'base64',content:Buffer.from(JSON.stringify({schema:1,repository:REPOSITORY,entries:[{...entry,reviewSource:{...source,repository:REPOSITORY}}]})).toString('base64')});

test('real registry defaults to one current version per line; numeric rc order, full release and 1.3/1.4 are preserved',async()=>{
 const {entries}=JSON.parse(await readFile(new URL('../REGISTRY.json',import.meta.url)));
 const selected=currentEntries(entries);
 assert.equal(selected.filter(e=>e.id==='opcb.plugin-center').length,1);
 assert.equal(selected.find(e=>e.id==='opcb.task-center').version,'2.0.0-rc.19');
 assert.equal(selected.find(e=>e.id==='opcb.project-workspace').version,'0.1.0-rc.22');
 assert.equal(selected.filter(e=>e.id==='opcb.higgsfield-mailbox').length,2);
 assert.equal(currentEntries(entries,true),entries);
 assert(compareCatalogVersions('0.1.0-rc.21','0.1.0-rc.9')>0);
 assert(compareCatalogVersions('0.1.0','0.1.0-rc.21')>0);
});

test('native membership plus exact artifact identity distinguishes same, different, absent and unavailable without guessing',()=>{
 const installed={installationStatus:'ready',installations:[row({revision})]};
 assert.equal(releaseState(undefined,entry,source,installed),'current');
 assert.equal(releaseState(undefined,entry,source,{...installed,installations:[row()]}),'different');
 assert.equal(releaseState(undefined,entry,source,{...installed,installations:[]}),'absent');
 assert.equal(releaseState({getInstallationStatus:()=> 'installed'},entry,source),'unknown');
 assert.equal(releaseState({getInstallationStatus:()=> 'installed',compareInstallationRelease:()=> 'unknown'},entry,source),'unknown');
 assert.equal(releaseState({getInstallationStatus:()=>{throw Error('not ready');}},entry,source),'unavailable');
 assert.deepEqual(releaseAction('current'),{label:'已安装',disabled:true});
 assert.equal(releaseAction('different').label,'检查更新');
});

test('same-release page and chat card disable review; different-release page exposes an update; render never requests installation',()=>{
 for(const [installedRevision,label] of [[revision,'已安装'],['c'.repeat(64),'检查更新']]){
  const state={status:'ready',entries:[entry],commit:head,busy:'',notice:'',error:'',installationStatus:'ready',installations:[row({revision:installedRevision})]};
  const store={snapshot:()=>state,subscribe:()=>()=>{},review:()=>{throw Error('no install while rendering');}};
  const Page=createPage(React,store,{getInstallationStatus:()=> 'installed'},{},'');
  const html=renderToStaticMarkup(React.createElement(Page));
  assert(html.includes(label));assert(!html.includes('查看更新'));
  if(label==='已安装')assert.match(html,/disabled="" aria-label="已安装/);
  const Card=createInstallCard(React,store,{getInstallationStatus:()=> 'installed'},{},'');
  const card=renderToStaticMarkup(React.createElement(Card,{message:{content:formatInstallCard(entry,head)}}));
  assert(card.includes(label));assert(!card.includes('查看更新'));
 }
});

test('native bridge reads current viewer and opens one native review preserving saved Git URL, catalog branch and pin',async()=>{
 for(const repository of [source.repository,source.repository+'.git']){
  let attribution,inputs=[],installed=row({source:{kind:'git',repository}});
  const api={list:async()=>({plugins:[installed]}),request:()=>{throw Error('must not use agent request service to change installations');}};
  const bridge=createNativeReview({forAgent:who=>{attribution=who;return api;}},relay(),{}, {requestInstall:async input=>{inputs.push(input);installed={...installed,revision};return 'updated';}});
  await bridge.list();assert.equal(attribution.pubkey,viewer);assert.equal(attribution.name,'测试本人');assert.equal(inputs.length,0);
  assert.equal(await bridge.review(entry,source),'示例插件已更新');
  assert.deepEqual(inputs,[{...source,repository}]);
 }
});

test('same bytes are skipped; existing pending operations reopen review without duplicate requests; foreign/folder sources do not migrate',async()=>{
 for(const [installed,pattern] of [[row({revision}),/一致/],[row({pendingRequest:{id:'pending',action:'remove'}}),/已有待审核/],[row({source:{kind:'folder'}}),/其他来源/],[row({source:{kind:'git',repository:'https://other.invalid/repo'}}),/其他来源/]]){
  let calls=0;
  const bridge=createNativeReview({forAgent:()=>({list:async()=>({plugins:[installed]}),request:async()=>calls++})},relay(),{open:async()=>({status:'opened'})});
  if(installed.pendingRequest||installed.revision===revision)assert.match(await bridge.review(entry,source),pattern);
  else await assert.rejects(bridge.review(entry,source),pattern);
  assert.equal(calls,0);
 }
});

test('new install is pinned; account switching, cancellation and unavailable reviews never claim installation',async()=>{
 let inputs=[],installed=[];
 const api={list:async()=>({plugins:installed})};
 const bridge=createNativeReview({forAgent:()=>api},relay(),{}, {requestInstall:async input=>{inputs.push(input);installed=[row({revision})];return 'installed';}});
 assert.equal(await bridge.review(entry,source),'示例插件已安装');assert.deepEqual(inputs,[source]);
 for(const outcome of ['cancelled','unavailable']){
  const stopped=createNativeReview({forAgent:()=>({list:async()=>({plugins:[row()]})})},relay(),{}, {requestInstall:async()=>outcome});
  assert.doesNotMatch(await stopped.review(entry,source),/已安装|已更新/);
 }
 const r=relay(),original=r.snapshot();let switched=false,calls=0;
 const blocked=createNativeReview({forAgent:()=>({list:async()=>{switched=true;return {plugins:[]};}})},{snapshot:()=>({...original,viewer:switched?'2'.repeat(64):viewer})},{},{requestInstall:async()=>calls++});
 await assert.rejects(blocked.review(entry,source),/切换/);assert.equal(calls,0);
 const fail=createNativeReview({forAgent:()=>({list:async()=>{throw Error('not ready');}})},r,{});
 await assert.rejects(fail.list(),/not ready/);
 for(const patch of [{revision:'v1'},{id:entry.id,bundled:'false'},{enabled:null}])assert.throws(()=>validateInstallations({plugins:[row(patch)]}));
});

test('store refreshes local identities with catalog load, and review uses the native request bridge',async()=>{
 let listed=0,reviewed=0;
 const store=createDirectoryStore(request,{requestInstall:()=>{throw Error('legacy installer not expected');}},null,{supported:true,list:async()=>{listed++;return [row()];},review:async()=>{reviewed++;return '审核已提交';}});
 await store.refresh();assert.equal(store.snapshot().installationStatus,'ready');assert.equal(listed,1);
 await store.review(store.snapshot().entries[0]);assert.equal(reviewed,1);assert.equal(listed,2);assert.equal(store.snapshot().notice,'审核已提交');
});

test('registry keeps exact declared Git URL spelling and refuses unrelated repositories or malformed release identities',()=>{
 for(const repository of [source.repository,source.repository+'.git']){
  const [validated]=validateRegistry({schema:1,repository:REPOSITORY,entries:[{...entry,reviewSource:{...source,repository}}]});
  assert.equal(installSource(validated,head).repository,repository);
 }
 for(const patch of [{reviewSource:{...source,repository:'https://github.com/other/repo'}},{release:{revision:'v0.3.5',publisher:null}}])assert.throws(()=>validateRegistry({schema:1,repository:REPOSITORY,entries:[{...entry,...patch}]}));
});

test('published native identities match packaging and all 17 actual recorded native baseline revisions',()=>{
 execFileSync('python3',['scripts/release_identity.py','--check'],{cwd:new URL('../',import.meta.url)});
 execFileSync('python3',['-c',"from pathlib import Path; import json; from scripts.release_identity import release_identity; b=json.loads(Path('BASELINE.json').read_bytes()); assert all(release_identity(Path(x['sourcePath']))['revision']==x['revision'] for x in b['targets'])"],{cwd:new URL('../',import.meta.url)});
});
