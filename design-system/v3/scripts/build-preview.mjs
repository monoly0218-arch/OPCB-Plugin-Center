import {readFile,writeFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createIcons,ICON_NAMES} from '../../v1/icons.mjs';
import {createColoredIcons,ASSET_NAMES,createControlIcons,CONTROL_PATHS} from '../icons.mjs';
const base=new URL('../',import.meta.url);
const Icon=createIcons(React),Asset=createColoredIcons(React),Control=createControlIcons(React);
const markup=(factory,names)=>Object.fromEntries(names.map(name=>[name,renderToStaticMarkup(React.createElement(factory,{name,size:24}))]));
const [template,tokens,components,type,scenesCSS,review,script,scenes,pagesJSON,manifestJSON]=await Promise.all(['preview.template.html','tokens.css','components.css','typography.css','scenes.css','preview.css','preview.js','scenes.js','PAGES.json','fonts/MANIFEST.json'].map(p=>readFile(new URL(p,base),'utf8')));
const pages=JSON.parse(pagesJSON),manifest=JSON.parse(manifestJSON);
let fontCSS='';
for(const f of manifest){const data=await readFile(new URL('fonts/'+f.file,base));fontCSS+=`@font-face{font-family:'${f.family}';src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');font-weight:${f.weight};font-style:normal;font-display:swap;}\n`;}
const assetManifest=JSON.parse(await readFile(new URL('assets/MANIFEST.json',base),'utf8'));const bitmaps={};for(const a of assetManifest){const data=await readFile(new URL('assets/'+a.file,base));bitmaps[a.name]=`data:image/png;base64,${data.toString('base64')}`;}
const covers={};if(process.env.OPCB_REFERENCE_ROOT){const root=new URL('file://'+process.env.OPCB_REFERENCE_ROOT.replace(/\/$/,'')+'/');for(const [id,path]of Object.entries({coral:'WODAY_PAGES/OFFICIAL_5.webp',green:'WODAY_PAGES/WORKFLOW_22.png'})){const data=await readFile(new URL(path,root));covers[id]=`data:image/${path.endsWith('.png')?'png':'webp'};base64,${data.toString('base64')}`;}}
const refs={};
for(const p of pages.filter(p=>p.file)){
 if(process.env.OPCB_REFERENCE_ROOT){const root=new URL('file://'+process.env.OPCB_REFERENCE_ROOT.replace(/\/$/,'')+'/');const data=await readFile(new URL(p.file,root));refs[p.id]=`data:image/${p.file.endsWith('.jpg')?'jpeg':p.file.endsWith('.png')?'png':'webp'};base64,${data.toString('base64')}`;}
 else refs[p.id]=p.imageURL||''; // Archive-specific evidence belongs in the portable review package, not the plugin CSS.
}
const finalScript=script.replace('/*__SCENES__*/',scenes);
if(finalScript.includes('</script'))throw Error('Unsafe script terminator');
const escape=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const fluentLicense=await readFile(new URL('FLUENT_EMOJI_LICENSE.txt',base),'utf8');
const licenses=await Promise.all(['NUNITO_OFL.txt','QUICKSAND_OFL.txt','RESOURCE_HAN_ROUNDED_OFL.txt'].map(p=>readFile(new URL('fonts/'+p,base),'utf8')));
const html=template.replace('/*__STYLES__*/',[fontCSS,tokens,components,type,scenesCSS,review].join('\n')).replace('<!--__OPTIONS__-->',pages.map(p=>`<option value="${p.id}">${p.label}</option>`).join('')).replace('<!--__LICENSES__-->',[...licenses,fluentLicense].map((t,i)=>`<details><summary>${['Nunito · SIL OFL 1.1','Quicksand · SIL OFL 1.1','Resource Han Rounded · SIL OFL 1.1','Microsoft Fluent Emoji · MIT'][i]}</summary><pre>${escape(t)}</pre></details>`).join('')).replace('/*__SCRIPT__*/',`const REFS=${JSON.stringify(refs)},V2_ICONS=${JSON.stringify({...markup(Icon,ICON_NAMES),...markup(Control,Object.keys(CONTROL_PATHS))})},V3_ASSETS=${JSON.stringify(markup(Asset,ASSET_NAMES))},V3_BITMAPS=${JSON.stringify(bitmaps)},V3_COVERS=${JSON.stringify(covers)},V3_PAGES=${JSON.stringify(pages)};\n${finalScript}`);
await writeFile(new URL('PREVIEW.html',base),html);
console.log(`Built v3: ${pages.filter(p=>p.file).length} reference views, ${manifest.length} embedded fonts, ${Buffer.byteLength(html)} bytes`);
