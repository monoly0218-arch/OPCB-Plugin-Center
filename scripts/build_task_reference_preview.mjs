import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {knowledgeDesign} from './knowledge_design.mjs';
const output=process.argv[2];if(!output)throw Error('Pass output HTML path');
const design=await knowledgeDesign();
const prototype=(await readFile('src/tasks/prototype.css','utf8')).replace(/^.*?(?=\.task-workbench\{)/s,'');
const css=JSON.parse(design.OPCB_KNOWLEDGE_UI_CSS)+'\n'+prototype+'\n'+await readFile('src/tasks/live-ui.css','utf8')+'\n'+await readFile('src/tasks/reference-views.css','utf8');
const result=await build({entryPoints:['dev/task-reference-preview.mjs'],bundle:true,write:false,minify:true,format:'esm',platform:'browser',define:{OPCB_TASK_LIVE_CSS:JSON.stringify(css),OPCB_KNOWLEDGE_UI_ASSETS:design.OPCB_KNOWLEDGE_UI_ASSETS}});
await writeFile(output,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Today · 任务中心还原预览</title><style>html,body,#app{height:100%;margin:0}*{box-sizing:border-box}.tw-live{flex:1}.demo-bar{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:8px 16px;background:#f8efda;color:#58492b;font:12px/1.5 system-ui}.demo-bar button{background:white;border:1px solid #d7c79e;border-radius:8px;padding:6px;cursor:pointer}</style><div id="app"></div><script type="module">${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></html>`);
