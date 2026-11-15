import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const icon='data:image/png;base64,'+(await readFile('plugins/opcb.results-report/2.0.0-rc.2/icon.png')).toString('base64');
const options={define:{OPCB_REPORT_ICON:JSON.stringify(icon)},entryPoints:['src/commercial/plugin.mjs'],outfile:'plugins/opcb.results-report/2.0.0-rc.2/plugin.js',bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',loader:{'.css':'text','.html':'text'}};
if(process.argv.includes('--check')){const result=await build({...options,write:false});for(const file of result.outputFiles)if(await readFile(file.path,'utf8')!==file.text)throw Error('Stale commercial bundle');}else await build(options);
