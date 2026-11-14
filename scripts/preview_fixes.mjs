// Local synthetic workflow fixture. No production data, credentials or native install.
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {startPreview} from '../plugins/opcb.html-reader/0.1.0-rc.2/plugin.js';
const source=await readFile('plugins/opcb.html-reader/0.1.0-rc.2/source/viewer.py','utf8');
const hostCSS=process.argv[2]?await readFile(process.argv[2],'utf8'):':root{--surface-panel:#fefcfb;--surface-inset:#f5f4f3;--text-standard:#181818;--text-subtle:#706f6d;--border-standard:#efeeec}:root[data-color-mode=dark]{--surface-panel:#222123;--surface-inset:#2c2b2e;--text-standard:#f5f3f1;--text-subtle:#b1adaa;--border-standard:#363438}';
const sample='<!doctype html><html lang="zh"><meta charset="utf-8"><style>body{background:#fff;color:#222;font:22px system-ui}button{padding:20px}</style><h1>交互样本</h1><button onclick="this.textContent=\'已点击\'">点击验证交互</button></html>';
const output=await build({stdin:{resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {apply as task} from './plugins/opcb.task-center/2.0.0-rc.7/plugin.js';
import {apply as company} from './plugins/opcb.company-board/2.0.0-rc.7/plugin.js';
import {apply as html} from './plugins/opcb.html-reader/0.1.0-rc.2/plugin.js';
const h=React.createElement,viewer='a'.repeat(64),listeners=new Set();let allowed=true,conflict=false,saves=0,seq=0;
let event={id:'b'.repeat(64),created_at:1794660000,content:'# 合成回归计划\\n## 人员分工\\n|人员|主要负责|边界|\\n|---|---|---|\\n|负责人甲|核对界面|不代替执行|\\n|负责人甲 Studio|整理回执|独立Agent|\\n|Moo（小莫）|制作素材|待验收|\\n|Steven|核对网站|待验收|\\n## 每日执行与验收\\n### 阶段一\\n- **P01 10:00｜收齐交付回执**（Moo＋负责人甲；Steven接入）\\n  交付：回执链接\\n  验收：本人确认\\n'};
const roster={status:'ready',channels:[{id:'7dc199bc-755b-47bb-8f71-fe311b1f1ab1',members:[viewer],creator:viewer}]};
const session={viewer,channels:{list:()=>allowed?roster:{status:'ready',channels:[]},subscribeList:f=>{listeners.add(f);return()=>listeners.delete(f);},ensureList(){}},canvas:{available:true,read:async()=>conflict?{...event,id:'d'.repeat(64)}:event,save:async(channel,content,expected)=>{if(expected!==event.id)throw Error('CAS conflict');saves++;event={id:String(++seq).padStart(64,'0'),created_at:1794660000+seq,content};return event;}}};
const connection={status:'ready',session,generation:1,scope:'fixture'};
let Page,Panel;const root=createRoot(document.getElementById('app'));const children=new Set();
const ctx={react:React,relay:{snapshot:()=>connection,subscribe:()=>()=>{}},agents:{addTool(){},addInstructions(){}},conversation:{ui:{},registerAttachment(){}},navigation:{open:async()=>({status:'opened'})},effect:fn=>fn(),panels:{register:page=>{Panel=page.component;}},pages:{register:page=>{Page=page.component;}},browser:{available:true,View:props=>h('iframe',{src:props.url,title:props.label,style:{border:0,width:'100%',height:'100%',minHeight:200}})},host:{spawn:async(id,{onStdout})=>{
 let input='',remote,stopped=false,resolve;const exited=new Promise(r=>resolve=r);
 const kill=async()=>{stopped=true;if(remote)await fetch('/stop/'+remote,{method:'POST'});resolve(0);};
 return {exited,kill,write:async chunk=>{input+=chunk;if(input.split('\\n').length<3)return;const doc=JSON.parse(input.split('\\n')[1]);const preview=await (await fetch('/start',{method:'POST',body:JSON.stringify(doc)})).json();remote=preview.id;if(stopped){await kill();return;}onStdout(JSON.stringify({url:preview.url})+'\\n');}};
}}};
window.qa={conflict:value=>{conflict=value;},revoke:()=>{allowed=false;listeners.forEach(f=>f());},event:()=>event,saves:()=>saves};
const path=location.pathname;
if(path==='/html'){html(ctx);root.render(h(Panel,{target:'opcb-html:open'}));}else{(path==='/company'?company:task)(ctx);root.render(h(Page));}
`},bundle:true,write:false,format:'esm',platform:'browser'});
const processes=new Map();let id=0;
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');try{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(output.outputFiles[0].text);return;}
 if(req.url==='/stats'){res.end(JSON.stringify({active:processes.size}));return;}
 if(req.url.startsWith('/stop/')){const controller=processes.get(req.url.slice(6));controller?.abort();processes.delete(req.url.slice(6));res.end('{}');return;}
 if(req.url==='/start'){
  const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>55*1024*1024)throw Error('limit');chunks.push(chunk);}
  const {html}=JSON.parse(Buffer.concat(chunks));const controller=new AbortController(),key=String(++id);processes.set(key,controller);
  const host={spawn:async(_,callbacks)=>{const child=spawn('python3',['-I','-u','-c','import json,sys;exec(json.loads(sys.stdin.readline()))']);child.stdout.on('data',data=>callbacks.onStdout(data.toString()));return {write:async text=>{child.stdin.write(text);},kill:async()=>{child.kill();},exited:new Promise(resolve=>child.once('exit',code=>{processes.delete(key);resolve(code);} ))};}};
  try{const preview=await startPreview(host,html,source,controller.signal);res.end(JSON.stringify({id:key,url:preview.url}));}catch(error){processes.delete(key);throw error;}return;
 }
 if(req.url==='/sample.html'){res.setHeader('Content-Type','text/html');res.end(sample);return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="zh" data-color-mode="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>集中修复 · 合成回归</title><style>'+hostCSS+'\nbody{margin:0;height:100dvh;display:flex;flex-direction:column;background:var(--surface-panel);color:var(--text-standard)}#app{flex:1;min-height:0}header.fixture{font:12px/1.7 system-ui;padding:6px 16px}a{color:var(--text-standard)}</style><header class="fixture">合成回归环境 · 无正式数据 · 浏览器视图用iframe替代原生视图</header><div id="app"></div><script type="module" src="/app.js"></script></html>');
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
});
server.listen(18769,'127.0.0.1',()=>console.log('http://127.0.0.1:18769/'));
const stop=()=>{processes.forEach(controller=>controller.abort());server.close();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
