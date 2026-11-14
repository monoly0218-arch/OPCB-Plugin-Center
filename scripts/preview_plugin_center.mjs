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
const registry=${JSON.stringify(registry)},head='a'.repeat(40),installed=new Set(['opcb.knowledge','opcb.task-center','opcb.plugin-center']),listeners=new Map();let fail=false,reviews=[];
const installer={getInstallationStatus:id=>installed.has(id)?'installed':'absent',subscribeInstallationStatus:(id,f)=>{const set=listeners.get(id)||new Set();set.add(f);listeners.set(id,set);return()=>set.delete(f);},requestInstall:async source=>{reviews.push(source);return 'cancelled';}};
const request=async ({url})=>{if(fail)throw Error('离线测试');return {status:200,body:JSON.stringify(url.endsWith('/commits/main')?{sha:head}:{encoding:'base64',content:btoa(unescape(encodeURIComponent(JSON.stringify(registry))))})};};
const store=createDirectoryStore(request,installer),Page=createPage(React,store,installer,OPCB_PLUGIN_CENTER_ASSETS,OPCB_PLUGIN_CENTER_CSS);
const root=createRoot(document.getElementById('app'));root.render(React.createElement(Page));
window.qa={store,reviews,offline:value=>{fail=value;},toggle:id=>{installed.has(id)?installed.delete(id):installed.add(id);listeners.get(id)?.forEach(f=>f(installed.has(id)?'installed':'absent'));},theme:value=>{document.documentElement.dataset.colorMode=value;},unmount:()=>root.unmount(),subscriptions:()=>[...listeners.values()].reduce((n,x)=>n+x.size,0)};
if(new URLSearchParams(location.search).get('theme')==='dark')document.documentElement.dataset.colorMode='dark';
`;
const bundle=await build({stdin:{contents:code,resolveDir:process.cwd()},define:await pluginCenterDesign(),bundle:true,write:false,format:'esm',platform:'browser',minify:true});
const css=`:root{--surface-panel:#fefcfb;--surface-inset:#f5f4f3;--text-standard:#181818;--text-subtle:#706f6d;--border-standard:#efeeec}:root[data-color-mode=dark]{--surface-panel:#222123;--surface-inset:#2c2b2e;--text-standard:#f5f3f1;--text-subtle:#b1adaa;--border-standard:#363438}html,body{margin:0;height:100%;background:#0d0c0f}body{display:flex;flex-direction:column}#fixture{font:16px/1.5 system-ui;color:#ddd;padding:8px 16px;background:#0d0c0f}#app{min-height:0;flex:1}`;
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>插件中心 0.2.2 · 交互预览</title><style>'+css+'</style><div id="fixture">交互预览 · 安装状态为合成样本</div><div id="app"></div><script type="module">'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></html>';
if(process.argv[2]){await writeFile(process.argv[2],html);console.log(process.argv[2]);}
else createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}).listen(18773,'127.0.0.1',()=>console.log('http://127.0.0.1:18773'));
