import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const worker=await readFile(new URL('../plugins/opcb.html-reader/0.1.0-rc.2/source/viewer.py',import.meta.url),'utf8');
const options={entryPoints:[new URL('../src/mobile-design/plugin.mjs',import.meta.url).pathname],outfile:new URL('../plugins/opcb.mobile-design/0.1.0-rc.2/plugin.js',import.meta.url).pathname,bundle:true,format:'esm',target:'es2022',legalComments:'inline',define:{VIEWER_SOURCE:JSON.stringify(worker)}};
if(process.argv.includes('--check')){const result=await build({...options,write:false});if(result.outputFiles[0].text!==await readFile(options.outfile,'utf8'))throw Error('Mobile design bundle is stale');}else await build(options);
