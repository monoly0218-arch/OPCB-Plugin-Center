import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

export function readConnection(configPath) {
  const local=JSON.parse(readFileSync(configPath,'utf8'));
  if(!local.sharedConfig)return local;
  const shared=JSON.parse(readFileSync(resolve(dirname(configPath),local.sharedConfig),'utf8'));
  if(shared.transport!=='supabase')throw new Error('共享连接配置不正确；不会退回本机库');
  return shared;
}
// Credentials always go to this exact origin; redirects are rejected by callers.
export function connectionUrl(value,{shared=false}={}) {
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('日历服务地址只能包含协议、域名和端口');
  if(url.protocol!=='https:'&&(shared||url.protocol!=='http:'||url.hostname!=='127.0.0.1'))throw new Error('共享服务必须使用 HTTPS');
  return url.origin;
}
export function connectionEndpoint(config,path) {
  if(config.transport!==undefined&&config.transport!=='supabase')throw new Error('不支持的日历连接类型');
  return connectionUrl(config.url)+(config.transport==='supabase'?'/functions/v1/opcb-team-calendar':'')+path;
}
