import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {knowledgeDesign} from './knowledge_design.mjs';
const output=process.argv[2];if(!output)throw Error('Pass output HTML path');
const result=await build({entryPoints:['src/tasks/prototype.mjs'],define:await knowledgeDesign(),bundle:true,write:false,minify:true,format:'esm',platform:'browser'});
const css=await readFile('src/tasks/prototype.css','utf8'),licenses=await readFile('plugins/opcb.knowledge/2.0.0/DESIGN_LICENSES.txt','utf8');
await writeFile(output,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>跑圈工作 · 任务设计样板</title><style>${css}</style><div id="app"></div><script type="module">${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script><template id="licenses">${licenses.replaceAll('&','&amp;').replaceAll('<','&lt;')}</template></html>`);
console.log('Built task design sample: '+output);
