import {build} from 'esbuild';
import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
const root = new URL('../', import.meta.url);
const {css,assets} = await bundleStyles();
const adaptation = await readFile(new URL('src/content-factory/workspace-ui.css',root),'utf8');
const fonts=[...css.matchAll(/@font-face\{font-family:'([^']+)';src:url\(data:font\/woff2;base64,([^)]*)\) format\('woff2'\);font-weight:([^;]+);[^}]*\}/g)].map(([,family,data,weight])=>({family,data,weight}));
const nativeCss=css.replace(/@font-face\{[^}]*\}/g,'');
const assetSessionSource=await readFile(new URL('src/shangliangshan-assets/native-session.py',root),'utf8');
const mediaSource=await readFile(new URL('src/content-factory/media-stream.py',root),'utf8');
const define = {OPCB_FACTORY_ASSETS_UI_CSS:JSON.stringify(nativeCss+'\n'+adaptation),OPCB_FACTORY_ASSETS_UI_ASSETS:JSON.stringify(assets),OPCB_FACTORY_ASSETS_FONTS:JSON.stringify(fonts),OPCB_FACTORY_MEDIA_SOURCE:JSON.stringify(mediaSource),OPCB_ASSET_SESSION_SOURCE:JSON.stringify(assetSessionSource)};
for (const [id, source] of [['opcb.content-factory','content-factory'], ['opcb.shangliangshan-assets','shangliangshan-assets']]) {
  const result = await build({entryPoints:[new URL(`src/${source}/plugin.mjs`,root).pathname],bundle:true,define,write:false,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'none'});
  const output = result.outputFiles[0].text;
  const path = new URL(`plugins/${id}/2.0.0-rc.3/plugin.js`,root);
  if (process.argv.includes('--check')) {
    if (await readFile(path,'utf8') !== output) throw Error(`Stale ${id} bundle`);
    if(id==='opcb.shangliangshan-assets'&&await readFile(new URL('ASSET_SESSION.py',path),'utf8')!==assetSessionSource)throw Error('Stale reviewed asset-session source');
  } else {
    await writeFile(path,output);
    if(id==='opcb.shangliangshan-assets')await writeFile(new URL('ASSET_SESSION.py',path),assetSessionSource);
    for(const name of ['NUNITO_OFL.txt','RESOURCE_HAN_ROUNDED_OFL.txt']) await copyFile(new URL('design-system/v3/fonts/'+name,root),new URL(name,path));
    await copyFile(new URL('design-system/v3/FLUENT_EMOJI_LICENSE.txt',root),new URL('FLUENT_EMOJI_LICENSE.txt',path));
  }
}
console.log('Factory/assets bundles match their source.');
