// Developer harness for the actual plugin bundles. Business reads go to the
// current service; no sample rows, copied cookies or saved tokens are used.
// This is a browser harness, not evidence that Buzz has installed the bundle.
import {build} from 'esbuild';
import {createServer} from 'node:http';
const bundle = await build({stdin:{resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {apply as factory} from './plugins/opcb.content-factory/2.0.0-rc.3/plugin.js';
import {apply as assets} from './plugins/opcb.shangliangshan-assets/2.0.0-rc.3/plugin.js';
const h=React.createElement;
const roster={status:'ready',channels:[]},choices={selectable:[],pending:false};
const session={viewer:'development-preview',channels:{subscribeList:()=>()=>{},list:()=>roster,ensureList(){}},agentChoices:{subscribe:()=>()=>{},snapshot:()=>choices,ensure(){}}};
const connection={status:'ready',cached:false,scope:'local-preview',generation:1,session};
let Page;const cleanups=[];
const ctx={react:React,pages:{register:p=>Page=p.component},relay:{snapshot:()=>connection,subscribe:()=>()=>{}},effect:fn=>cleanups.push(fn()),conversation:{ui:{}},agents:{addTool(){}},host:{request:async request=>{const r=await fetch('/host-read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});if(!r.ok)throw Error('本机读取代理拒绝请求');return r.json();}},browser:{available:true,View:({url,label})=>h('iframe',{src:url,title:label,referrerPolicy:'no-referrer',style:{border:0,width:'100%',height:'100%',flex:1,minHeight:0}})}};
(location.pathname==='/assets'?assets:factory)(ctx);
createRoot(document.getElementById('app')).render(h(Page));
window.addEventListener('pagehide',()=>cleanups.forEach(fn=>fn?.()));
`},bundle:true,format:'esm',write:false,platform:'browser'});
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>实际插件代码 · 本机开发运行</title><style>
:root{--space-panel-inset:16px;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--size-panel-header:48px;--radius-container:16px;--surface-panel:#fefcfb;--surface-inset:#f5f4f3;--text-standard:#181818;--text-subtle:#706f6d;--border-standard:#efeeec}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:system-ui,sans-serif}body{display:flex;flex-direction:column;background:#0d0c0f;color:#eee}body>nav{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:8px 18px;font-size:14px;flex:none}body>nav a{color:inherit}body>nav span{margin-left:auto}#app{flex:1;min-height:0;min-width:0}button,input,select{font:inherit;color:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.text-secondary{color:var(--text-subtle)}p{line-height:1.6}button svg{display:block}
</style><nav><a href="/factory">内容工厂</a><a href="/assets">资产库</a><span>本机开发运行 · 实际插件代码与实时服务 · 尚未安装 Buzz</span></nav><main id="app"></main><script type="module" src="/app.js"></script></html>`;
let origin;
createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(bundle.outputFiles[0].text);return;}
  if(req.url==='/host-read'){
    if(req.method!=='POST'||req.headers.origin!==origin){res.writeHead(403);res.end();return;}
    try{
      let input='';for await(const chunk of req){input+=chunk;if(input.length>16384)throw Error('Too large');}
      const value=JSON.parse(input),method=value.method||'GET';
      const allowed=(method==='GET'&&value.url==='https://staging.paolab.cn/ins/api/state')||(method==='POST'&&value.url==='https://staging.paolab.cn/ins/api/opcb/login');
      if(!allowed)throw Error('Read-only preview');
      const headers={Origin:'tauri://localhost','Content-Type':'application/json'};
      if(typeof value.headers?.Authorization==='string')headers.Authorization=value.headers.Authorization;
      const upstream=await fetch(value.url,{method,headers,...(method==='POST'?{body:value.body}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:upstream.status,body:await upstream.text()}));
    }catch{res.writeHead(502);res.end();}return;
  }
  if(!['/','/factory','/assets'].includes(req.url)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
}).listen(0,'127.0.0.1',function(){origin='http://127.0.0.1:'+this.address().port;console.log('Actual plugin development harness: '+origin);});
