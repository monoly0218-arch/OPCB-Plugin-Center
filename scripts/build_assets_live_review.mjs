// Build the actual asset reader for an authorized, first-party browser session.
// Native transport is deliberately outside this visual review entry point.
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
const {css,assets}=await bundleStyles();
const adaptation=await readFile(new URL('../src/content-factory/workspace-ui.css',import.meta.url),'utf8');
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {createAssetLibraryUI} from './src/shangliangshan-assets/library-ui.mjs';
const h=React.createElement,Library=createAssetLibraryUI(React);
for(const node of [...document.querySelectorAll('link[rel=stylesheet],style')])node.remove();
document.body.replaceChildren();
const style=document.createElement('style');style.textContent='html,body{height:100%;width:100%;margin:0}body{display:flex;flex-direction:column;background:#0d0c0f;color:#ddd;font-family:system-ui}*{box-sizing:border-box}#review-notice{padding:7px 20px;font:13px system-ui;flex:none}#asset-review-app{flex:1;min-height:0;width:100%}';document.head.append(style);
const notice=document.createElement('div');notice.id='review-notice';notice.textContent='本机开发运行 · 资产原生视图组件 / 实时源站读取 · 尚未接入 Buzz 原生会话';
const element=document.createElement('div');element.id='asset-review-app';document.body.append(notice,element);
let active=true;
function App(){const [data,setData]=React.useState(null),[loading,setLoading]=React.useState(true),[error,setError]=React.useState('');
 async function refresh(){setLoading(true);setError('');try{const r=await fetch('/assets/api/assets',{cache:'no-store'});if(!r.ok)throw Error(r.status===401?'资产登录已过期，请回原站重新进入':'资产读取失败');const value=await r.json();if(!Array.isArray(value.assets)||!Array.isArray(value.files)||!value.user)throw Error('资产数据不完整');if(active)setData(value);}catch(e){if(active){setData(null);setError(e.message);}}finally{if(active)setLoading(false);}}
 React.useEffect(()=>{refresh();return()=>{active=false;};},[]);
 const readCopy=React.useCallback(async(id,platform)=>{const r=await fetch('/assets/api/assets/platform-copy?id='+encodeURIComponent(id)+'&platform='+encodeURIComponent(platform),{cache:'no-store'});if(!r.ok)throw Error('平台文案读取失败（'+r.status+'）');return r.json();},[]);
 return h(Library,{data,loading,error,onRefresh:refresh,onReadCopy:readCopy,onOpenWebsite:options=>{location.hash=['tags','permissions'].includes(options?.page)?options.page:'';location.reload();}});}
const root=createRoot(element);root.render(h(App));window.addEventListener('pagehide',()=>{active=false;root.unmount();},{once:true});
`},bundle:true,format:'iife',write:false,platform:'browser',target:'es2022',define:{OPCB_FACTORY_ASSETS_UI_CSS:JSON.stringify(css+'\n'+adaptation),OPCB_FACTORY_ASSETS_UI_ASSETS:JSON.stringify(assets)}});
const path=process.argv[2];if(!path)throw Error('Provide an absolute local output path');
await writeFile(path,bundle.outputFiles[0].text);console.log('Built real asset-reader review entry. No business data included.');
