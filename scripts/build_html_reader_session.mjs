import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
const base=new URL('../',import.meta.url),folder=new URL('plugins/opcb.html-reader/0.2.0-rc.2/',base);
const text=path=>readFile(new URL(path,base),'utf8');
await mkdir(folder,{recursive:true});
const define={
 READER_CSS:JSON.stringify(await text('src/html-reader/reader.css')),
 VIEWER_SOURCE:JSON.stringify(await text('src/html-reader/viewer.py')),
 FIT_SOURCE:JSON.stringify(await text('src/html-reader/fit.js')),
 FONT_DATA:await text('plugins/opcb.html-reader/0.1.0-rc.2/source/fonts.json'),
 READER_ICON:JSON.stringify('data:image/png;base64,'+(await readFile(new URL('plugins/opcb.html-reader/0.1.0-rc.2-icons.1-dock.1/icon.png',base))).toString('base64')),
};
const options={entryPoints:[new URL('src/html-reader/plugin.mjs',base).pathname],outfile:new URL('plugin.js',folder).pathname,bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',define};
if(process.argv.includes('--check')){const out=await build({...options,write:false});for(const f of out.outputFiles)if(await readFile(f.path,'utf8')!==f.text)throw Error('Stale session reader bundle');}
else await build(options);
console.log('Built session HTML reader 0.2.0-rc.2');
