import {build} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
for (const [id, source] of [['opcb.content-factory','content-factory'], ['opcb.shangliangshan-assets','shangliangshan-assets']]) {
  const result = await build({entryPoints:[new URL(`src/${source}/plugin.mjs`,root).pathname],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'none'});
  const output = result.outputFiles[0].text;
  const path = new URL(`plugins/${id}/2.0.0-rc.1/plugin.js`,root);
  if (process.argv.includes('--check')) {
    if (await readFile(path,'utf8') !== output) throw Error(`Stale ${id} bundle`);
  } else await writeFile(path,output);
}
console.log('Factory/assets bundles match their source.');
