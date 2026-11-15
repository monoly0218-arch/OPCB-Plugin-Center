import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {knowledgeDesign} from './knowledge_design.mjs';
const design=await knowledgeDesign();
// Only task-owned selectors; never ship the prototype's document/reset styles.
const prototype=(await readFile('src/tasks/prototype.css','utf8')).replace(/^.*?(?=\.task-workbench\{)/s,'');
const css=JSON.parse(design.OPCB_KNOWLEDGE_UI_CSS)+'\n'+prototype+'\n'+await readFile('src/tasks/live-ui.css','utf8')+'\n'+await readFile('src/tasks/reference-views.css','utf8')+'\n'+await readFile('src/tasks/execution-workspace.css','utf8');
// Published company-board stays immutable; this candidate changes task-center only.
for(const source of ['task-center']){
 const version=source==='task-center'?'2.0.0-rc.16':'2.0.0-rc.14';
 const options={entryPoints:[`src/tasks/${source}.mjs`],outfile:`plugins/opcb.${source}/${version}/plugin.js`,bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',define:{OPCB_TASK_PLUGIN_ICON:JSON.stringify('data:image/png;base64,'+(await readFile('plugins/opcb.task-center/2.0.0-rc.16/icon.png')).toString('base64')),OPCB_TASK_LIVE_CSS:JSON.stringify(css),OPCB_KNOWLEDGE_UI_ASSETS:design.OPCB_KNOWLEDGE_UI_ASSETS}};
 if(process.argv.includes('--check')){
  const result=await build({...options,write:false});
  for(const file of result.outputFiles)if(await readFile(file.path,'utf8')!==file.text)throw Error(`Stale task bundle: ${file.path}`);
 }else await build(options);
}
