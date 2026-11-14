// Local fixture: real registry, synthetic host status. Never installs plugins.
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pluginCenterDesign} from './build_plugin_center.mjs';
const registry=JSON.parse(await readFile('REGISTRY.json','utf8'));
const code=`
import React from 'react';import {createRoot} from 'react-dom/client';
import {createPage} from './src/plugin-center/page.mjs';
import {createDirectoryStore} from './src/plugin-center/directory.mjs';
import {CONTRIBUTIONS} from './src/plugin-center/contributors.mjs';
const registry=${JSON.stringify(registry)},head='a'.repeat(40),installed=new Set(['opcb.knowledge','opcb.task-center','opcb.plugin-center']),listeners=new Map();let fail=false,reviews=[];
const installer={getInstallationStatus:id=>installed.has(id)?'installed':'absent',subscribeInstallationStatus:(id,f)=>{const set=listeners.get(id)||new Set();set.add(f);listeners.set(id,set);return()=>set.delete(f);},requestInstall:async source=>{reviews.push(source);return 'cancelled';}};
const request=async ({url})=>{if(fail)throw Error('离线测试');const result=url.includes('/commits?')?[]:url.includes('/pulls?')?CONTRIBUTIONS.pulls.map(p=>({number:p.number,head:{sha:p.head},user:{login:p.login,avatar_url:p.avatar},state:p.state})):url.endsWith('/commits/main')?{sha:head}:{encoding:'base64',content:btoa(unescape(encodeURIComponent(JSON.stringify(registry))))};return {status:200,body:JSON.stringify(result)};};
const store=createDirectoryStore(request,installer),extraListeners=new Set();let extra=null,lastBase,lastExtra,combined;
const viewStore={...store,subscribe:f=>{extraListeners.add(f);const off=store.subscribe(f);return()=>{off();extraListeners.delete(f);};},snapshot:()=>{const base=store.snapshot();if(!extra)return base;if(base!==lastBase||extra!==lastExtra){combined={...base,contributions:extra};lastBase=base;lastExtra=extra;}return combined;}};
const profileListeners=new Set(),relayListeners=new Set(),profileMap=new Map(Object.values(CONTRIBUTIONS.people).filter(p=>p.pubkey).map(p=>[p.pubkey,{name:p.name,picture:p.avatar}]));
const connection={status:'ready',scope:'preview',generation:1,session:{profiles:{snapshot:()=>profileMap,subscribe:f=>{profileListeners.add(f);return()=>profileListeners.delete(f);},ensure:async()=>{},reserve:()=>()=>{}}}};
const relay={snapshot:()=>connection,subscribe:f=>{relayListeners.add(f);return()=>relayListeners.delete(f);}};
const Page=createPage(React,viewStore,installer,OPCB_PLUGIN_CENTER_ASSETS,OPCB_PLUGIN_CENTER_CSS,relay);
const root=createRoot(document.getElementById('app'));root.render(React.createElement(Page));
window.qa={store,reviews,offline:value=>{fail=value;},toggle:id=>{installed.has(id)?installed.delete(id):installed.add(id);listeners.get(id)?.forEach(f=>f(installed.has(id)?'installed':'absent'));},theme:value=>{document.documentElement.dataset.colorMode=value;},unmount:()=>{root.unmount();store.dispose();},subscriptions:()=>[...listeners.values()].reduce((n,x)=>n+x.size,0)+profileListeners.size+relayListeners.size,
profilePicture:(key,picture)=>{profileMap.set(key,{...profileMap.get(key),picture});profileListeners.forEach(f=>f());},
creditsFixture:count=>{if(!count){extra=null;document.querySelector('#fixture').textContent='交互预览 · 安装状态和头像回退为样本';}else{extra=structuredClone(CONTRIBUTIONS);const keys=[];for(let i=0;i<count;i++){const key='fixture-'+i;extra.people[key]={key,name:'测试贡献者 '+i};keys.push(key);}for(const row of Object.values(extra.plugins))row.contributors=keys;document.querySelector('#fixture').textContent='溢出测试 · '+count+'位合成贡献者';}extraListeners.forEach(f=>f());}};
if(new URLSearchParams(location.search).get('theme')==='dark')document.documentElement.dataset.colorMode='dark';
`;
const bundle=await build({stdin:{contents:code,resolveDir:process.cwd()},define:await pluginCenterDesign(),bundle:true,write:false,format:'esm',platform:'browser',minify:true});
const css=`:root{--surface-panel:#fefcfb;--surface-inset:#f5f4f3;--text-standard:#181818;--text-subtle:#706f6d;--border-standard:#efeeec}:root[data-color-mode=dark]{--surface-panel:#222123;--surface-inset:#2c2b2e;--text-standard:#f5f3f1;--text-subtle:#b1adaa;--border-standard:#363438}html,body{margin:0;height:100%;background:#0d0c0f}body{display:flex;flex-direction:column}#fixture{font:16px/1.5 system-ui;color:#ddd;padding:8px 16px;background:#0d0c0f}#app{min-height:0;flex:1}`;
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插件中心 0.2.3 · 交互预览</title><style>'+css+'</style><div id="fixture">交互预览 · 安装状态和头像回退为样本</div><div id="app"></div><script type="module">'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></html>';
if(process.argv[2]){await writeFile(process.argv[2],html);console.log(process.argv[2]);}
else createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}).listen(18773,'127.0.0.1',()=>console.log('http://127.0.0.1:18773'));
