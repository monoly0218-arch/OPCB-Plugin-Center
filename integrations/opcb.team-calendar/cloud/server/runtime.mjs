import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const version=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version;

// Every entry point resolves the same workspace; existing databases stay intact.
export function runtimeOptions({args=process.argv.slice(2),env=process.env,base=root}={}) {
  if(args.includes('--workspace')&&args.includes('--demo'))throw new Error('请选择工作区或示例模式，不能同时启用');
  const profile=args.includes('--demo')?'demo':args.includes('--workspace')?'workspace':env.CALENDAR_PROFILE||'workspace';
  if(!['workspace','demo'].includes(profile))throw new Error('CALENDAR_PROFILE 只能是 workspace 或 demo');
  const port=Number(env.CALENDAR_PORT||(profile==='demo'?4176:4177));
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('CALENDAR_PORT 必须是 1–65535 的整数');
  // Keep the existing 1.0.2 demo; the working calendar has its own directory.
  const dir=resolve(env.CALENDAR_DATA_DIR||resolve(base,'.runtime',...(profile==='workspace'?['workspace']:[])));
  const configIndex=args.indexOf('--config');
  if(configIndex!==-1&&(!args[configIndex+1]||args[configIndex+1].startsWith('--')))throw new Error('--config 后需要配置文件路径');
  const host=env.CALENDAR_HOST||'127.0.0.1';
  const publicUrl=env.CALENDAR_PUBLIC_URL||undefined;
  if(!['127.0.0.1','0.0.0.0'].includes(host))throw new Error('CALENDAR_HOST 只能是 127.0.0.1 或 0.0.0.0');
  if(host!=='127.0.0.1'&&!publicUrl)throw new Error('非本机监听必须配置 CALENDAR_PUBLIC_URL 和 HTTPS 反向代理');
  if(publicUrl&&profile==='demo')throw new Error('共享服务不能使用示例模式');
  return {profile,port,dir,demo:profile==='demo',host,publicUrl,configPath:resolve(configIndex!==-1?args[configIndex+1]:env.CALENDAR_CONFIG||resolve(dir,'client.json'))};
}
