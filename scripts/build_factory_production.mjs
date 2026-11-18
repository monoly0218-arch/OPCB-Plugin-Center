import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
import {IDENTITY_ICONS} from '../src/identity-icons/icons.mjs';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check'),folder=new URL('plugins/opcb.content-factory/2.0.0-rc.8/',root);
const {css,assets}=await bundleStyles();
const fonts=[...css.matchAll(/@font-face\{font-family:'([^']+)';src:url\(data:font\/woff2;base64,([^)]*)\) format\('woff2'\);font-weight:([^;]+);[^}]*\}/g)].map(([,family,data,weight])=>({family,data,weight}));
const styles=css.replace(/@font-face\{[^}]*\}/g,'')+'\n'+await readFile(new URL('src/content-factory/workspace-ui.css',root),'utf8')+'\n'+await readFile(new URL('src/content-factory/production.css',root),'utf8');
export const define={OPCB_FACTORY_ASSETS_UI_CSS:JSON.stringify(styles),OPCB_FACTORY_ASSETS_UI_ASSETS:JSON.stringify(assets),OPCB_FACTORY_ASSETS_FONTS:JSON.stringify(fonts),OPCB_FACTORY_MEDIA_SOURCE:JSON.stringify(await readFile(new URL('src/content-factory/media-stream.py',root),'utf8'))};
const out=await build({entryPoints:[new URL('src/content-factory/plugin.mjs',root).pathname],bundle:true,define,write:false,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'none'});
const output=out.outputFiles[0].text.replace(/icon: "data:image\/svg\+xml;base64,[^"]+"/g,`icon: ${JSON.stringify(IDENTITY_ICONS['opcb.content-factory'])}`);
if(Buffer.byteLength(output)>8*1024*1024)throw Error('Factory bundle exceeds native module limit');
if(check){if(await readFile(new URL('plugin.js',folder),'utf8')!==output)throw Error('Stale factory production bundle');}
else{await mkdir(folder,{recursive:true});await writeFile(new URL('plugin.js',folder),output);}
console.log('Factory production bundle '+(check?'checked':'built'));
