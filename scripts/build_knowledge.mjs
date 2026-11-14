import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
const config={bundle:true,format:'esm',target:'es2022',legalComments:'eof',charset:'utf8'};
async function emit(options){
  if(!process.argv.includes('--check'))return build(options);
  const result=await build({...options,write:false});
  for(const file of result.outputFiles){if(await readFile(file.path,'utf8')!==file.text)throw Error(`Stale generated bundle: ${file.path}`);}
}
await emit({...config,entryPoints:['src/chat-artifacts/main.mjs'],outfile:'plugins/opcb.chat-artifacts/2.0.0/plugin.js',platform:'browser'});
for(const [source,directory] of [['reader','opcb.knowledge'],['admin','opcb.knowledge-admin']]){
  await emit({...config,entryPoints:[`src/knowledge/${source}.mjs`],outfile:`plugins/${directory}/2.0.0/plugin.js`,platform:'browser'});
}
await mkdir('services/knowledge/dist',{recursive:true});
await emit({...config,entryPoints:['services/knowledge/identity_auth.mjs'],outfile:'services/knowledge/dist/identity-auth.mjs',platform:'node'});
