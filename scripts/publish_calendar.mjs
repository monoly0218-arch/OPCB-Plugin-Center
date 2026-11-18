import {readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {buildCalendarRelease,root,source} from './build_calendar_release.mjs';

const catalogRef='distribution/3dicons-catalog-20261115',releaseRef='distribution/team-calendar-cloud';
const repository='monoly0218-arch/OPCB-Plugin-Center';
const git=(args,input)=>execFileSync('git',args,{cwd:root,input,encoding:'utf8'}).trim();
const read=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
const write=async(path,value)=>writeFile(join(root,path),JSON.stringify(value,null,2)+'\n');
function identity(){
 const name=git(['config','user.name']),email=git(['config','user.email']);
 if(!name||!email)throw Error('请先配置本仓库的人类负责人 Git 姓名和邮箱');
 return `${name} <${email}>`;
}
const trailers=()=>`Co-authored-by: MooStudio <936956c409fe0cc10f18ab8363b479b1f9c1bb6a9c6d8f0595f1b42cfce07003@opcb.communities.buzz.xyz>\nCo-authored-by: ${identity()}\nSigned-off-by: ${identity()}`;
if(process.argv.includes('--prepare')){
 const release=await buildCalendarRelease();
 const names=(await readdir(release.folder)).sort();
 const tree=git(['mktree'],names.map(name=>{
  if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('非法分发文件名');
  return `100644 blob ${git(['hash-object','-w',join(release.folder,name)])}\t${name}\n`;
 }).join(''));
 const previousResult=spawnSync('git',['rev-parse','--verify',`refs/remotes/origin/${releaseRef}`],{cwd:root,encoding:'utf8'});
 const previous=previousResult.status===0?previousResult.stdout.trim():undefined;
 let commit;
 if(previous&&git(['show',`${previous}:manifest.json`])){
  const old=JSON.parse(git(['show',`${previous}:manifest.json`]));
  if(old.name===`团队日历 ${release.version}`){
   if(git(['rev-parse',`${previous}^{tree}`])!==tree)throw Error('已发布版本不可覆盖；请先增加 package.json 版本');
   commit=previous;
  }
 }
 if(!commit)commit=git(['commit-tree',tree,...(previous?['-p',previous]:[]),'-m',`release(calendar): ${release.version}\n\n${trailers()}`]);
 const registry=await read('REGISTRY.json');
 for(const entry of registry.entries)if(entry.id==='opcb.team-calendar')entry.legacy=true;
 const entry={id:'opcb.team-calendar',name:'团队日历',version:release.version,category:'工作协作',legacy:false,
  summary:'共享云端日/周/月历、成员排期、会议和周计划；保留独立设备授权。',
  requirements:'Node.js 22.13+；新设备使用本人邀请码连接已有云端，配置保存在 ~/.config/opcb-team-calendar/client.json。已安装设备继续原连接；真实双设备同步仍待验收。',
  sourcePath:release.sourcePath,downloadPath:release.downloadPath,
  reviewSource:{repository,reference:releaseRef,commit,path:'.'}};
 registry.entries=registry.entries.filter(e=>e.id!==entry.id||e.version!==entry.version);registry.entries.push(entry);
 await write('REGISTRY.json',registry);
 const candidates=await read('CANDIDATES.json');
 candidates.entries=candidates.entries.filter(e=>e.id!==entry.id||e.version!==entry.version);candidates.entries.push(entry);
 await write('CANDIDATES.json',candidates);
 await write('releases/TEAM_CALENDAR_PUBLICATION.json',{schema:1,version:release.version,reference:releaseRef,commit,tree,sourcePath:release.sourcePath,downloadPath:release.downloadPath,catalogReference:catalogRef});
 execFileSync('python3',['scripts/release_identity.py'],{cwd:root,stdio:'inherit'});
 execFileSync('python3',['scripts/package_release.py'],{cwd:root,stdio:'inherit'});
 console.log(JSON.stringify({prepared:true,version:release.version,commit,published:false}));
}else if(process.argv.includes('--push')){
 const release=await read('releases/TEAM_CALENDAR_PUBLICATION.json');
 const ancestor=spawnSync('git',['merge-base','--is-ancestor',`refs/remotes/origin/${catalogRef}`,'HEAD'],{cwd:root});
 if(ancestor.status!==0)throw Error('当前源码未包含最新正式目录，请先合并，不能覆盖其他版本');
 git(['add','--','integrations/opcb.team-calendar/cloud','plugins/opcb.team-calendar',
  'scripts/build_calendar_release.mjs','scripts/publish_calendar.mjs','scripts/validate_studio_snapshot.py',
  'tests/calendar-cloud-release.test.mjs','.github/workflows/calendar-release.yml',
  'docs/TEAM_CALENDAR_RELEASE_AUTOMATION.md','REGISTRY.json','CANDIDATES.json','SHA256SUMS.txt','releases','README.md','.gitignore']);
 const staged=spawnSync('git',['diff','--cached','--quiet'],{cwd:root});
 if(staged.status===1)git(['-c','commit.gpgsign=false','commit','-m',`release(calendar): ${release.version} and automatic catalog publication\n\n${trailers()}`]);
 else if(staged.status!==0)throw Error('无法检查变更');
 const checkedHead=git(['rev-parse','HEAD']);console.log('Validating publication commit '+checkedHead);
 execFileSync('npm',['test'],{cwd:source,stdio:'inherit'});
 execFileSync('npm',['run','ci'],{cwd:root,stdio:'inherit'});
 if(git(['rev-parse','HEAD'])!==checkedHead||git(['status','--porcelain']))throw Error('验证期间工作树变化，停止发布');
 const actual=git(['rev-parse',`${release.commit}^{tree}`]);
 if(actual!==release.tree)throw Error('独立安装包对象与目录不符');
 git(['push','--atomic','origin',`${checkedHead}:refs/heads/${catalogRef}`,`${release.commit}:refs/heads/${releaseRef}`]);
 console.log(JSON.stringify({published:true,version:release.version,catalogCommit:checkedHead,releaseCommit:release.commit}));
}else{
 throw Error('使用 --prepare 生成版本，随后 --push 完整验证并原子发布');
}
