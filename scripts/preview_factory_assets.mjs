// Synthetic local preview only. Never reads production accounts or business data.
import {build} from 'esbuild';
import {createServer} from 'node:http';
const bundle = await build({stdin:{resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {apply as factory} from './src/content-factory/plugin.mjs';
import {apply as assets} from './src/shangliangshan-assets/plugin.mjs';
const h=React.createElement,root=createRoot(document.getElementById('app'));
const state={current_member:{id:'me',name:'预览本人'},members:[{id:'me',name:'预览本人'},{id:'editor',name:'预览制作人'}],cards:[
 {id:'a',title:'示例：产品开场镜头',note:'合成素材，用于检查列表与布局',status:'pending',version:2,media_status:'ready',platform:'本地视频',created_by:'editor'},
 {id:'b',title:'示例：门店场景参考',note:'合成素材，不是真实业务',status:'approved',version:4,media_status:'ready',created_by:'editor'},
 {id:'c',title:'示例：产品成片',note:'检查版本选择',status:'done',version:6,media_status:'ready',result_revision:2,created_by:'editor'}],
 reviews:Array.from({length:4},(_,i)=>({card_id:'b',member_id:'reviewer'+i,verdict:'yes'})),comments:[],source_images:[],result_versions:[{card_id:'c',revision:1,member_id:'editor'},{card_id:'c',revision:2,member_id:'editor'}]};
const emptyRoster={status:'ready',channels:[]},emptyChoices={selectable:[],pending:false};
const session={viewer:'fixture-owner',channels:{subscribeList:()=>()=>{},list:()=>emptyRoster,ensureList(){}},agentChoices:{subscribe:()=>()=>{},snapshot:()=>emptyChoices,ensure(){}}};
const connection={status:'ready',cached:false,scope:'fixture',generation:1,session};
let Page;const ctx={react:React,pages:{register:p=>Page=p.component},relay:{snapshot:()=>connection,subscribe:()=>()=>{}},effect:fn=>fn(),conversation:{ui:{}},agents:{addTool(){}},host:{request:async({url})=>({status:200,body:JSON.stringify(url.endsWith('/login')?{token:'synthetic-only'}:state)})},browser:{available:!location.search.includes('unsupported'),View:({url})=>h('section',{className:'web-fixture'},h('strong',null,'实时网页位置 · 预览替身'),h('p',null,url),h('p',null,'这里仅模拟宿主网页区域；本预览不访问原站、不执行上传或下载'))}};
(location.pathname==='/assets'?assets:factory)(ctx);root.render(h(Page));
document.getElementById('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
`},bundle:true,format:'esm',write:false,platform:'browser'});
const html=`<!doctype html><html lang="zh-CN" data-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插件候选 · 合成预览</title><style>
:root{color-scheme:light;--surface-panel:#fff;--surface-inset:#f5f6f8;--text-standard:#181b20;--text-subtle:#69717c;--border-standard:#dfe3e9;--affordance-subtle-pressed:#e9edf4;--space-panel-inset:16px;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--radius-container:12px;--size-panel-header:48px}
:root[data-theme=dark]{color-scheme:dark;--surface-panel:#202124;--surface-inset:#17181b;--text-standard:#f1f2f4;--text-subtle:#b0b5be;--border-standard:#36393f;--affordance-subtle-pressed:#363b46}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:system-ui,'PingFang SC',sans-serif;color:var(--text-standard);background:var(--surface-panel)}body{display:flex;flex-direction:column}nav{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:8px 16px;background:var(--surface-inset);border-bottom:1px solid var(--border-standard);font-size:14px}nav a{color:inherit}nav span{flex:1}#app{flex:1;min-height:0;min-width:0}button,input,select{font:inherit;color:inherit;border:1px solid var(--border-standard);background:var(--surface-panel);border-radius:8px;padding:8px 12px;max-width:100%}button{cursor:pointer}button:hover,button[aria-pressed=true]{background:var(--affordance-subtle-pressed)}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #4778c4;outline-offset:2px}button:disabled{opacity:.5;cursor:default}input,select{min-width:0}.text-secondary{color:var(--text-subtle);font-size:14px}.text-label{font-size:16px;font-weight:600}.ui-card{border:1px solid var(--border-standard)}.web-fixture{flex:1;padding:32px;background:var(--surface-inset);min-height:240px}.web-fixture p{overflow-wrap:anywhere}h2{font-size:22px}p{line-height:1.6}@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style><nav><a href="/factory">内容工厂</a><a href="/assets">资产库</a><span>合成数据与网页替身 · 非真实业务验收</span><button id="theme">切换明暗</button></nav><main id="app"></main><script type="module" src="/preview.js"></script></html>`;
createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/preview.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(bundle.outputFiles[0].text);}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}}).listen(0,'127.0.0.1',function(){console.log('Synthetic preview: http://127.0.0.1:'+this.address().port);});
