import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const phone=await readFile(new URL('../src/mobile-design/assets/phone.png',import.meta.url));
const phoneModule="// Generated from assets/phone.png; 3dicons.co V1 Mobile, CC0-1.0.\nexport const PHONE_ICON='data:image/png;base64,"+phone.toString('base64')+"';\n";
if(await readFile(new URL('../src/mobile-design/phone-icon.mjs',import.meta.url),'utf8')!==phoneModule)throw Error('Mobile phone data does not match the licensed source image');
const worker=await readFile(new URL('../src/mobile-design/viewer.py',import.meta.url),'utf8');
const helper=await readFile(new URL('../src/mobile-design/annotate.js',import.meta.url),'utf8');
const options={entryPoints:[new URL('../src/mobile-design/plugin.mjs',import.meta.url).pathname],outfile:new URL('../plugins/opcb.mobile-design/0.1.0-rc.8/plugin.js',import.meta.url).pathname,bundle:true,format:'esm',target:'es2022',legalComments:'inline',define:{VIEWER_SOURCE:JSON.stringify(worker),ANNOTATION_SOURCE:JSON.stringify(helper)}};
if(process.argv.includes('--check')){const result=await build({...options,write:false});if(result.outputFiles[0].text!==await readFile(options.outfile,'utf8'))throw Error('Mobile design bundle is stale');}else await build(options);
