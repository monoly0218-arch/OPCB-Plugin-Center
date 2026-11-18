import {registerCalendarAgent} from './agent.mjs';
import {parseTaskCanvas} from '../tasks/live-model.mjs';
import {companyPeople} from '../tasks/company-people.mjs';
import {companyGroups,companyTasks} from '../tasks/company-model.mjs';
import {companyReports,reportedPerson} from '../tasks/company-reports.mjs';
import {readEvents,saveEvents,sourceAccess,TASK_SOURCE} from './model.mjs';
import {createCalendarView} from './view.mjs';
const EMPTY=new Map(),empty=()=>EMPTY,subscribe=()=>()=>{};
export const inject=['react','pages','relay','agents'];
export function apply(ctx){
 registerCalendarAgent(ctx);
 const React=ctx.react,h=React.createElement,View=createCalendarView(React);
 function Workspace({connection}){
  const session=connection.session,list=React.useSyncExternalStore(session.channels.subscribeList,session.channels.list,session.channels.list);
  const profiles=React.useSyncExternalStore(session.profiles?.subscribe||subscribe,session.profiles?.snapshot||empty,empty);
  const statuses=React.useSyncExternalStore(session.statuses?.subscribe||subscribe,session.statuses?.snapshot||empty,empty);
  const [state,setState]=React.useState({loading:true}),[refresh,setRefresh]=React.useState(0);
  const epoch=React.useRef(0);
  const c=list.channels.find(c=>c.id===TASK_SOURCE);let allowed=false;try{sourceAccess(connection);allowed=true;}catch{}
  const check=()=>{const live=ctx.relay.snapshot();if(live.status!=='ready'||live.cached||live.session!==session||live.scope!==connection.scope||live.generation!==connection.generation)throw Error('账号或社区已变化');sourceAccess(connection);};
  const memberKey=allowed?c.members.join('|'):'';
  React.useEffect(()=>{session.channels.ensureList();},[session]);
  React.useEffect(()=>{if(memberKey)void Promise.resolve(session.profiles?.ensure?.(memberKey.split('|'),'background')).catch(()=>{});},[session,memberKey]);
  React.useEffect(()=>memberKey?session.statuses?.watch?.(memberKey.split('|')):undefined,[session,memberKey]);
  React.useEffect(()=>{
   if(!allowed){setState({loading:false,error:'当前账号无权读取日历来源'});return;}
   let disposed=false,pending=false,again=false;
   const read=async()=>{if(disposed)return;if(pending){again=true;return;}pending=true;const started=epoch.current;
    try{check();const event=await session.canvas.read(TASK_SOURCE);check();const data={...parseTaskCanvas(event),events:readEvents(event.content)};if(!disposed&&started===epoch.current)setState({data,loading:false});}
    catch(e){if(!disposed&&started===epoch.current)setState({error:e.message,loading:false});}
    finally{pending=false;if(again){again=false;void read();}}
   };
   void read();const timer=setInterval(()=>{if(globalThis.document?.visibilityState!=='hidden')void read();},30000);
   const off=session.subscribeLive?.(batch=>{if(batch.channelId===TASK_SOURCE||batch.events?.some(e=>e.tags?.some(t=>t[0]==='h'&&t[1]===TASK_SOURCE)))void read();});
   return()=>{disposed=true;clearInterval(timer);off?.();};
  },[session,connection.scope,connection.generation,allowed,refresh]);
  const safe=allowed?state:{loading:false,error:'当前账号无权读取日历来源'};
  const groups=companyGroups(companyTasks(safe.data),'people'),native=companyPeople(groups.map(g=>g.name),allowed?c.members:[],profiles,statuses);
  let reports=[];try{reports=companyReports(safe.data?.content||'');}catch{}
  const people=Object.fromEntries(Object.entries(native).map(([name,p])=>[name,reportedPerson(p,reports)]));
  const onSave=async operation=>{epoch.current++;const event=await saveEvents({connection,check,expected:state.data?.baselineRevision,operation});check();setState({data:{...parseTaskCanvas(event),events:readEvents(event.content)},loading:false});};
  return h(View,{key:allowed&&!state.error?"ready":"unavailable",state:safe,people,media:session.media,reload:()=>setRefresh(v=>v+1),viewer:session.viewer,creator:c?.creator,onSave:allowed&&!c.readOnly&&!c.pending&&session.canvas?.available&&state.data&&!state.error?onSave:undefined});
 }
 function Page(){
  const connection=React.useSyncExternalStore(ctx.relay.subscribe,ctx.relay.snapshot,ctx.relay.snapshot);
  const key=React.useMemo(()=>({}),[connection.session,connection.scope,connection.generation]);const prev=React.useRef(null),seq=React.useRef(0);if(prev.current!==key){prev.current=key;seq.current++;}
  return connection.status==='ready'&&!connection.cached&&connection.session?.viewer?h(Workspace,{connection,key:seq.current}):h('p',{role:'status'},'连接当前社区后查看日历');
 }
 ctx.pages.register({id:'main',title:'日历',icon:OPCB_CALENDAR_ICON,primary:true,placement:'dock',layout:'workspace',component:Page});
}
