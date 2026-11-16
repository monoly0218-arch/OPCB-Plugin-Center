import http from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {openStore,CalendarError} from './store.mjs';
import {demoState,emptyState} from './seed.mjs';
import {runtimeOptions,version} from './runtime.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function startServer({port=4176,dir=resolve(root,'.runtime'),demo=true}={}) {
  mkdirSync(dir,{recursive:true});
  const configPath=resolve(dir,'client.json');
  let config;
  if(existsSync(configPath)) config=JSON.parse(readFileSync(configPath,'utf8'));
  else {
    config={url:`http://127.0.0.1:${port}`,token:randomBytes(32).toString('hex'),actor:'local-owner',role:'owner'};
    writeFileSync(configPath,JSON.stringify(config,null,2),{mode:0o600});
  }
  const viewerPath=resolve(dir,'viewer.json');
  const viewer=existsSync(viewerPath)?JSON.parse(readFileSync(viewerPath,'utf8')):{url:config.url,token:randomBytes(32).toString('hex'),actor:'local-viewer',role:'viewer'};
  if(!existsSync(viewerPath))writeFileSync(viewerPath,JSON.stringify(viewer,null,2),{mode:0o600});
  const store=openStore(resolve(dir,'calendar.sqlite'),demo?demoState():emptyState(),[config,...(config.users||[]),viewer]);
  const origin=`http://127.0.0.1:${port}`;
  const allowedHost=`127.0.0.1:${port}`;
  const cookieName=`calendar_session_${port}`;
  const subscribers=new Set();
  const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.headers.host!==allowedHost)throw new CalendarError('无效访问来源',403);
      const u=new URL(req.url,origin);
      if(u.pathname==='/health')return send(res,200,{ok:true,version});
      if(u.pathname.startsWith('/api/')){
        if(req.headers.origin&&req.headers.origin!==origin)throw new CalendarError('不允许跨站请求',403);
        const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
        const token=req.headers.authorization?.replace(/^Bearer /,'') || cookie;
        const principal=store.authorize(token);
        if(req.headers['x-calendar-viewer']&&req.headers['x-calendar-viewer']!==principal.pubkey)throw new CalendarError('登录用户与日历连接不匹配，请为当前账号配置独立连接',403);
        if(req.method==='GET'&&u.pathname==='/api/events'){
          res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','connection':'keep-alive','x-content-type-options':'nosniff'});
          res.write('data: '+JSON.stringify({revision:store.read(principal).revision})+'\n\n');
          subscribers.add(res);
          const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),30000);
          req.on('close',()=>{clearInterval(heartbeat);subscribers.delete(res);});return;
        }
        if(req.method==='GET'&&u.pathname==='/api/state')return send(res,200,store.read(principal));
        if(req.method==='GET'&&u.pathname.startsWith('/api/operations/'))return send(res,200,store.operation(principal,decodeURIComponent(u.pathname.split('/').pop())));
        if(req.method==='POST'&&u.pathname==='/api/mutate'){
          let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>256000)throw new CalendarError('请求内容过大',413);}
          let data;try{data=JSON.parse(body);}catch{throw new CalendarError('JSON 格式不正确');}
          const result=store.mutate(principal,data);
          if(!result.replayed)for(const subscriber of subscribers)subscriber.write('data: '+JSON.stringify({revision:result.revision})+'\n\n');
          return send(res,200,result);
        }
        throw new CalendarError('接口不存在',404);
      }
      if(req.method!=='GET')throw new CalendarError('不支持的请求方法',405);
      const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
      const file=files[u.pathname];if(!file)throw new CalendarError('页面不存在',404);
      const body=readFileSync(resolve(root,'preview',file));
      const headers={'content-type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"};
      if(file==='index.html')headers['set-cookie']=`${cookieName}=${config.token}; HttpOnly; SameSite=Strict; Path=/`;
      res.writeHead(200,headers);res.end(body);
    }catch(error){send(res,error instanceof CalendarError?error.status:500,{error:error instanceof CalendarError?error.message:'服务暂时不可用，请保留草稿后重试'});}
  });
  server.listen(port,'127.0.0.1');
  const close=()=>new Promise(r=>{for(const subscriber of subscribers)subscriber.end();server.close(()=>{store.close();r();});server.closeIdleConnections();});
  return {server,store,config,viewer,close};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const options=runtimeOptions();
  const app=startServer({...options,demo:process.argv.includes('--empty')?false:options.demo});
  app.server.on('listening',()=>console.log(`Team calendar ${version} (${options.profile}) ready: http://127.0.0.1:${options.port}`));
  for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>app.close().then(()=>process.exit(0)));
}
