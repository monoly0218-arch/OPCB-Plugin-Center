import seed from './CONTRIBUTORS.json' with {type:'json'};
import {GITHUB_HEADERS} from './github.mjs';

export const CONTRIBUTIONS=seed;
const repository='monoly0218-arch/OPCB-Plugin-Center';
export function creditPeople(entry, data=seed) {
 const record=data.versions?.[`${entry.id}@${entry.version}`]||data.plugins?.[entry.id]||{};
 const creator=data.people?.[record.creator]||null, seen=new Set(creator?[creator.key]:[]),contributors=[];
 for(const key of record.contributors||[]){const person=data.people?.[key];if(person&&!seen.has(person.key)){seen.add(person.key);contributors.push(person);}}
 return {creator,contributors,evidence:record.evidence||[],count:contributors.length+(creator?1:0)};
}
export function avatarLayout(width,total) {
 const count=Math.max(0,Math.floor(total));
 if(!count)return {visible:0,hidden:0};
 if(count<=4&&36+(count-1)*22<=width)return {visible:count,hidden:0};
 const visible=Math.max(1,Math.min(4,count,Math.floor((Math.max(90,width)-90)/22)+1));
 return {visible,hidden:count-visible};
}
export function pluginsForFiles(files, ids) {
 const known=new Set(ids),found=new Set();
 for(const file of files){
  const match=/^plugins\/([^/]+)\//.exec(file);
  if(match){const id=match[1]==='higgsfield-pool'?'opcb.higgsfield-mailbox':match[1];if(known.has(id))found.add(id);}
  if(file.startsWith('src/plugin-center/'))found.add('opcb.plugin-center');
  if(file.startsWith('src/knowledge/'))found.add(file.startsWith('src/knowledge/admin')?'opcb.knowledge-admin':'opcb.knowledge');
  if(file.startsWith('src/tasks/')){found.add('opcb.task-center');found.add('opcb.company-board');}
 }
 return [...found].filter(id=>known.has(id));
}
export function mergePullContributors(data,pulls,commits=[]) {
 const people={...data.people},plugins=Object.fromEntries(Object.entries(data.plugins).map(([id,row])=>[id,{...row,contributors:[...(row.contributors||[])]}]));
 for(const pull of [...pulls,...commits]){
  if((!(Number.isSafeInteger(pull.number)&&pull.number>0)&&!/^[a-f0-9]{40}$/.test(pull.commit||''))||typeof pull.login!=='string'||!/^[a-z0-9-]{1,39}(?:\[bot\])?$/i.test(pull.login))continue;
  let person=Object.values(people).find(p=>p.github?.toLowerCase()===pull.login.toLowerCase());
  if(!person){const key=`github:${pull.login.toLowerCase()}`;person={key,name:pull.login,github:pull.login,avatar:typeof pull.avatar==='string'&&/^https:\/\/avatars\.githubusercontent\.com\//.test(pull.avatar)?pull.avatar:undefined};people[key]=person;}
  for(const id of pull.plugins||[]){
   const record=plugins[id];if(!record)continue;
   if(!record.contributors.includes(person.key))record.contributors.push(person.key);
  }
 }
 return {...data,people,plugins,pulls,commits};
}
export function createContributionReader(request) {
 const cache=new Map(seed.pulls.map(p=>[p.number,p]));
 const commitCache=new Map();
 return async (entries,alive=()=>true,head='')=>{
  const read=async (suffix,array=true)=>{
   const result=await request({url:`https://api.github.com/repos/${repository}/${suffix}`,method:'GET',timeoutMs:15000,headers:GITHUB_HEADERS});
   if(!alive())throw Error('插件已关闭');
   if(result.status!==200||typeof result.body!=='string'||result.body.length>3000000)throw Error('贡献记录暂未刷新');
   const value=JSON.parse(result.body);if(array?!Array.isArray(value):!value||typeof value!=='object'||Array.isArray(value))throw Error('贡献记录格式无效');return value;
  };
  const pulls=await read('pulls?state=all&per_page=30'),rows=[];
  if(pulls.length===30)throw Error('贡献记录较多，暂显示已核对署名');
  for(const pull of pulls){
   if(!Number.isSafeInteger(pull.number)||pull.number<1||!pull.user?.login||!/^[a-f0-9]{40}$/.test(pull.head?.sha||''))continue;
   const cached=cache.get(pull.number);
   if(cached?.head===pull.head.sha){rows.push({...cached,state:pull.state});continue;}
   const files=[];
   for(let page=1;page<=3;page++){
    const values=await read(`pulls/${pull.number}/files?per_page=100&page=${page}`);
    files.push(...values.map(f=>f.filename).filter(f=>typeof f==='string'));
    if(values.length<100)break;
    if(page===3)throw Error('该PR文件较多，暂显示已核对署名');
   }
   const row={number:pull.number,head:pull.head.sha,login:pull.user.login,avatar:pull.user.avatar_url,url:`https://github.com/${repository}/pull/${pull.number}`,state:pull.state,plugins:pluginsForFiles(files,entries.map(e=>e.id))};
   cache.set(row.number,row);rows.push(row);
  }
  // Preserve older verified records even if no longer in the newest API page.
  if(/^[a-f0-9]{40}$/.test(head)){
   const commits=await read(`commits?sha=${head}&per_page=30`);
   for(const commit of commits){
    if(!commit.author?.login||!/^[a-f0-9]{40}$/.test(commit.sha)||commitCache.has(commit.sha))continue;
    const files=[];
    for(let page=1;page<=3;page++){
     const detail=await read(`commits/${commit.sha}?per_page=100&page=${page}`,false);
     if(!Array.isArray(detail.files))throw Error('贡献提交格式无效');
     files.push(...detail.files.map(f=>f.filename).filter(f=>typeof f==='string'));
     if(detail.files.length<100)break;
     if(page===3)throw Error('该提交文件较多，暂显示已核对署名');
    }
    commitCache.set(commit.sha,{commit:commit.sha,login:commit.author.login,avatar:commit.author.avatar_url,url:`https://github.com/${repository}/commit/${commit.sha}`,plugins:pluginsForFiles(files,entries.map(e=>e.id))});
   }
  }
  const merged=new Map(cache);for(const row of rows)merged.set(row.number,row);
  return mergePullContributors(seed,[...merged.values()],[...commitCache.values()]);
 };
}

export function subscribeContributorProfiles(directory,keys,changed) {
 let active=true,generation=directory.generation?.(),evictions=directory.evictions?.();
 const release=directory.reserve?.(keys.length);
 const ensure=()=>{try{void Promise.resolve(directory.ensure(keys)).catch(()=>{});}catch{}};
 const off=directory.subscribe(()=>{
  if(!active)return;
  const nextGeneration=directory.generation?.(),nextEvictions=directory.evictions?.();
  const invalidated=generation!==nextGeneration||evictions!==nextEvictions;
  generation=nextGeneration;evictions=nextEvictions;
  changed();
  if(invalidated)ensure();
 });
 // Subscribe before reading to catch a profile arriving during the initial read.
 ensure();changed();
 return()=>{active=false;off?.();release?.();};
}
const EMPTY_PROFILES=new Map();
export function useContributorProfiles(React,relay,data) {
 const subscribe=React.useCallback(listener=>relay?.subscribe?.(listener)||(()=>{}),[relay]);
 const snapshot=React.useCallback(()=>relay?.snapshot?.(),[relay]);
 const connection=React.useSyncExternalStore(subscribe,snapshot,snapshot),[,update]=React.useReducer(v=>v+1,0);
 const directory=connection?.session?.profiles;
 const keys=[...new Set(Object.values(data.people).map(p=>p.pubkey).filter(Boolean))].sort().join(',');
 React.useEffect(()=>{
  if(!directory)return;
  return subscribeContributorProfiles(directory,keys?keys.split(','):[],update);
 },[directory,keys]);
 return {profiles:directory?.snapshot?.()||EMPTY_PROFILES,media:connection?.session?.media,sessionKey:`${connection?.scope}:${connection?.generation}`};
}
