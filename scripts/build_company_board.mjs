import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {knowledgeDesign} from './knowledge_design.mjs';
const design=await knowledgeDesign();
const prototype=(await readFile('src/tasks/prototype.css','utf8')).replace(/^.*?(?=\.task-workbench\{)/s,'');
const css=JSON.parse(design.OPCB_KNOWLEDGE_UI_CSS)+'\n'+prototype+'\n'+await readFile('src/tasks/live-ui.css','utf8')+'\n'+await readFile('src/tasks/reference-views.css','utf8')+'\n'+await readFile('src/tasks/company-ui.css','utf8');
const options={entryPoints:['src/tasks/company-board.mjs'],outfile:'plugins/opcb.company-board/2.0.0-rc.17/plugin.js',bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',define:{OPCB_COMPANY_PLUGIN_ICON:JSON.stringify('data:image/png;base64,'+(await readFile('plugins/opcb.company-board/2.0.0-rc.17/icon.png')).toString('base64')),OPCB_TASK_LIVE_CSS:JSON.stringify(css)}};
if(process.argv.includes('--check')){const result=await build({...options,write:false});for(const file of result.outputFiles)if(await readFile(file.path,'utf8')!==file.text)throw Error('Stale company board bundle');}else await build(options);
