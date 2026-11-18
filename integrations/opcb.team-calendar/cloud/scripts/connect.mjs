import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {connectionUrl,connectionEndpoint} from '../server/connection.mjs';

const prompt=createInterface({input:process.stdin,output:process.stdout});
try{
 const url=connectionUrl((await prompt.question('日历云端服务地址：https://… ')).trim(),{shared:true});
 const pubkey=(await prompt.question('本人 Buzz 公钥（64位十六进制）：')).trim();
 const invite=(await prompt.question('本人一次性邀请码（请勿录屏或转发）：')).trim();
 if(!/^[a-f0-9]{64}$/.test(pubkey)||!/^[a-f0-9]{64}$/.test(invite))throw Error('公钥或邀请格式不正确');
 const path=process.env.CALENDAR_CONFIG||join(homedir(),'.config','opcb-team-calendar','client.json');
 const enrollment=createHash('sha256').update(invite).digest('hex');
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 let config;
 if(existsSync(path)){
  config=JSON.parse(readFileSync(path,'utf8'));
  if(config.url!==url||config.pubkey!==pubkey||config.enrollment!==enrollment)throw Error('此设备已有其他连接，不会覆盖。请保留原配置并联系日历管理员。');
 }else{
  config={url,pubkey,transport:'supabase',token:randomBytes(32).toString('hex'),enrollment};
  writeFileSync(path,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});
 }
 const response=await fetch(connectionEndpoint(config,'/api/bind'),{method:'POST',headers:{authorization:'Bearer '+invite,'content-type':'application/json'},body:JSON.stringify({pubkey,deviceHash:createHash('sha256').update(config.token).digest('hex')}),redirect:'error',signal:AbortSignal.timeout(15000)});
 const body=await response.json();if(!response.ok)throw Error(body.error||'授权未完成，请保留配置，用相同邀请重试');
 writeFileSync(path,JSON.stringify({...config,actor:body.actor,role:body.role},null,2),{mode:0o600});
 console.log('本人设备授权完成。可在插件中心审核安装团队日历；无需启动本机服务。');
}catch(error){console.error(error.message);process.exitCode=1;}finally{prompt.close();}
