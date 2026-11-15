import {build} from 'esbuild';
import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
const root = new URL('../', import.meta.url);
const {css,assets} = await bundleStyles();
const adaptation = await readFile(new URL('src/content-factory/workspace-ui.css',root),'utf8');
const define = {OPCB_FACTORY_ASSETS_UI_CSS:JSON.stringify(css+'\n'+adaptation),OPCB_FACTORY_ASSETS_UI_ASSETS:JSON.stringify(assets)};
for (const [id, source] of [['opcb.content-factory','content-factory'], ['opcb.shangliangshan-assets','shangliangshan-assets']]) {
  const result = await build({entryPoints:[new URL(`src/${source}/plugin.mjs`,root).pathname],bundle:true,define,write:false,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'none'});
  const output = result.outputFiles[0].text;
  const path = new URL(`plugins/${id}/2.0.0-rc.1/plugin.js`,root);
  if (process.argv.includes('--check')) {
    if (await readFile(path,'utf8') !== output) throw Error(`Stale ${id} bundle`);
  } else {
    await writeFile(path,output);
    for(const name of ['NUNITO_OFL.txt','RESOURCE_HAN_ROUNDED_OFL.txt']) await copyFile(new URL('design-system/v3/fonts/'+name,root),new URL(name,path));
    await copyFile(new URL('design-system/v3/FLUENT_EMOJI_LICENSE.txt',root),new URL('FLUENT_EMOJI_LICENSE.txt',path));
  }
}
console.log('Factory/assets bundles match their source.');
