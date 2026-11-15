/** Isolated host harness. Inputs stay outside the repository; no real writes or identities. */
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const [output,canvasFile,libraryFile,planFile]=process.argv.slice(2);
if(!output||!canvasFile)throw Error('output, private Canvas and optional library/plan JSON paths required');
const content=await readFile(canvasFile,'utf8');
const library=libraryFile?JSON.parse(await readFile(libraryFile,'utf8')):null;
const plan=planFile?JSON.parse(await readFile(planFile,'utf8')):null;
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {apply} from './src/commercial/plugin.mjs';
const root=createRoot(document.getElementById('app')),owner='1'.repeat(64),channel='7dc199bc-755b-47bb-8f71-fe311b1f1ab1';
let head={id:'a'.repeat(64),content:${JSON.stringify(content)},created_at:1794700000},revoked=false,readCount=0;const callbacks=new Set(),rosterCallbacks=new Set(),prefs={library:${JSON.stringify(library)},'commercial-plan':${JSON.stringify(plan)}};
const session={viewer:owner,channels:{list:()=>({status:'ready',channels:revoked?[]:[{id:channel,members:[owner],creator:owner}]}),subscribeList:f=>(rosterCallbacks.add(f),()=>rosterCallbacks.delete(f)),ensureList(){}},canvas:{available:true,read:async()=>{readCount++;return head;},save:async(id,content,expected)=>{if(expected!==head.id)throw Error('conflict');head={...head,id:crypto.randomUUID().replaceAll('-','').repeat(2),content};for(const f of callbacks)f({channelId:channel,events:[]});return head;}},subscribeLive:f=>(callbacks.add(f),()=>callbacks.delete(f))};
const connection={status:'ready',session,scope:'isolated',generation:1};
apply({react:React,relay:{snapshot:()=>connection,subscribe:()=>()=>{}},pages:{register:p=>root.render(React.createElement(p.component))},artifactStorage:{open:()=>({preferences:{get:async k=>prefs[k],update:async(k,f)=>{prefs[k]=f(prefs[k]);}},subscribe:()=>()=>{},close(){}})}});
window.COMMERCIAL_HARNESS={session,get readCount(){return readCount;},get head(){return head;},change(content){head={...head,id:crypto.randomUUID().replaceAll('-','').repeat(2),content};for(const f of callbacks)f({channelId:channel,events:[]});},revoke(){revoked=true;for(const f of rosterCallbacks)f();},restore(){revoked=false;for(const f of rosterCallbacks)f();},unmount(){root.unmount();}};`},define:{OPCB_REPORT_ICON:JSON.stringify('')},loader:{'.css':'text','.html':'text'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',charset:'utf8'});
await writeFile(output,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商业计划 · 隔离宿主回归</title><style>html,body,#app{width:100%;height:100%;margin:0}html{--surface-panel:#fefcfb}html[data-test-theme=dark]{--surface-panel:#222123}</style><div id="app"></div><script type="module">${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></html>`);
console.log('Built private host harness:',output);
