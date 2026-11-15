import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {knowledgeDesign} from './knowledge_design.mjs';
const output=process.argv[2],design=await knowledgeDesign();
const prototype=(await readFile('src/tasks/prototype.css','utf8')).replace(/^.*?(?=\.task-workbench\{)/s,'');
const css=JSON.parse(design.OPCB_KNOWLEDGE_UI_CSS)+'\n'+prototype+'\n'+await readFile('src/tasks/live-ui.css','utf8')+'\n'+await readFile('src/tasks/reference-views.css','utf8')+'\n'+await readFile('src/tasks/execution-workspace.css','utf8');
const result=await build({entryPoints:['dev/task-native-fixture.mjs'],bundle:true,write:false,minify:true,format:'esm',platform:'browser',define:{OPCB_TASK_PLUGIN_ICON:JSON.stringify('data:image/png;base64,'+(await readFile('plugins/opcb.task-center/2.0.0-rc.11/icon.png')).toString('base64')),OPCB_TASK_LIVE_CSS:JSON.stringify(css),OPCB_KNOWLEDGE_UI_ASSETS:design.OPCB_KNOWLEDGE_UI_ASSETS}});
await writeFile(output,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>隔离原生接口验收</title><style>html,body,#app{height:100%;margin:0}*{box-sizing:border-box}.fixture-composer{display:grid;gap:12px;padding:12px}.fixture-composer textarea{min-height:100px}</style><div id="app"></div><script type="module">${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></html>`);
