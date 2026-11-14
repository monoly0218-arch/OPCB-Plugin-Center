import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
const base=new URL('../',import.meta.url);
export async function pluginCenterDesign(){
 const {css}=await bundleStyles();
 const manifest=JSON.parse(await readFile(new URL('src/plugin-center/assets/MANIFEST.json',base),'utf8')),assets={};
 for(const entry of manifest){assets[entry.name]='data:image/png;base64,'+(await readFile(new URL('src/plugin-center/assets/'+entry.file,base))).toString('base64');}
 return {OPCB_PLUGIN_CENTER_CSS:JSON.stringify(css+'\n'+await readFile(new URL('src/plugin-center/page.css',base),'utf8')),OPCB_PLUGIN_CENTER_ASSETS:JSON.stringify(assets)};
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const options={entryPoints:['src/plugin-center/page.mjs'],outfile:'plugins/opcb.plugin-center/0.2.0/plugin.js',define:await pluginCenterDesign(),bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof'};
 if(process.argv.includes('--check')){const out=await build({...options,write:false});for(const f of out.outputFiles)if(await readFile(f.path,'utf8')!==f.text)throw Error('Stale plugin center bundle');}
 else await build(options);
}
