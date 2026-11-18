import {build} from 'esbuild';
import {PROGRESS_SKILL_TEXT} from '../src/project-workspace/guide.mjs';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {bundleStyles} from '../design-system/v3/scripts/build-styles.mjs';
import {createHash} from 'node:crypto';
const folder='plugins/opcb.project-workspace/0.1.0-rc.22',check=process.argv.includes('--check');
const design=await bundleStyles();
const styles=design.css+'\n'+await readFile('src/tasks/reference-views.css','utf8')+'\n'+await readFile('src/project-workspace/workspace.css','utf8')+'\n'+await readFile('src/project-workspace/board.css','utf8');
const icon=await readFile('src/identity-icons/assets/notebook.png');
const define={OPCB_PROJECT_STYLES:JSON.stringify(styles),OPCB_PROJECT_ICON:JSON.stringify('data:image/png;base64,'+icon.toString('base64'))};
const result=await build({entryPoints:['src/project-workspace/plugin.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',write:false,define});
if(result.outputFiles[0].contents.length>8*1024*1024)throw Error('Plugin module exceeds native limit');
if(check){if(await readFile(folder+'/plugin.js','utf8')!==result.outputFiles[0].text)throw Error('Stale project workspace bundle');if(await readFile(folder+'/ONE_LINE_PROGRESS_SKILL.md','utf8')!==PROGRESS_SKILL_TEXT)throw Error('Stale progress skill instructions');}
else {
 await mkdir(folder,{recursive:true});await writeFile(folder+'/plugin.js',result.outputFiles[0].text);await writeFile(folder+'/ONE_LINE_PROGRESS_SKILL.md',PROGRESS_SKILL_TEXT);await copyFile('src/identity-icons/assets/notebook.png',folder+'/icon.png');for(const file of ['NUNITO_OFL.txt','RESOURCE_HAN_ROUNDED_OFL.txt'])await copyFile('design-system/v3/fonts/'+file,folder+'/'+file);
 const source=JSON.parse(await readFile('src/identity-icons/assets/notebook.source.json','utf8'));
 const identity={schema:1,id:'opcb.project-workspace',name:'notebook',url:source.url,collection:'V1',license:'CC0-1.0',angle:'dynamic',color:'color',sha256:createHash('sha256').update(icon).digest('hex')};
 await writeFile(folder+'/IDENTITY.json',JSON.stringify(identity,null,2)+'\n');
 await writeFile(folder+'/THREEDICONS_NOTICE.md',`# 3dicons.co V1 Notebook\n\nOriginal artwork by Vijay Verma / realvjy. CC0 1.0 Universal.\nSource: ${source.url}\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\nSHA256: ${identity.sha256}\n\nOriginal transparent PNG embedded in plugin.js and icon.png. No transformation or runtime request.\n`);
}
if(process.argv.includes('--preview')){
 const output=process.argv[process.argv.indexOf('--preview')+1];if(!output)throw Error('Pass preview HTML path');
 const dataPath=process.argv.includes('--preview-data')?process.argv[process.argv.indexOf('--preview-data')+1]:null;
 const previewData=dataPath?JSON.parse(await readFile(dataPath,'utf8')):null;
 const preview=await build({entryPoints:['src/project-workspace/preview.mjs'],bundle:true,minify:true,format:'esm',platform:'browser',target:'es2022',write:false,define:{...define,OPCB_PROJECT_PREVIEW_DATA:JSON.stringify(previewData)}});
 await writeFile(output,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>任务中心-测试版 · 插件验收</title><style>html,body,#app{height:100%;margin:0}body{background:#0c0c0d}#app{height:100dvh}</style><div id="app"></div><script type="module">${preview.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></html>`);
}
console.log((check?'Checked ':'Built ')+folder+' · '+result.outputFiles[0].contents.length+' bytes');
