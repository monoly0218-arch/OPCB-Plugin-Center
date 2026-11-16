import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runtimeOptions} from './runtime.mjs';
export async function request(action,args={},configPath=runtimeOptions().configPath,viewer) {
  const root=JSON.parse(readFileSync(configPath,'utf8'));
  if(viewer!==undefined&&!/^[0-9a-f]{64}$/.test(viewer))throw new Error('无法确认当前 Buzz 用户，请重新登录');
  const c=viewer===undefined?root:[root,...(root.users||[])].find(c=>c.pubkey===viewer);
  if(!c)throw new Error('当前 Buzz 用户尚未绑定日历连接，请配置本人连接；不会使用其他人的身份');
  const url=new URL(c.url);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new Error('共享服务必须使用 HTTPS');
  const path=action==='read'?'/api/state':action==='operation'?'/api/operations/'+encodeURIComponent(args.requestId):'/api/mutate';
  const response=await fetch(c.url+path,{method:action==='write'?'POST':'GET',headers:{authorization:'Bearer '+c.token,'content-type':'application/json',...(viewer?{'x-calendar-viewer':viewer}:{})},...(action==='write'?{body:JSON.stringify(args)}:{}),signal:AbortSignal.timeout(3500),redirect:'error'});
  const body=await response.json();
  if(!response.ok){const e=new Error(body.error || '日历服务请求失败');e.status=response.status;throw e;}return body;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>256000)throw new Error('请求过大');}const data=JSON.parse(input);console.log(JSON.stringify({ok:true,data:await request(data.action,data.args,undefined,data.viewer)}));}
  catch(error){console.log(JSON.stringify({ok:false,error:error.message,status:error.status}));}
}
