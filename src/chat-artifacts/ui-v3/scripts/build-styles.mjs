/** Build-time helper; return bundled CSS/assets without runtime network dependencies. */
import {readFile} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
export async function bundleStyles({includeAlternate=false}={}){
 const manifest=JSON.parse(await readFile(new URL('fonts/MANIFEST.json',base),'utf8'));
 let fonts='';
 for(const f of manifest.filter(f=>includeAlternate||f.family!=='OPCB Quicksand')){const data=await readFile(new URL('fonts/'+f.file,base));fonts+=`@font-face{font-family:'${f.family}';src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2');font-weight:${f.weight};font-display:swap;}\n`;}
 const css=await Promise.all(['tokens.css','components.css','typography.css','scenes.css'].map(p=>readFile(new URL(p,base),'utf8')));
 const assets={},manifestAssets=JSON.parse(await readFile(new URL('assets/MANIFEST.json',base),'utf8'));
 for(const a of manifestAssets){const data=await readFile(new URL('assets/'+a.file,base));assets[a.name]='data:image/png;base64,'+data.toString('base64');}
 return{css:fonts+css.join('\n'),assets};
}
