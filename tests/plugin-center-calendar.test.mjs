import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {validateInstalledEntrypoints,createDirectoryStore,loadDirectory,installSource,CATALOG_REFERENCE,REPOSITORY} from '../src/plugin-center/directory.mjs';
import {createPage} from '../src/plugin-center/page.mjs';

const head='a'.repeat(40);
const registry=JSON.parse(await readFile(new URL('../REGISTRY.json',import.meta.url)));
const entry=validateInstalledEntrypoints(registry.installedEntrypoints)[0];
const request=async({url})=>({status:200,body:JSON.stringify(url.endsWith('/commits/'+encodeURIComponent(CATALOG_REFERENCE))?{sha:head}:{encoding:'base64',content:Buffer.from(JSON.stringify(registry)).toString('base64')})});

test('calendar metadata loads at the same pinned catalog revision without becoming an install source',async()=>{
 const directory=await loadDirectory(request);
 assert.equal(directory.installedEntrypoints[0].id,'opcb.team-calendar');
 assert.equal(directory.installedEntrypoints[0].category,'工作协作');
 assert(!directory.entries.some(e=>e.installedEntrypoint));
 assert.throws(()=>installSource(directory.installedEntrypoints[0],head),/不发起安装/);
 for(const value of [[{...registry.installedEntrypoints[0],pageId:'../settings'}],[registry.installedEntrypoints[0],registry.installedEntrypoints[0]]])assert.throws(()=>validateInstalledEntrypoints(value));
 assert.deepEqual(validateInstalledEntrypoints(undefined),[]);
});

test('calendar opens the exact registered page only after fresh installation check; no install or background navigation',async()=>{
 const calls=[];let installed='installed',reviews=0;
 const store=createDirectoryStore(request,{getInstallationStatus:()=>installed,requestInstall:()=>reviews++},{open:async target=>{calls.push(target);return {status:'opened'};}});
 await store.refresh();assert.deepEqual(calls,[]);
 const target=store.snapshot().installedEntrypoints[0];
 await store.review(target);assert.equal(reviews,0);
 await store.open({...target});assert.deepEqual(calls,[]);
 await store.open(target);
 assert.deepEqual(calls,[{version:1,kind:'plugin',pluginId:'opcb.team-calendar',pageId:'main'}]);
 installed='absent';await store.open(target);assert.equal(calls.length,1);assert.match(store.snapshot().notice,/安装与授权/);
 assert.equal(reviews,0);
 store.dispose();await store.open(target);assert.equal(calls.length,1);
});

test('unavailable installation checks and failed navigation never claim an opened calendar',async()=>{
 for(const [installer,navigation] of [[{},{}],[{getInstallationStatus:()=>{throw Error('not ready');}},{}],[{getInstallationStatus:()=> 'installed'},{}],[{getInstallationStatus:()=> 'installed'},{open:async()=>({status:'failed'})}],[{getInstallationStatus:()=> 'installed'},{open:async()=>{throw Error('disabled');}}]]){
  const store=createDirectoryStore(request,installer,navigation);await store.refresh();await store.open(store.snapshot().installedEntrypoints[0]);
  assert(store.snapshot().notice);assert.doesNotMatch(store.snapshot().notice,/已打开/);assert.equal(store.snapshot().busy,'');
 }
});

test('team collaboration shows the installed calendar with an open action and hides it when absent or unknown',()=>{
 const snapshot={status:'ready',entries:[],installedEntrypoints:[entry],commit:head,busy:'',notice:'',error:''};
 for(const installed of ['installed','absent','unavailable']){
  const Page=createPage(React,{snapshot:()=>snapshot,subscribe:()=>()=>{}},{getInstallationStatus:()=>installed},{},'');
  const html=renderToStaticMarkup(React.createElement(Page));
  assert(html.includes('团队协作'));
  assert.equal(html.includes('打开日历'),installed==='installed');
  assert.equal(html.includes('data-entry="opcb.team-calendar"'),installed==='installed');
  assert(!html.includes('vinstalled'));
 }
 assert.equal(registry.repository,REPOSITORY);
});

test('an existing cloud calendar has one open card even when a separate older installable release is in the directory',()=>{
 const release={...entry,installedEntrypoint:false,version:'1.0.6-portable.1'};
 const snapshot={status:'ready',entries:[release],installedEntrypoints:[entry],commit:head,busy:'',notice:'',error:''};
 for(const status of ['installed','absent']){
  const Page=createPage(React,{snapshot:()=>snapshot,subscribe:()=>()=>{}},{getInstallationStatus:()=>status},{},'');
  const html=renderToStaticMarkup(React.createElement(Page));
  assert.equal(html.match(/data-entry="opcb.team-calendar"/g)?.length,1);
  assert.equal(html.includes('打开日历'),status==='installed');
  assert.equal(html.includes('v1.0.6-portable.1'),status==='absent');
 }
});
