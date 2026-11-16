import {createCalendarApp} from './Calendar.jsx';
import {toolDefinitions} from './tools.mjs';
import styles from './calendar.css';
export const inject=['react','pages','agents','host','relay'];
export function apply(ctx){
  let alive=true;
  const subscribers=new Set();
  const notify=()=>{for(const fn of subscribers)fn();};
  ctx.effect(()=>()=>{alive=false;});
  ctx.effect(()=>{
    if(!ctx.host.spawn)return;
    let disposed=false,process,buffer='';
    ctx.host.spawn('calendar-events',{onStdout:chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{if(JSON.parse(line).revision!==undefined)notify();}catch{}}if(buffer.length>8192)buffer='';}}).then(p=>{if(disposed)p.kill();else process=p;}).catch(()=>{});
    return()=>{disposed=true;process?.kill();subscribers.clear();};
  });
  async function call(action,args={}){
    if(!alive)throw new Error('日历插件已停止');
    const viewer=ctx.relay.snapshot().viewer;
    if(!/^[0-9a-f]{64}$/.test(viewer||''))throw new Error('请先登录 Buzz，再打开日历');
    const input=JSON.stringify({action,args,viewer});
    if(new TextEncoder().encode(input).length>65536)throw new Error('本次内容过多，请分批导入');
    const raw=await ctx.host.runCommand('calendar-client',input);
    if(!alive)throw new Error('日历插件已停止');
    if(ctx.relay.snapshot().viewer!==viewer)throw new Error('登录用户已切换，请重新读取安排；如有保存操作请先核对回执');
    if(!raw)throw new Error('无法连接日历服务，请确认服务已启动；若刚才正在保存，请先查询操作回执');
    const result=JSON.parse(raw);
    if(!result.ok){const error=new Error(result.error || '日历服务请求失败');error.status=result.status;throw error;}
    if(action==='write')notify();
    return result.data;
  }
  const App=createCalendarApp(ctx.react,{read:()=>call('read'),write:payload=>call('write',payload),operation:id=>call('operation',{requestId:id}),subscribe:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);}},{styles});
  function Page(){
    const connection=ctx.react.useSyncExternalStore(ctx.relay.subscribe,ctx.relay.snapshot,ctx.relay.snapshot);
    return ctx.react.createElement(App,{key:`${connection.scope||connection.viewer||'signed-out'}:${connection.viewer||''}:${connection.generation}`});
  }
  ctx.pages.register({id:'main',title:'团队日历',primary:true,layout:'workspace',component:Page});
  for(const definition of toolDefinitions)ctx.agents.addTool({...definition,async call(client,context,args){
    if(context.channel!=='b7491401-2c3f-4d20-8295-e5cda3c19661')throw new Error('日历工具仅授权当前“设计团队日历插件”会话');
    if(client.key!=='936956c409fe0cc10f18ab8363b479b1f9c1bb6a9c6d8f0595f1b42cfce07003')throw new Error('该 Agent 尚未获得此日历连接的授权');
    const action=definition.name==='team_calendar_read'?'read':definition.name==='team_calendar_operation'?'operation':'write';
    return JSON.stringify(await call(action,args));
  }});
}
