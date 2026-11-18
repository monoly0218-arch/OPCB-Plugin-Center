import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),folder=new URL('plugins/opcb.muse-link/0.2.0/',root);
const icon='data:image/png;base64,'+(await readFile(new URL('src/identity-icons/assets/mic.png',root))).toString('base64');
await mkdir(folder,{recursive:true});
const contents=`import * as original from './src/muse-link/plugin.js';export * from './src/muse-link/plugin.js';import {withPluginIcon} from './src/plugin-icons/context.mjs';export function apply(ctx){return original.apply(withPluginIcon(ctx,${JSON.stringify(icon)}));}`;
const options={stdin:{contents,resolveDir:root.pathname},outfile:new URL('plugin.js',folder).pathname,bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof'};
if(process.argv.includes('--check')){const result=await build({...options,write:false});if(result.outputFiles[0].text!==await readFile(options.outfile,'utf8'))throw Error('Stale Muse Link bundle');}
else await build(options);
console.log('Muse Link 0.2.0 bundle verified');
