import {existsSync,openSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {runtimeOptions} from '../server/runtime.mjs';
import {connectionUrl} from '../server/connection.mjs';
import {openStore} from '../server/store.mjs';

const args=process.argv.slice(2),action=args[0];
function option(name) {const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(name+' 后需要参数');return args[i+1];}
let store;
try {
  if(!['list','issue','revoke'].includes(action))throw new Error('用法：devices.mjs list | issue --id 设备ID --member 成员ID --role editor --url https://域名 --out 私有文件路径 | revoke --id 设备ID');
  const {dir}=runtimeOptions();
  const database=resolve(dir,'calendar.sqlite');
  if(!existsSync(database))throw new Error('日历数据库不存在；请先在本机完成工作区和成员绑定配置');
  store=openStore(database,{});
  if(action==='list')console.log(JSON.stringify({devices:store.listDevices()}));
  if(action==='revoke')console.log(JSON.stringify({revoked:store.revokeDevice(option('--id'))}));
  if(action==='issue') {
    const url=connectionUrl(option('--url')||process.env.CALENDAR_PUBLIC_URL,{shared:true});
    if(!option('--out'))throw new Error('请用 --out 指定本次设备私有连接文件；凭据不会打印到终端');
    const out=resolve(option('--out'));
    // Exclusive creation prevents overwriting another device or the server config.
    const fd=openSync(out,'wx',0o600);let issued;
    try {issued=store.issueDevice({deviceId:option('--id'),memberId:option('--member'),role:option('--role')||'editor'});writeFileSync(fd,JSON.stringify({url,...issued},null,2));}
    catch(error){if(issued)store.revokeDevice(option('--id'));unlinkSync(out);throw error;}
    finally{closeSync(fd);}
    console.log(JSON.stringify({issued:true,deviceId:option('--id'),role:issued.role,file:out}));
  }
}catch(error){console.error(error.message);process.exitCode=1;}finally{store?.close();}
