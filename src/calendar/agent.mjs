import {exactFlowMessage} from '../tasks/lifecycle-agent.mjs';
import {readEvents,saveEvents,sourceAccess,TASK_SOURCE} from './model.mjs';
export function registerCalendarAgent(ctx){
 ctx.agents.addTool({name:'opcb_calendar',description:'读取或登记五类共享日程。写入需本人原指令、最新来源版本；仅登记人或来源管理员可改删，不改普通任务与请假审批。',inputSchema:{type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['read','add','update','remove']},request_id:{type:'string'},expected_revision:{type:'string'},id:{type:'string'},event:{type:'object',additionalProperties:false,properties:{type:{type:'string',enum:['leave','trip','online','offline','milestone']},title:{type:'string'},date:{type:'string'},endDate:{type:'string'},allDay:{type:'boolean'},time:{type:'string'},endTime:{type:'string'},participants:{type:'array',items:{type:'string'}},location:{type:'string'},note:{type:'string'}}}}},async call(client,context,args){
  const relay=ctx.agents.relay(client.key),connection=relay?.snapshot(),owner=ctx.relay.snapshot();
  const check=()=>{
   client.signal?.throwIfAborted();const live=relay?.snapshot(),current=ctx.relay.snapshot();
   if(!client.signal||connection?.status!=='ready'||connection.cached||live?.session!==connection.session||live?.scope!==connection.scope||live?.generation!==connection.generation||current.status!=='ready'||current.cached||current.session!==owner.session||current.scope!==connection.scope||current.generation!==owner.generation||current.session?.viewer!==client.owner||connection.session?.viewer!==client.owner)throw Error('本人或Agent身份已变化');
   for(const conn of [connection,current]){const source=sourceAccess(conn),list=conn.session.channels.list(),route=list.channels.find(c=>c.id===context.channel);if(!source.members?.includes(client.pubkey)||!route||route.archived||route.cached||route.pending||route.metadataCached||route.metadataPending||!route.members?.includes(client.owner)||!route.members?.includes(client.pubkey))throw Error('日程来源或原会话权限不足');}
  };
  check();const session=connection.session,head=await session.canvas.read(TASK_SOURCE);check();const events=readEvents(head.content);
  if(!args.action||args.action==='read')return JSON.stringify({baselineRevision:head.id,source:'buzz://channel/'+TASK_SOURCE,events});
  if(!['add','update','remove'].includes(args.action)||args.expected_revision!==head.id)throw Error('请先读取当前日历版本');
  const request=await exactFlowMessage(session,client,context.channel,args.request_id,check);if(request.authorId!==client.owner)throw Error('需本人原始日程指令');
  const id=args.action==='add'?request.id:args.id;
  if(args.action==='add'&&events.some(e=>e.id===id))return JSON.stringify({baselineRevision:head.id,duplicate:true});
  const event={...args.event,id,participants:args.event?.participants||[],endDate:args.event?.endDate||args.event?.date,allDay:args.event?.allDay??true};
  const saved=await saveEvents({connection,check,expected:head.id,operation:{action:args.action,event,id}});return JSON.stringify({baselineRevision:saved.id,events:readEvents(saved.content)});
 }});
}
