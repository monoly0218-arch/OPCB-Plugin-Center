import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {knowledgeDesign} from './knowledge_design.mjs';
const design=await knowledgeDesign();
// Only task-owned selectors; never ship the prototype's document/reset styles.
const prototype=(await readFile('src/tasks/prototype.css','utf8')).replace(/^.*?(?=\.task-workbench\{)/s,'');
const css=JSON.parse(design.OPCB_KNOWLEDGE_UI_CSS)+'\n'+prototype+'\n'+await readFile('src/tasks/live-ui.css','utf8');
for(const source of ['task-center','company-board']){
 const options={entryPoints:[`src/tasks/${source}.mjs`],outfile:`plugins/opcb.${source}/2.0.0/plugin.js`,bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',define:{OPCB_TASK_LIVE_CSS:JSON.stringify(css),OPCB_KNOWLEDGE_UI_ASSETS:design.OPCB_KNOWLEDGE_UI_ASSETS}};
 if(process.argv.includes('--check')){
  const result=await build({...options,write:false});
  for(const file of result.outputFiles)if(await readFile(file.path,'utf8')!==file.text)throw Error(`Stale task bundle: ${file.path}`);
 }else await build(options);
}
