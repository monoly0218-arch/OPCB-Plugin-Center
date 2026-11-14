// Local synthetic preview only. The temporary signing identity is never a Buzz user.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createIdentityClient,identity} from '../src/knowledge/identity-client.mjs';
import {commitDeposit} from '../plugins/opcb.chat-artifacts/2.0.0/plugin.js';
import {generateSecretKey,getPublicKey,finalizeEvent} from 'nostr-tools/pure';
import {knowledgeDesign} from './knowledge_design.mjs';
import {pythonRuntime} from './python_runtime.mjs';
const key=generateSecretKey(),owner=getPublicKey(key),community='c'.repeat(64);
const child=spawn(pythonRuntime(),['tests/knowledge_gateway_fixture.py',community,owner,'services/knowledge/dist/identity-auth.mjs',process.execPath,'--preview','--collection'],{stdio:['pipe','pipe','inherit']});
const [line]=await once(createInterface({input:child.stdout}),'line');
const backend=`http://127.0.0.1:${JSON.parse(line).port}`;
const iconBytes=new Uint8Array(await readFile('plugins/opcb.chat-artifacts/2.0.0/icon.png'));
const data=new Map(),principal=identity(owner,community);
const service=createIdentityClient({request:async r=>{const response=await fetch(backend+'/'+new URL(r.url).pathname.split('/').at(-1),{method:'POST',headers:r.headers,body:r.body});return{status:response.status,body:await response.text()}}},{role:'collect',actor:owner,actorScoped:true,storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,v),remove:async k=>data.delete(k)}});
await service.bind(principal,content=>finalizeEvent({kind:45010,created_at:Math.floor(Date.now()/1000),tags:[['h','private-demo']],content},key));
for(const [n,kind,title,file] of [[1,'image','品牌主图 V3（演示）',{bytes:iconBytes,mime:'image/png'}],[2,'document','项目交付说明（演示）',{bytes:new TextEncoder().encode('# 交付说明\n此为本地测试资料'),mime:'text/markdown'}],[3,'link','参考网页（演示）',undefined]]){
 await commitDeposit(service,principal,{source_id:String(n).repeat(64)+':https://example.com/fixture/'+n,title,kind,source_url:'https://example.com/fixture/'+n,channel_id:'private-demo',message_id:String(n).repeat(64),tags:['演示'],...(n===1?{group_id:'g-demo',group_title:'品牌主图',version:3}:{})},file,new AbortController().signal);
}
const output=await build({stdin:{resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {finalizeEvent} from 'nostr-tools/pure';
import * as chat from './plugins/opcb.chat-artifacts/2.0.0/plugin.js';
import * as reader from './src/knowledge/reader.mjs';import * as admin from './src/knowledge/admin.mjs';
const owner=${JSON.stringify(owner)},community=${JSON.stringify(community)},key=new Uint8Array(${JSON.stringify([...key])});
const channel={id:'private-demo',name:'本地演示私人对话',visibility:'private',members:[owner]};let items=[];
const profiles=new Map([[owner,{name:'演示操作者',isAgent:true}],...['资料负责人','项目负责人','内容协作者','研究协作者'].map((name,i)=>[String(i+1).repeat(64),{name}])]);
const session={viewer:owner,relayAuthor:community,channels:{get:()=>channel,list:()=>({channels:[channel]})},profiles:{snapshot:()=>profiles,subscribe:()=>()=>{}},read:async()=>[...profiles].map(([pubkey,p])=>({pubkey,kind:0,tags:[],content:JSON.stringify(p)})),outbox:{supports:k=>k===45010,ready:async()=>{},snapshot:()=>items,subscribe:()=>()=>{},send:input=>{const signed=finalizeEvent({...input,created_at:Math.floor(Date.now()/1000)},key);items=[{event:signed,signed,delivery:'accepted'}];return signed.id;}}};
const messageId=n=>n.toString(16).padStart(64,'0');
const messages=[1,2,3].map(n=>({id:messageId(n),channelId:channel.id,authorId:owner,createdAt:1794636000-n,agentEnvelope:true,content:'本地明确测试数据',attachments:[{kind:'image',name:'演示图片-'+n+'.png',mime:'image/png',url:'https://example.com/media/'+messageId(n)+'.png'}]}));
session.channels.subscribeList=()=>()=>{};session.subscribeLive=()=>()=>{};session.profiles.subscribe=()=>()=>{};
session.readRemote=async([f])=>messages.filter(m=>!f.before_id||m.createdAt<f.until||m.createdAt===f.until&&m.id>f.before_id).slice(0,f.limit).map(m=>({id:m.id,created_at:m.createdAt,kind:9,tags:[['h',channel.id]]}));
session.thread=(_c,id)=>{let value={targetStatus:'loading'};return{snapshot:()=>value,subscribe:()=>()=>{},refresh:async()=>{value={targetStatus:'ready',target:messages.find(m=>m.id===id)}},dispose(){}}};
session.media=()=>'/api/relay/demo/media';
const connection={status:'ready',scope:'https://relay.example:'+owner,generation:1,session};
const prefListeners=new Set(),tools=new Map();
const artifactStorage={open:()=>({scope:{viewer:owner,relay:'https://relay.example'},subscribe:f=>{prefListeners.add(f);return()=>prefListeners.delete(f)},close(){},preferences:{get:async id=>JSON.parse(localStorage.getItem('unified-demo:'+owner+':'+id)||'null')||undefined,update:async(id,fn)=>{const value=fn(JSON.parse(localStorage.getItem('unified-demo:'+owner+':'+id)||'null')||undefined);localStorage.setItem('unified-demo:'+owner+':'+id,JSON.stringify(value));for(const f of prefListeners)f()}}})};
const ctx={react:React,relay:{snapshot:()=>connection,subscribe:()=>()=>{}},host:{request:async r=>{const response=await fetch('/gateway/'+new URL(r.url).pathname.split('/').at(-1),{method:r.method,headers:r.headers,body:r.body});return {status:response.status,body:await response.text()};}},artifactStorage,agents:{relay:()=>ctx.relay,addTool:t=>tools.set(t.name,t),addInstructions:()=>{}},effect:fn=>fn(),navigation:{open:async()=>{location.href='/reader';return{status:'opened'}}},conversation:{ui:{Conversation:({children})=>children({}),Message:({row})=>React.createElement('p',null,row.content)}},panels:{register:panel=>createRoot(document.getElementById('app')).render(React.createElement(panel.component,{target:'opcb:chat-artifacts:'+channel.id,channelContext:{scope:connection.scope,viewer:owner,channelId:channel.id,channelName:'演示聊天'},context:{canOpen:()=>true,open:()=>{}}}))},pages:{register:page=>createRoot(document.getElementById('app')).render(React.createElement(page.component))}};
(location.pathname==='/artifacts'?chat:location.pathname==='/admin'?admin:reader).apply(ctx);
`},define:await knowledgeDesign({includeAdmin:true}),bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const server=createServer(async(req,res)=>{
  if(req.url==='/api/relay/demo/media'){res.writeHead(200,{'Content-Type':'image/png'});res.end(iconBytes);return;}
  if(req.url==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(output.outputFiles[0].text);return;}
  if(req.url.startsWith('/gateway/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const response=await fetch(backend+'/'+req.url.slice(9),{method:'POST',headers:{'Content-Type':'application/json'},body:Buffer.concat(chunks)});
    res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());return;
  }
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OPCB综合知识库本地验收</title><style>:root{color-scheme:light dark;--surface-panel:light-dark(#fff,#202225);--surface-inset:light-dark(#f2f3f5,#292c31);--surface-secondary:light-dark(#f2f3f5,#292c31);--text-secondary:light-dark(#656b74,#aeb4be);--border-primary:light-dark(#dde0e5,#41464e);--text-standard:light-dark(#24272c,#e5e7eb);--text-subtle:light-dark(#656b74,#aeb4be);--border-standard:light-dark(#dde0e5,#41464e)}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,'PingFang SC',sans-serif;background:var(--surface-panel);color:var(--text-standard)}button:disabled{opacity:.45;cursor:default!important}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #3578d4;outline-offset:2px}a{color:light-dark(#2b5fa0,#9dc4ff)}nav.demo{padding:12px 24px;border-bottom:1px solid var(--border-standard);display:flex;gap:20px;align-items:center;flex-wrap:wrap}#app{height:calc(100vh - 54px)}</style><nav class="demo"><strong>本地演示数据 · 非真实 Buzz 登录</strong><a href="/artifacts">聊天产物</a><a href="/reader">综合知识库</a><a href="/admin">知识库管理</a></nav><div id="app"></div><script type="module" src="/preview.js"></script></html>`);
});
server.listen(18779,'127.0.0.1',()=>console.log('Local synthetic preview http://127.0.0.1:18779/reader'));
const stop=()=>{server.close();child.stdin.end('\n');};process.on('SIGINT',stop);process.on('SIGTERM',stop);
