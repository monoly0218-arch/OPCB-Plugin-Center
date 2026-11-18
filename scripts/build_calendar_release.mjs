import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const source=join(root,'integrations/opcb.team-calendar/cloud');
export async function buildCalendarRelease(){
 const pkg=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
 if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw Error('日历正式版本必须使用 major.minor.patch');
 const lock=JSON.parse(await readFile(join(source,'package-lock.json'),'utf8'));
 if(lock.version!==pkg.version||lock.packages[''].version!==pkg.version)throw Error('请同时更新 package-lock.json 版本');
 const version=pkg.version,sourcePath=`plugins/opcb.team-calendar/${version}`,folder=join(root,sourcePath);
 await mkdir(folder,{recursive:true});
 // The existing center already uses this canonical shared V1 icon for new IDs.
 // Keep its card and native page identical without duplicating PNGs in REGISTRY.
 const icon=await readFile(join(root,'src/identity-icons/assets/puzzle.png'));
 const iconUri='data:image/png;base64,'+icon.toString('base64');
 const buildOptions={bundle:true,format:'esm',target:'es2022',charset:'utf8',write:false,minify:true,logLevel:'silent'};
 const ui=await build({...buildOptions,entryPoints:[join(source,'src/plugin.jsx')],platform:'browser',loader:{'.css':'text'},jsxFactory:'React.createElement',jsxFragment:'React.Fragment',plugins:[{name:'calendar-release-icon',setup(b){b.onLoad({filter:/src\/plugin\.jsx$/},async({path})=>({contents:(await readFile(path,'utf8')).replace("title:'团队日历',primary:true",`title:'团队日历',icon:${JSON.stringify(iconUri)},primary:true`),loader:'jsx'}));}}]});
 await writeFile(join(folder,'plugin.js'),ui.outputFiles[0].contents);
 const portableRuntime=`import {join} from 'node:path';import {homedir} from 'node:os';export function runtimeOptions(){return {configPath:process.env.CALENDAR_CONFIG||join(homedir(),'.config','opcb-team-calendar','client.json')}}`;
 async function bridge(events){
  const contents=events?`import ${JSON.stringify(join(source,'server/events.mjs'))};`:`import {request} from ${JSON.stringify(join(source,'server/client.mjs'))};try{let input='';for await(const c of process.stdin){input+=c;if(Buffer.byteLength(input)>65536)throw Error('请求过大')}const d=JSON.parse(input);console.log(JSON.stringify({ok:true,data:await request(d.action,d.args,undefined,d.viewer)}))}catch(e){console.log(JSON.stringify({ok:false,error:e.message,status:e.status}))}`;
  const out=await build({...buildOptions,stdin:{contents,resolveDir:source,sourcefile:'portable-entry.mjs'},platform:'node',plugins:[{name:'portable-calendar-runtime',setup(b){
   b.onResolve({filter:/^\.\/runtime\.mjs$/},()=>({path:'runtime',namespace:'portable'}));
   b.onLoad({filter:/.*/,namespace:'portable'},()=>({contents:portableRuntime,loader:'js'}));
   b.onLoad({filter:/server\/client\.mjs$/},async({path})=>({contents:(await readFile(path,'utf8')).replace('if(process.argv[1]===fileURLToPath(import.meta.url))','if(false)'),loader:'js'}));
  }}]});
  const encoded=Buffer.from(out.outputFiles[0].contents).toString('base64');
  const chunks=encoded.match(/.{1,1024}/g)||[];
  const args=['--input-type=module','-e',"await import('data:text/javascript;base64,'+process.argv.slice(1).join(''))",...chunks];
  if(args.length>16)throw Error('便携桥接超出宿主参数限制');
  return args;
 }
 const manifest={id:'opcb.team-calendar',name:`团队日历 ${version}`,apiVersion:1,description:'共享云端团队日历、周计划、成员排期与会议。',updates:{defaultEnabled:true},discovery:{category:'productivity',tags:['calendar','team','tasks']},host:{commands:[{id:'calendar-client',program:'node',args:await bridge(false),maxInputBytes:65536,maxOutputBytes:1048576}],processes:[{id:'calendar-events',program:'node',args:await bridge(true)}]}};
 await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const connect=await build({...buildOptions,entryPoints:[join(source,'scripts/connect.mjs')],platform:'node'});
 await writeFile(join(folder,'CONNECT_CALENDAR.mjs'),connect.outputFiles[0].contents);
 await copyFile(join(root,'docs/TEAM_CALENDAR_RELEASE_AUTOMATION.md'),join(folder,'README.md'));
 await writeFile(join(folder,'icon.png'),icon);
 const iconSource=JSON.parse(await readFile(join(root,'src/identity-icons/assets/puzzle.source.json'),'utf8'));
 await writeFile(join(folder,'IDENTITY.json'),JSON.stringify({schema:1,id:manifest.id,name:'puzzle',collection:'V1',license:'CC0-1.0',url:iconSource.url,sha256:createHash('sha256').update(icon).digest('hex')},null,2)+'\n');
 await writeFile(join(folder,'THREEDICONS_NOTICE.md'),'Original artwork: Vijay Verma / realvjy, 3dicons.co V1 puzzle, CC0-1.0. https://creativecommons.org/publicdomain/zero/1.0/\n');
 // Source tests serve the preview from this directory; build it before testing.
 await mkdir(join(source,'plugin'),{recursive:true});
 await writeFile(join(source,'plugin/plugin.js'),ui.outputFiles[0].contents);
 await writeFile(join(source,'plugin/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await build({...buildOptions,entryPoints:[join(source,'preview/entry.jsx')],outfile:join(source,'preview/app.js'),write:true,platform:'browser',loader:{'.css':'text'},jsxFactory:'React.createElement',jsxFragment:'React.Fragment',define:{'process.env.NODE_ENV':'"production"'}});
 return {version,folder,sourcePath,downloadPath:`releases/opcb.team-calendar_${version.replaceAll('.','_')}.zip`};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildCalendarRelease()));
