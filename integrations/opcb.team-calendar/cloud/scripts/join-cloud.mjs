import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root} from '../server/runtime.mjs';
import {connectionUrl,connectionEndpoint} from '../server/connection.mjs';
import {hash} from '../server/state.mjs';
const args=process.argv.slice(2);
function option(name){const i=args.indexOf(name);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw new Error(name+' 参数缺失');return args[i+1];}
try {
  const invite=option('--invite'),pubkey=option('--pubkey'),url=connectionUrl(option('--url'),{shared:true});
  if(!/^[a-f0-9]{64}$/.test(invite)||!/^[a-f0-9]{64}$/.test(pubkey))throw new Error('邀请或用户公钥格式不正确');
  const out=resolve(root,'.runtime/shared/client.json');mkdirSync(dirname(out),{recursive:true,mode:0o700});
  let config;
  if(existsSync(out)) {
    config=JSON.parse(readFileSync(out,'utf8'));
    if(config.enrollment!==hash(invite)||config.pubkey!==pubkey||config.url!==url)throw new Error('此安装目录已有另一份连接，请使用独立插件目录；不会覆盖原凭据');
  }else {
    config={url,transport:'supabase',pubkey,token:randomBytes(32).toString('hex'),enrollment:hash(invite)};
    // Persist before redemption so an interrupted response can retry the same device.
    writeFileSync(out,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});
  }
  const response=await fetch(connectionEndpoint(config,'/api/bind'),{method:'POST',headers:{authorization:'Bearer '+invite,'content-type':'application/json'},body:JSON.stringify({pubkey,deviceHash:hash(config.token)}),redirect:'error',signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'绑定失败，请保留此安装目录并使用相同邀请重试');
  config={...config,actor:data.actor,role:data.role};writeFileSync(out,JSON.stringify(config,null,2),{mode:0o600});
  execFileSync(process.execPath,[resolve(root,'scripts/setup.mjs'),'--workspace','--config',out],{stdio:'inherit'});
  console.log('本人设备已授权。请在 Buzz 插件设置中浏览本目录的 plugin 文件夹安装；无需启动本机日历服务。');
}catch(error){console.error(error.message);process.exitCode=1;}
