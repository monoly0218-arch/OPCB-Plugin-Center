import {build} from 'esbuild';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pluginCenterDesign} from './build_plugin_center.mjs';
import {pluginIcon} from '../src/plugin-center/visuals.mjs';
const base=new URL('../',import.meta.url),check=process.argv.includes('--check');
const index=process.argv.indexOf('--releases');
if(index>=0&&(!process.argv[index+1]||process.argv[index+1].startsWith('--')))throw Error('Missing --releases path');
const releaseFile=index>=0?process.argv[index+1]:'src/plugin-icons/RELEASES.json';
const releases=JSON.parse(await readFile(new URL(releaseFile,base)));
const assets=JSON.parse((await pluginCenterDesign()).OPCB_PLUGIN_CENTER_ASSETS);
async function output(path,bytes){if(check){if(!Buffer.from(await readFile(path)).equals(Buffer.from(bytes)))throw Error('Stale icon release '+path);}else await writeFile(path,bytes);}
for(const release of releases){
 const folder=new URL(release.sourcePath+'/',base),original=new URL(release.basePath+'/',base),icon=pluginIcon({id:release.id},assets);
 const source=await readFile(new URL('plugin.js',original),'utf8');
 if(createHash('sha256').update(source).digest('hex')!==release.codeSha256)throw Error('Changed business baseline '+release.id);
 await mkdir(folder,{recursive:true});
 const entry=`import * as original from './${release.basePath}/plugin.js';export * from './${release.basePath}/plugin.js';import {withPluginIcon} from './src/plugin-icons/context.mjs';export function apply(ctx){return original.apply(withPluginIcon(ctx,${JSON.stringify(icon)}));}`;
 const bundle=await build({stdin:{contents:entry,resolveDir:new URL(base).pathname},bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',write:false,plugins:[{name:'identity-art',setup(b){b.onLoad({filter:/plugin\.js$/},async args=>{
  if(release.id!=='opcb.chat-artifacts')return;
  let contents=await readFile(args.path,'utf8');
  // The channel's existing artifact button keeps its behavior and label.
  const matches=[...contents.matchAll(/src: "data:image\/svg\+xml;base64,[^"]+"/g)];
  if(matches.length!==1)throw Error('Artifact identity image changed; inspect its launcher');
  contents=contents.replace(matches[0][0],`src: ${JSON.stringify(icon)}`);
  return {contents,loader:'js'};
 });}}]});
 await output(new URL('plugin.js',folder),bundle.outputFiles[0].contents);
 await output(new URL('manifest.json',folder),await readFile(new URL('manifest.json',original)));
 const [header,payload]=icon.split(','),bytes=Buffer.from(payload,'base64');
 if(header==='data:image/png;base64')await output(new URL('icon.png',folder),bytes);
 else {
  const converted=await readFile(new URL('src/plugin-center/assets/brand/muse.png',base));
  await output(new URL('icon.png',folder),converted);
 }
 const readme=`# ${release.name} ${release.version}\n\n本次只更新插件包图标、原生页面导航和已有面板启动图标。采用插件中心同一资源：官方品牌/IP优先，其余Fluent 3D。插件ID、权限、页面ID、业务代码、Agent工具与账号/配对方式保持原基线。\n\n业务基线：${release.baseVersion}；原运行revision：${release.baselineRevision}。原JS SHA256：${release.codeSha256}；未修改的入口见${release.basePath}。构建时只在注册处补图标，聊天产物的既有频道按钮替换身份图片。\n\n${release.localAssetsDiffer?'这是公开的空白资产库模板；不用于替换Studio含本机素材的安装。该设备图标补丁独立保留在本机，不公开其素材。':'配置与凭据不随包分发；升级仍需Buzz原生审核，是否已安装以实际revision回读为准。'}\n\nAPI v1，参考官方与本机Buzz 1.0.2；完整仓库检查npm run ci，构建node scripts/build_plugin_icons.mjs。原生安装、业务、Android/iOS需分别验收。原版依赖见BASE_README.md。图标资源来源及授权见BRAND_ASSETS_NOTICE.md、FLUENT_EMOJI_LICENSE.txt。\n`;
 await output(new URL('README.md',folder),readme);
 await output(new URL('BASE_README.md',folder),await readFile(new URL('README.md',original)));
 for(const file of await readdir(original))if(!['plugin.js','manifest.json','icon.png','README.md'].includes(file))await output(new URL(file,folder),await readFile(new URL(file,original)));
 for(const file of ['BRAND_ASSETS_NOTICE.md','FLUENT_EMOJI_LICENSE.txt'])await output(new URL(file,folder),await readFile(new URL('plugins/opcb.plugin-center/0.2.4/'+file,base)));
}
console.log(`${check?'Checked':'Built'} ${releases.length} plugin identity releases`);
