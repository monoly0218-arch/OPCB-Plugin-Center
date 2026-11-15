// Local verification facade. Real Python preview; synthetic Buzz read models.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const root=new URL('../',import.meta.url).pathname;
const children=new Map();let next=1;
const documents={
 portrait:'<!doctype html><html><head><meta name="opcb-preview" content="width=390,height=844"><style>*{box-sizing:border-box}html,body{margin:0;width:390px;height:844px;background:#f0ece4;font:20px system-ui;color:#292321}main{height:100%;padding:32px;display:flex;flex-direction:column}h1{font-size:54px;line-height:1.05;font-weight:500;margin:40px 0 24px}.art{flex:1;background:#cce4b8;border-radius:180px 180px 28px 28px;display:grid;place-content:center;font-size:130px}.edge{display:flex;justify-content:space-between;font-size:16px;margin-top:24px}</style></head><body><main><header>OPCB · 设计验证样本</header><h1>把想法<br>带进生活</h1><div class="art">✳</div><footer class="edge"><span>竖版 · 390 × 844</span><span>完整底边 ✓</span></footer></main></body></html>',
 landscape:'<!doctype html><html><head><style>*{box-sizing:border-box}html,body{margin:0;width:1600px;height:900px;background:#e3edf2;font:28px system-ui;color:#23313a}main{height:100%;padding:70px;display:flex;flex-direction:column}.scene{display:flex;align-items:center;justify-content:space-between;flex:1}h1{font-size:136px;font-weight:500;line-height:1.05;margin:0}.ball{width:420px;height:420px;border-radius:50%;background:#fb866d;display:grid;place-content:center;font-size:200px}.edge{display:flex;justify-content:space-between}</style></head><body><main><header>OPCB · 设计验证样本</header><div class="scene"><h1>让画面<br>完整呈现</h1><div class="ball">✳</div></div><footer class="edge"><span>横版 · 1600 × 900</span><span>左右边缘与底边完整 ✓</span></footer></main></body></html>',
 long:'<!doctype html><html><head><meta name="opcb-preview" content="width=800,height=2400"><style>*{box-sizing:border-box}html,body{margin:0;width:800px;height:2400px;font:40px system-ui;background:#f5eee4;color:#362d27}section{height:800px;padding:70px;display:flex;flex-direction:column;justify-content:space-between}section:nth-child(2){background:#e3d3c3}section:nth-child(3){background:#c4cbb6}h1{font-size:100px;font-weight:500;margin:0}</style></head><body><section><span>OPCB · 长页面验证</span><h1>从开头</h1><span>01</span></section><section><span>02</span><h1>经过中间</h1><span>不截断</span></section><section><span>03</span><h1>一直到底</h1><span>完整底边 ✓ · 800 × 2400</span></section></body></html>',
};
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{apply}from'./plugins/opcb.html-reader/0.2.0-rc.1/plugin.js';import{emptyState,selectSource,sourceId}from'./src/html-reader/state.mjs';
const owner='a'.repeat(64),agent='b'.repeat(64),listeners=new Set(),rosterListeners=new Set();let state=emptyState(owner),channels=[{id:'fixture-session',name:'创作审阅',members:[owner,agent]}];let roster={status:'ready',channels};
const docs=${JSON.stringify(Object.keys(documents))},messages=new Map();for(let i=0;i<docs.length;i++){const source={message:String(i+1).repeat(64),channel:'fixture-session',root:null,version:String(i+1).repeat(64),url:'https://fixtures.test/'+docs[i]+'.html',name:({portrait:'竖版作品',landscape:'横版作品',long:'完整长页面'})[docs[i]]+'.html',mime:'text/html'};const id=await sourceId(source);state=selectSource(state,{channel:'fixture-session',root:null},source,id);if(i===0)state.entries[0].favorite=true;messages.set(source.message,{id:source.message,channelId:source.channel,authorId:agent,attachments:[{url:source.url,name:source.name,mime:source.mime}],content:'本地验证样本',delivery:'accepted'});}
const session={viewer:owner,channels:{list:()=>roster,ensureList(){},subscribeList:f=>{rosterListeners.add(f);return()=>rosterListeners.delete(f)}},thread:(c,id)=>({refresh:async()=>{},snapshot:()=>({targetStatus:'ready',target:messages.get(id)}),dispose(){}}),media:url=>location.origin+'/document/'+url.split('/').pop().replace('.html',''),subscribeLive:()=>()=>{}};
const connection={status:'ready',scope:'fixture:'+owner,origin:location.origin,generation:1,session};const effects=[],pages=[];let instructions;
const ctx={react:React,effect:fn=>effects.push(fn()),relay:{snapshot:()=>connection,subscribe:()=>()=>{}},navigation:{open:async()=>({status:'opened'})},artifactStorage:{open:()=>({scope:{viewer:owner},subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},preferences:{get:async()=>state,update:async(_,fn)=>{state=fn(state);listeners.forEach(f=>f())}},close(){}})},agents:{addInstructions:x=>{instructions=x},addTool(){}},pages:{register:p=>pages.push(p)},panels:{register(){}},conversation:{ui:{Tabs:({children})=>children(target=>{window.lastOpenedChat=target;return true})},registerAttachment(){},registerAccessory(){}},browser:{available:true,View:({url,label})=>React.createElement('iframe',{title:label,src:'/guest/'+new URL(url).port+new URL(url).pathname,style:{width:'100%',height:'100%',flex:1,border:0}})},host:{async spawn(id,options){const r=await fetch('/spawn',{method:'POST'}),value=await r.json();let done;const exited=new Promise(r=>done=r);const events=new EventSource('/stdout/'+value.id);events.onmessage=e=>{const message=JSON.parse(e.data);if(message.exit){done(0);events.close()}else options.onStdout(message.data)};return{write:async text=>{const r=await fetch('/stdin/'+value.id,{method:'POST',body:text});if(!r.ok)throw Error('Preview input failed')},kill:async()=>{await fetch('/kill/'+value.id,{method:'POST'});events.close();done(0)},exited}}}};
apply(ctx);window.fixture={getState:()=>state,getInstructions:()=>instructions,setAccess:allowed=>{channels=[{id:'fixture-session',name:'创作审阅',members:allowed?[owner,agent]:[agent]}];roster={status:'ready',channels};rosterListeners.forEach(f=>f())}};createRoot(document.querySelector('#app')).render(React.createElement(pages[0].component));window.addEventListener('beforeunload',()=>effects.forEach(f=>f?.()));`;
const result=await build({stdin:{contents:fixture,resolveDir:root,sourcefile:'fixture.mjs',loader:'js'},bundle:true,format:'esm',target:'es2022',write:false});
const bundle=result.outputFiles[0].contents;
const readBody=async req=>{let parts=[];for await(const data of req)parts.push(data);return Buffer.concat(parts).toString();};
const server=http.createServer(async(req,res)=>{
 try{
 const path=req.url.split('?')[0];
 if(path.startsWith('/guest/')){
  const match=req.url.match(/^\/guest\/(\d+)(\/.*)$/);if(!match)throw Error('Invalid verification guest');
  const port=match[1],guest=match[2],origin='http://127.0.0.1:'+port;
  const known=[...children.values()].some(x=>x.url&&new URL(x.url).port===port&&guest.startsWith(new URL(x.url).pathname));if(!known)throw Error('Unknown verification guest');
  const headers={};if(req.headers['content-type'])headers['Content-Type']=req.headers['content-type'];if(req.headers['x-reader-token'])headers['X-Reader-Token']=req.headers['x-reader-token'];if(req.headers.origin)headers.Origin=origin;
  const upstream=await fetch(origin+guest,{method:req.method,headers,...(req.method==='POST'?{body:await readBody(req)}:{})});
  res.writeHead(upstream.status,Object.fromEntries([...upstream.headers].filter(([key])=>!['connection','transfer-encoding','content-length'].includes(key))));
  req.on('close',()=>upstream.body?.cancel().catch(()=>{}));for await(const chunk of upstream.body)res.write(chunk);res.end();return;
 }

 if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><meta charset="utf-8"><title>HTML 阅读器 · 本地交互验证</title><style>html,body{height:100%;margin:0;background:#e7e5e8}body{display:flex;flex-direction:column;font:16px system-ui}aside{padding:8px 20px;color:#68636d}#app{flex:1;min-height:0;display:flex;flex-direction:column;padding:12px}</style><aside>本地交互验证 · 合成文档与会话 · 非原生安装验收</aside><div id="app"></div><script>window.fixtureErrors=[];addEventListener("error",e=>fixtureErrors.push(e.message));addEventListener("unhandledrejection",e=>fixtureErrors.push(String(e.reason)))</script><script type="module" src="/fixture.js"></script>');}
 if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle);}
 if(path.startsWith('/document/')){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(documents[path.slice(10)]||'');}
 if(path==='/spawn'&&req.method==='POST'){
  const id=String(next++),child=spawn('python3',['-I','-u','-c','import json,sys;exec(json.loads(sys.stdin.readline()))'],{stdio:['pipe','pipe','pipe']}),item={child,chunks:[],clients:new Set()};children.set(id,item);
  const publish=m=>{item.chunks.push(m);for(const c of item.clients)c.write('data: '+JSON.stringify(m)+'\n\n');};child.stdout.on('data',data=>{try{const parsed=JSON.parse(data.toString().trim());if(parsed.url)item.url=parsed.url}catch{}publish({data:data.toString()})});child.stderr.on('data',data=>process.stderr.write(data));child.on('exit',()=>publish({exit:true}));return res.end(JSON.stringify({id}));
 }
 const id=path.split('/')[2],item=children.get(id);if(!item){res.statusCode=404;return res.end();}
 if(path.startsWith('/stdout/')){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});for(const m of item.chunks)res.write('data: '+JSON.stringify(m)+'\n\n');item.clients.add(res);req.on('close',()=>item.clients.delete(res));return;}
 if(path.startsWith('/stdin/')&&req.method==='POST'){const body=await readBody(req);await new Promise((yes,no)=>item.child.stdin.write(body,e=>e?no(e):yes()));return res.end('{}');}
 if(path.startsWith('/kill/')&&req.method==='POST'){item.child.kill();return res.end('{}');}
 res.statusCode=404;res.end();
 }catch(e){res.statusCode=500;res.end(e.message);}
});
server.listen(0,'127.0.0.1',()=>console.log('HTML reader verification: http://127.0.0.1:'+server.address().port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const x of children.values())x.child.kill();server.close();process.exit(0);});
