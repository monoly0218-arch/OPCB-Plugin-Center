import {build} from 'esbuild';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check');
const rows=JSON.parse(await readFile(new URL('src/channel-toolbar/RELEASES.json',root)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const row of rows){
 const base=new URL(row.basePath+'/',root),folder=new URL(row.sourcePath+'/',root);
 if(hash(await readFile(new URL('plugin.js',base)))!==row.codeSha256)throw Error('Changed toolbar baseline '+row.id);
 const entry=`import * as original from './${row.basePath}/plugin.js';export * from './${row.basePath}/plugin.js';import {withChannelToolbar} from './src/channel-toolbar/context.mjs';export function apply(ctx){return original.apply(withChannelToolbar(ctx,${JSON.stringify(row.id)}));}`;
 const result=await build({stdin:{contents:entry,resolveDir:root.pathname},bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',legalComments:'eof',write:false});
 await mkdir(folder,{recursive:true});
 const output=new Map([['plugin.js',result.outputFiles[0].contents]]);
 for(const name of await readdir(base))if(name!=='plugin.js')output.set(name,await readFile(new URL(name,base)));
 output.set('README.md',Buffer.from(`# ${row.id} ${row.version}\n\n聊天顶部精简版：聊天产物和任务中心保留单个灰色线形图标按钮，沿用 Buzz 原生 ghost/toolbar 样式；号池邮箱和任务中心测试版不再贡献频道顶部快捷入口。原页面、面板匹配、聊天权限、全部工具与存储均沿用各自基线。包和主导航保留3dicons身份图，频道功能按钮采用原生线形符号。\n\n本包仅修订本机已安装的 ${row.baseVersion}，不合入其他未安装业务版本。原始源码SHA256：${row.codeSha256}。原README见 CHANNEL_BASE_README.md，既有字体和图标许可继续适用。\n\n官方 v1.0.5 / Studio 1.0.5-preview.2，API1；无新增权限、宿主修改或自动安装。构建 node scripts/build_channel_toolbar.mjs；检查 npm run ci。macOS原生实际显示待审核安装后验收；移动端未实机验收。插件更新通过固定Git提交的Buzz原生审核卡，保留本人最终确认。\n`));
 output.set('CHANNEL_BASE_README.md',await readFile(new URL('README.md',base)));
 for(const [name,bytes] of output){
  const path=new URL(name,folder);
  if(check){if(!Buffer.from(await readFile(path)).equals(Buffer.from(bytes)))throw Error('Stale toolbar build '+path.pathname);}
  else await writeFile(path,bytes);
 }
}
console.log(`${check?'Checked':'Built'} ${rows.length} channel toolbar packages`);
