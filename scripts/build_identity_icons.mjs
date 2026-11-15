import {build} from 'esbuild';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check');
const releases=JSON.parse(await readFile(new URL('src/identity-icons/RELEASES.json',root)));
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const icons={},sources=[];
async function emit(url,bytes){if(check){if(!Buffer.from(await readFile(url)).equals(Buffer.from(bytes)))throw Error('Stale identity artifact '+url.pathname);}else await writeFile(url,bytes);}
for(const row of releases){
 if(icons[row.id])continue;
 const bytes=await readFile(new URL(`src/identity-icons/assets/${row.iconName}.png`,root));
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Expected original PNG '+row.id);
 icons[row.id]='data:image/png;base64,'+bytes.toString('base64');
 sources.push({id:row.id,name:row.iconName,url:row.iconUrl,collection:'V1',license:'CC0-1.0',angle:'dynamic',color:'color',sha256:sha256(bytes)});
}
await emit(new URL('src/identity-icons/icons.mjs',root),'// Generated from 3dicons.co V1 original PNGs, CC0-1.0. No runtime image request.\nexport const IDENTITY_ICONS=Object.freeze('+JSON.stringify(icons,null,2)+');\n');
await emit(new URL('src/identity-icons/SOURCES.json',root),JSON.stringify(sources,null,2)+'\n');
export async function bundleIdentity({id,basePath,sourcePath,codeSha256}){
 const icon=icons[id];if(!icon)throw Error('No canonical identity '+id);
 const original=new URL(basePath+'/',root),folder=new URL(sourcePath+'/',root);
 const code=await readFile(new URL('plugin.js',original));
 if(sha256(code)!==codeSha256)throw Error('Changed business baseline '+id);
 const oldIcon=await readFile(new URL('icon.png',original)).catch(()=>null);
 // Replace only identity artwork already in that package; functional control icons stay intact.
 const oldUri=oldIcon?'data:image/png;base64,'+oldIcon.toString('base64'):null;
 let text=code.toString();if(oldUri)text=text.split(oldUri).join(icon);
 // Existing artifact channel button used the pre-PNG SVG; preserve its button and behavior.
 if(id==='opcb.chat-artifacts'){
  const matches=[...text.matchAll(/src: "data:image\/svg\+xml;base64,[^"]+"/g)];
  if(matches.length>1||(!matches.length&&!text.includes(icon)))throw Error('Inspect artifact identity button before building');
  if(matches.length)text=text.replace(matches[0][0],`src: ${JSON.stringify(icon)}`);
 }
 const entry=`import * as original from './${basePath}/plugin.js';export * from './${basePath}/plugin.js';import {withPluginIcon} from './src/plugin-icons/context.mjs';export function apply(ctx){return original.apply(withPluginIcon(ctx,${JSON.stringify(icon)}));}`;
 const result=await build({stdin:{contents:entry,resolveDir:root.pathname},bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',write:false,plugins:[{name:'package-identity',setup(b){b.onLoad({filter:/plugin\.js$/},args=>args.path===new URL('plugin.js',original).pathname?{contents:text,loader:'js'}:undefined);}}]});
 await mkdir(folder,{recursive:true});await emit(new URL('plugin.js',folder),result.outputFiles[0].contents);
 for(const file of await readdir(original)){if(['plugin.js','README.md','icon.png','THREEDICONS_NOTICE.md','IDENTITY.json'].includes(file))continue;await emit(new URL(file==='BASE_README.md'?'BUSINESS_README.md':file,folder),await readFile(new URL(file,original)));}
 await emit(new URL('icon.png',folder),Buffer.from(icon.split(',')[1],'base64'));
 return {folder,original};
}
for(const row of releases){
 if(row.id==='opcb.plugin-center'||row.buildScript)continue; // Built from maintained source, including the catalog and User-Agent fix.
 const {folder,original}=await bundleIdentity(row);
 await emit(new URL('BASE_README.md',folder),await readFile(new URL('README.md',original)));
 await emit(new URL('README.md',folder),`# ${row.name} ${row.version}\n\n本次更新将3dicons.co V1彩色立体图标随本插件包内嵌分发，导航、既有启动图标与包图标使用同一原图。更新插件即可获得图标，无需额外图标插件或运行时下载。\n\n保留公开业务基线${row.baseVersion}、插件ID、全部权限、配置键、页面和工具。原源码SHA256：${row.codeSha256}。原功能、依赖与平台限制见BASE_README.md；原说明中的旧图标描述由本页取代；如基线来自早期图标包，早期业务说明见BUSINESS_README.md。号池1.3与1.4独立保留，图标更新不切换业务线。\n\n官方与Studio参考Buzz1.0.2/API1；本地完整检查npm run ci，原生安装后与移动端业务另行验收。通过固定提交的Buzz原生审核卡安装，保留本人最终确认。\n\n构建node scripts/build_identity_icons.mjs，统一图标与后续更新规则见docs/IDENTITY_ICONS.md。图标来源、许可与哈希见THREEDICONS_NOTICE.md及IDENTITY.json。\n`);
}
for(const row of releases){
 const folder=new URL(row.sourcePath+'/',root);await mkdir(folder,{recursive:true});
 const source=sources.find(s=>s.id===row.id);
 await emit(new URL('IDENTITY.json',folder),JSON.stringify({schema:1,...source},null,2)+'\n');
 await emit(new URL('THREEDICONS_NOTICE.md',folder),`# 3dicons.co V1\n\nOriginal artwork by Vijay Verma / realvjy. V1 collection: CC0 1.0 Universal.\nSource: ${source.url}\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\nFile: original 500px transparent PNG, color / dynamic, downloaded from the official Download current action. No redraw, crop, recolor or image transformation.\nSHA256: ${source.sha256}\n\nEmbedded in this plugin and icon.png. Historical business licenses remain applicable to their respective code/assets. No runtime image requests or extra permissions.\n`);
 if(row.id==='opcb.plugin-center')await emit(new URL('icon.png',folder),Buffer.from(icons[row.id].split(',')[1],'base64'));
}
console.log(`${check?'Checked':'Built'} ${releases.length} self-contained identity packages (${sources.length} plugin IDs)`);
