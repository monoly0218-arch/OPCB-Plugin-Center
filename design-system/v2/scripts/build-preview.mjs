import {readFile,writeFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createIcons,ICON_NAMES} from '../../v1/icons.mjs';
const Icon=createIcons(React);
const iconMarkup=Object.fromEntries(ICON_NAMES.map(name=>[name,renderToStaticMarkup(React.createElement(Icon,{name,size:18}))]));
const base=new URL('../',import.meta.url);
const [tpl,tokens,components,preview,script]=await Promise.all(['preview.template.html','tokens.css','components.css','preview.css','preview.js'].map(p=>readFile(new URL(p,base),'utf8')));
// Public reference images are delivered separately. The portable preview keeps original URLs.
let refs={tasks:'https://paogroup.communities.buzz.xyz/media/c4292ffd54ebe97d82627cb69d2b7805b23b53e1cce31816512623dbd5e37501.webp',board:'https://paogroup.communities.buzz.xyz/media/cd44503d2f4de463f235f31ff9ac6456d04f81f064d86a348bd24aa908e86004.webp',sphere:'https://paogroup.communities.buzz.xyz/media/fd7a00cc9c76438273f97e7bc1e73fe87a1d4568da7bb77d3ab63ef1385f73dd.jpg'};
// Optional offline build: include the owner's existing public reference archive without committing it.
if(process.env.OPCB_REFERENCE_ROOT){const root=new URL('file://'+process.env.OPCB_REFERENCE_ROOT.replace(/\/$/,'')+'/');for(const [key,path] of Object.entries({tasks:'WODAY_PAGES/OFFICIAL_4.webp',board:'WODAY_PAGES/OFFICIAL_7.webp',sphere:'SPHERE_NOTES_1.jpg'})){const b=await readFile(new URL(path,root));refs[key]=`data:image/${path.endsWith('.jpg')?'jpeg':'webp'};base64,${b.toString('base64')}`;}}
if(script.includes('</script'))throw Error('Unsafe script terminator');
await writeFile(new URL('PREVIEW.html',base),tpl.replace('/*__STYLES__*/',[tokens,components,preview].join('\n')).replace('/*__SCRIPT__*/','const REFS='+JSON.stringify(refs)+';const V2_ICONS='+JSON.stringify(iconMarkup)+';\n'+script));
console.log('Built v2 standalone preview');
