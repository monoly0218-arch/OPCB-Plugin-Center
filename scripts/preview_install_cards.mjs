// Real React/production card, synthetic installer. Never changes Buzz or installs plugins.
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pluginCenterDesign} from './build_plugin_center.mjs';
const registry=JSON.parse(await readFile('REGISTRY.json','utf8'));
const code=`
import React from 'react';import {createRoot} from 'react-dom/client';
import {createInstallCard,formatInstallCard} from './src/plugin-center/install-card.mjs';
import {createDirectoryStore} from './src/plugin-center/directory.mjs';
const registry=${JSON.stringify(registry)},head='a'.repeat(40),installed=new Set(),listeners=new Map();
let outcome='cancelled',reviews=[],offline=false,hold=false,finish;
const installer={getInstallationStatus:id=>installed.has(id)?'installed':'absent',subscribeInstallationStatus:(id,fn)=>{const set=listeners.get(id)||new Set();set.add(fn);listeners.set(id,set);return()=>set.delete(fn);},requestInstall:async source=>{reviews.push(source);if(hold)await new Promise(resolve=>{finish=resolve;});if(outcome==='throw')throw Error('host unavailable');if(outcome==='installed'){installed.add('opcb.html-reader');listeners.get('opcb.html-reader')?.forEach(f=>f('installed'));}return outcome;}};
const request=async ({url})=>{if(offline)throw Error('目录离线');const result=url.includes('/commits?')||url.includes('/pulls?')?[]:url.endsWith('/commits/main')?{sha:head}:{encoding:'base64',content:btoa(unescape(encodeURIComponent(JSON.stringify(registry))))};return {status:200,body:JSON.stringify(result)};};
const store=createDirectoryStore(request,installer);await store.refresh();
const entry=store.snapshot().entries.find(e=>e.id==='opcb.html-reader'&&!e.legacy),content=formatInstallCard(entry,head);
const Card=createInstallCard(React,store,installer,OPCB_PLUGIN_CENTER_ASSETS,OPCB_PLUGIN_CENTER_CSS);
const root=createRoot(document.getElementById('app'));root.render(React.createElement(Card,{message:{content}}));
window.qa={reviews,store,outcome:value=>{outcome=value;},hold:value=>{hold=value;},release:()=>finish?.(),offline:value=>{offline=value;},changePin:()=>{registry.entries.find(e=>e.id===entry.id&&!e.legacy).reviewSource.commit='c'.repeat(40);return store.refresh();},theme:value=>{document.documentElement.dataset.colorMode=value;},subscriptions:()=>[...listeners.values()].reduce((n,set)=>n+set.size,0),unmount:()=>{root.unmount();store.dispose();},content};
`;
const bundle=await build({stdin:{contents:code,resolveDir:process.cwd()},define:await pluginCenterDesign(),bundle:true,write:false,format:'esm',platform:'browser',minify:true});
const css=`:root{--surface-panel:#fefcfb;--surface-inset:#f5f4f3;--text-standard:#181818;--text-subtle:#706f6d;--border-standard:#efeeec}:root[data-color-mode=dark]{--surface-panel:#222123;--surface-inset:#2c2b2e;--text-standard:#f5f3f1;--text-subtle:#b1adaa;--border-standard:#363438}*{box-sizing:border-box}body{margin:0;background:#0d0c0f;padding:40px 24px}#app{max-width:660px;margin:0 auto}button{font-family:inherit}`;
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原生安装卡 · 合成宿主验证</title><style>'+css+'</style><div id="app"></div><script type="module">'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></html>';
if(process.argv[2]){await writeFile(process.argv[2],html);console.log(process.argv[2]);}
else createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}).listen(18774,'127.0.0.1',()=>console.log('http://127.0.0.1:18774'));
