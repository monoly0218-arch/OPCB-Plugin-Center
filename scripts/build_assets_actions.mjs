import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
import {IDENTITY_ICONS} from '../src/identity-icons/icons.mjs';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check'),folder=new URL('plugins/opcb.shangliangshan-assets/2.0.0-rc.9/',root);
const {css,assets}=await bundleStyles();
const fonts=[...css.matchAll(/@font-face\{font-family:'([^']+)';src:url\(data:font\/woff2;base64,([^)]*)\) format\('woff2'\);font-weight:([^;]+);[^}]*\}/g)].map(([,family,data,weight])=>({family,data,weight}));
const styles=css.replace(/@font-face\{[^}]*\}/g,'')+'\n'+await readFile(new URL('src/content-factory/workspace-ui.css',root),'utf8')+'\n'+await readFile(new URL('src/shangliangshan-assets/actions.css',root),'utf8');
const source=await readFile(new URL('src/shangliangshan-assets/asset-session.py',root),'utf8');
const out=await build({entryPoints:[new URL('src/shangliangshan-assets/plugin.mjs',root).pathname],bundle:true,define:{OPCB_FACTORY_ASSETS_UI_CSS:JSON.stringify(styles),OPCB_FACTORY_ASSETS_UI_ASSETS:JSON.stringify(assets),OPCB_FACTORY_ASSETS_FONTS:JSON.stringify(fonts),OPCB_ASSET_SESSION_SOURCE:JSON.stringify(source)},write:false,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'none'});
const code=out.outputFiles[0].text.replace(/icon: "data:image\/svg\+xml;base64,[^"]+"/g,`icon: ${JSON.stringify(IDENTITY_ICONS['opcb.shangliangshan-assets'])}`);
if(Buffer.byteLength(code)>8*1024*1024)throw Error('Asset bundle exceeds native module limit');
if(check){if(await readFile(new URL('plugin.js',folder),'utf8')!==code||await readFile(new URL('ASSET_SESSION.py',folder),'utf8')!==source)throw Error('Stale assets action bundle');}
else{await mkdir(folder,{recursive:true});await writeFile(new URL('plugin.js',folder),code);await writeFile(new URL('ASSET_SESSION.py',folder),source);for(const name of ['manifest.json','icon.png','IDENTITY.json','THREEDICONS_NOTICE.md','BRAND_ASSETS_NOTICE.md'])await cp(new URL('plugins/opcb.shangliangshan-assets/2.0.0-rc.5/'+name,root),new URL(name,folder));}
console.log('Assets actions bundle '+(check?'checked':'built'));
