// Local synthetic preview only. The temporary signing identity is never a Buzz user.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {generateSecretKey,getPublicKey} from 'nostr-tools/pure';
import {pythonRuntime} from './python_runtime.mjs';
import {knowledgeDesign} from './knowledge_design.mjs';
const key=generateSecretKey(),owner=getPublicKey(key),community='c'.repeat(64);
const child=spawn(pythonRuntime(),['tests/knowledge_gateway_fixture.py',community,owner,'services/knowledge/dist/identity-auth.mjs',process.execPath,'--preview'],{stdio:['pipe','pipe','inherit']});
const [line]=await once(createInterface({input:child.stdout}),'line');
const backend=`http://127.0.0.1:${JSON.parse(line).port}`;
const output=await build({stdin:{resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {finalizeEvent} from 'nostr-tools/pure';
import * as reader from './src/knowledge/reader.mjs';import * as admin from './src/knowledge/admin.mjs';
const owner=${JSON.stringify(owner)},community=${JSON.stringify(community)},key=new Uint8Array(${JSON.stringify([...key])});
const channel={id:'private-demo',name:'本地演示私人对话',visibility:'private'};let items=[];
const profiles=new Map([[owner,{name:'演示管理员'}],...['资料负责人','项目负责人','内容协作者','研究协作者'].map((name,i)=>[String(i+1).repeat(64),{name}])]);
const session={viewer:owner,relayAuthor:community,channels:{get:()=>channel,list:()=>({channels:[channel]})},profiles:{snapshot:()=>profiles,subscribe:()=>()=>{}},read:async()=>[...profiles].map(([pubkey,p])=>({pubkey,kind:0,tags:[],content:JSON.stringify(p)})),outbox:{supports:k=>k===45010,ready:async()=>{},snapshot:()=>items,subscribe:()=>()=>{},send:input=>{const signed=finalizeEvent({...input,created_at:Math.floor(Date.now()/1000)},key);items=[{event:signed,signed,delivery:'accepted'}];return signed.id;}}};
const connection={status:'ready',generation:1,session};
const ctx={react:React,relay:{snapshot:()=>connection,subscribe:()=>()=>{}},host:{request:async r=>{const response=await fetch('/gateway/'+new URL(r.url).pathname.split('/').at(-1),{method:r.method,headers:r.headers,body:r.body});return {status:response.status,body:await response.text()};}},agents:{addTool:()=>{},addInstructions:()=>{}},effect:fn=>fn(),pages:{register:page=>createRoot(document.getElementById('app')).render(React.createElement(page.component))}};
(location.pathname==='/admin'?admin:reader).apply(ctx);
`},define:await knowledgeDesign(),bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const server=createServer(async(req,res)=>{
  if(req.url==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(output.outputFiles[0].text);return;}
  if(req.url.startsWith('/gateway/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const response=await fetch(backend+'/'+req.url.slice(9),{method:'POST',headers:{'Content-Type':'application/json'},body:Buffer.concat(chunks)});
    res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());return;
  }
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>知识库2.0本地演示</title><style>:root{color-scheme:light dark;--surface-panel:light-dark(#fff,#202225);--surface-inset:light-dark(#f2f3f5,#292c31);--text-standard:light-dark(#24272c,#e5e7eb);--text-subtle:light-dark(#656b74,#aeb4be);--border-standard:light-dark(#dde0e5,#41464e)}*{box-sizing:border-box}body{margin:0;height:100dvh;display:flex;flex-direction:column;font-family:system-ui,-apple-system,'PingFang SC',sans-serif;background:var(--surface-panel);color:var(--text-standard)}button:disabled{opacity:.45;cursor:default!important}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #3578d4;outline-offset:2px}a{color:light-dark(#2b5fa0,#9dc4ff)}nav.demo{padding:12px 24px;border-bottom:1px solid var(--border-standard);display:flex;gap:20px;align-items:center;flex-wrap:wrap}#app{flex:1;min-height:0}</style><nav class="demo"><strong>本地演示数据 · 非真实 Buzz 登录</strong><a href="/reader">知识库</a><a href="/admin">知识库管理</a></nav><div id="app"></div><script type="module" src="/preview.js"></script></html>`);
});
server.listen(18768,'127.0.0.1',()=>console.log('Local synthetic preview http://127.0.0.1:18768/reader'));
const stop=()=>{server.close();child.stdin.end('\n');};process.on('SIGINT',stop);process.on('SIGTERM',stop);
