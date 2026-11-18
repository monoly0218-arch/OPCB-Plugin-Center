// Local synthetic review only: no production reads, writes, or public sharing.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
const {css,assets}=await bundleStyles();
const styles=css+'\n'+await readFile(new URL('../src/content-factory/workspace-ui.css',import.meta.url),'utf8')+'\n'+await readFile(new URL('../src/shangliangshan-assets/actions.css',import.meta.url),'utf8');
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {createAssetLibraryUI} from './src/shangliangshan-assets/library-ui.mjs';
const h=React.createElement,Library=createAssetLibraryUI(React);
const data={revision:1,user:{id:'fixture',name:'本地预览',role:'admin'},files:[],folders:[],assets:[
{id:'a',title:'产品摄影',category:'visual',createdBy:'预览成员',createdAt:'2026-11-18',tags:['视觉资产'],versions:[{number:1,fileIds:[]}]},
{id:'b',title:'品牌手册',category:'brand',createdBy:'预览成员',createdAt:'2026-11-18',tags:['品牌资料'],versions:[{number:1,fileIds:[]}]},
{id:'c',title:'门店影像',category:'videos',createdBy:'预览成员',createdAt:'2026-11-18',tags:['门店'],versions:[{number:1,fileIds:[]}]}]};
window.__review={calls:[],failCopy:false,failShare:false,failFolder:false,clipboard:''};
Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{if(window.__review.failCopy)throw Error('denied');window.__review.clipboard=value;}},configurable:true});
function App(){const [state,setState]=React.useState(data);return h(Library,{data:state,identityBound:true,onRefresh:()=>{},
onCreateFolder:async name=>{window.__review.calls.push({action:'folder',name});if(window.__review.failFolder)throw Error('创建失败');const folder={id:'f'+(state.folders.length+1),name};setState({...state,folders:[...state.folders,folder]});return folder;},
onShare:async(ids,validity)=>{window.__review.calls.push({action:'share',ids,validity});if(window.__review.failShare)throw Error('分享失败');return {url:location.origin+'/review-share/'+validity+'/'+ids.join(',')};}});}
createRoot(document.getElementById('app')).render(h(App));
`},bundle:true,format:'esm',write:false,define:{OPCB_FACTORY_ASSETS_UI_CSS:JSON.stringify(styles),OPCB_FACTORY_ASSETS_UI_ASSETS:JSON.stringify(assets)}});
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>资产库操作 · 合成预览</title><style>html,body,#app{height:100%;margin:0;width:100%}*{box-sizing:border-box}:root{--surface-panel:#222123;--surface-inset:#2c2b2e;--text-standard:#f5f3f1;--text-subtle:#b1adaa;--border-standard:#363438}button,input,select,textarea{font:inherit}button{color:inherit;background:none;border:0;cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #839bcb;outline-offset:3px}</style><div id="app"></div><script type="module" src="/preview.js"></script></html>';
createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url.startsWith('/review-share/')){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><title>本地分享预览</title><h1>本地合成分享页</h1>');}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}}).listen(0,'127.0.0.1',function(){console.log('Synthetic preview: http://127.0.0.1:'+this.address().port);});
