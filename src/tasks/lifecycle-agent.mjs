import {appendFlow,flowRecords,isKey,saveFlow,validDelivery} from './lifecycle.mjs';
import {parseTaskCanvas,TASK_SOURCE} from './live-model.mjs';
import {canExecuteInChannel} from './execution-channels.mjs';

export const TASK_AGENT_RULES='任务中心：在本人授权关联的执行会话内，用户明确要求执行才建立/关联任务；从任务页或任务专属Solo接收指令时先用opcb_task_center_task读取当前任务；关闭任务页后仍可用同一task_id调用opcb_task_flow读取；用opcb_task_flow读取任务及revision。使用同一task_id持续更新，不每轮重复建任务。明确指令后用create；同一指令收集多项时，每项使用稳定且不同的item_key，重试保留原key；date:null保持待安排，不自动start；实际开工调用start，受阻调用blocked；交付当前轮次后调用deliver，交付消息需包含task_id及独立一行revision: 数字；提供真实交付消息ID、版本与简短结果，工具核对来源后才进入待验收。修改先revise增加轮次，再实际开工；改期reschedule。仅使用本人明确关联且双方可读的原执行会话；工具不能扩大权限。每次写回使用expected_revision和原本人request_id；不可伪造开工、消息、链接或本人通过。验收只可代记可核对的本人明确结论；含糊通过须请本人点当前版本勾选。每次外部提交前复读该任务，removed即停止新操作；移除后停止后续执行，迟到结果不恢复任务，不宣称已取消供应商或退款。原Canvas同源，写回失败先刷新核对，不重复生成/付费。误删可read include_removed:true查原ID并restore；不得根据历史讨论、排期到点、泛泛收到自动执行；人类无需填状态/链接表单。';

// Fresh native exact-message reads, with admission as the calling Agent as well
// as the owner. Never search another identity or accept an arbitrary quoted ID.
export async function exactFlowMessage(session,client,channel,id,check){
 if(!isKey(id)||typeof client.effectiveEdit!=='function'||typeof session.thread!=='function')throw Error('需有效原消息及原生消息核对能力');
 check();await client.effectiveEdit(id,channel);check();
 const view=session.thread(channel,id,{exact:true});
 try{
  await view.refresh();check();const state=view.snapshot(),row=state.target;
  if(state.targetStatus!=='ready'||!row||row.id!==id||row.channelId!==channel||row.edited||row.delivery&&!['accepted','seen'].includes(row.delivery))throw Error('原消息已变化、删除或不可读，请核对');
  return row;
 }finally{view.dispose();}
}
const messageURL=(channel,id)=>`buzz://message?channel=${encodeURIComponent(channel)}&id=${id}`;
export async function recordAgentFlow({ctx,client,context,args}){
 const relay=ctx.agents.relay(client.key),connection=relay?.snapshot(),owner=ctx.relay.snapshot();
 const channelId=context.channel;
 const authorize=()=>{
  client.signal?.throwIfAborted();const now=relay?.snapshot(),current=ctx.relay.snapshot();
  if(!client.signal||connection?.status!=='ready'||connection.cached||now?.session!==connection.session||now?.scope!==connection.scope||now?.generation!==connection.generation||current.status!=='ready'||current.cached||current.generation!==owner.generation||current.session!==owner.session||current.scope!==connection.scope||current.session?.viewer!==client.owner||connection.session.viewer!==client.owner)throw Error('当前Agent或本人身份已变化');
  for(const session of [connection.session,current.session]){
   const list=session.channels.list(),route=list.channels.find(c=>c.id===channelId),source=list.channels.find(c=>c.id===TASK_SOURCE);
   if(list.status!=='ready'||!canExecuteInChannel(route,client.owner)||!route.members?.includes(client.pubkey)||!source||source.cached||source.pending||source.metadataPending||source.metadataCached||source.archived||source.readOnly||!source.members?.includes(client.owner)||!source.members?.includes(client.pubkey))throw Error('执行会话或任务来源权限不足');
   const privateSolo=route.channelType==='solo'&&route.private===true&&route.members.length===2;
   if(!privateSolo&&!args.task_id&&!ctx.taskFlowLinked?.(channelId))throw Error('请先从任务中心明确关联本执行频道');
  }
 };
 authorize();const session=connection.session;
 const head=await session.canvas.read(TASK_SOURCE);authorize();const data=parseTaskCanvas(head);
 const task=args.task_id?data.tasks.find(t=>t.id===args.task_id):null;
 // A saved task route remains usable after closing its page; mere knowledge of
 // its ID does not authorize a different channel.
 if((task?.executionBinding||task?.executionChannel)&&task.executionChannel!==channelId)throw Error('请在该任务原执行会话操作');
 const route=session.channels.list().channels.find(c=>c.id===channelId);
 const privateSolo=route.channelType==='solo'&&route.private===true&&route.members.length===2;
 if(!privateSolo&&!ctx.taskFlowLinked?.(channelId)&&task?.executionChannel!==channelId)throw Error('请先在页面关联当前执行会话');
 if(args.action==='read'||!args.action)return {baselineRevision:head.id,tasks:task?[task]:data.tasks.filter(t=>args.include_removed||!t.removed),source:data.source};
 if(!['create','start','revise','deliver','blocked','reschedule','accept','complete','reopen','remove','restore'].includes(args.action))throw Error('不支持的任务操作');
 const request=await exactFlowMessage(session,client,channelId,args.request_id,authorize);
 if(request.authorId!==client.owner)throw Error('任务变更需本人原始指令，不接受Agent代发授权');
 if(args.item_key!==undefined&&(args.action!=='create'||args.task_id||typeof args.item_key!=='string'||!/^[-a-z0-9_]{1,64}$/.test(args.item_key)))throw Error('item_key仅用于新建任务，需1到64位小写字母、数字、下划线或短横线');
 const source=messageURL(channelId,request.id),id=task?.id||`task-${channelId}-${request.id}${args.item_key?':'+args.item_key:''}`;
 if(args.action!=='create'&&!task)throw Error('请先读取有效任务ID');
 if(!Number.isInteger(args.expected_revision)||args.expected_revision<0)throw Error('需先读取当前revision');
 let p={summary:args.summary||'',source,channel:channelId};
 let evidenceId=request.id;
 if(args.action==='create'){
  const reviewer=client.owner;
  p={...p,title:args.title,description:args.summary||'',goal:args.goal||'',assignee:args.assignee||'本人 Agent',team:args.team||'OPCB 团队',project:args.project||'个人任务',date:args.date||null,executionKind:args.execution_kind||'agent',executor:args.execution_kind==='human'?'':client.pubkey,reviewer};
 }else if(args.action==='deliver'){
  const row=await exactFlowMessage(session,client,channelId,args.evidence_id,authorize);
  if(row.authorId!==client.pubkey||task.executor&&task.executor!==client.pubkey)throw Error('交付需来自指定执行Agent的实际消息');
  const body=row.sourceContent||row.content||'';
  if(!body.includes(id)||!new RegExp(`(?:^|\\n)revision:\\s*${args.expected_revision}(?:\\s|$)`).test(body))throw Error('交付消息需明确包含task_id与当前revision，不能挂入旧轮次结果');
  if(!row.attachments?.length&&!/https:\/\/[^\s<>]+/.test(body))throw Error('交付消息尚无实际附件或结果链接');
  if(args.url){validDelivery(args.url);if(!body.includes(args.url)&&!row.attachments?.some(a=>a.url===args.url))throw Error('交付链接不在原消息中');}
  evidenceId=row.id;p={...p,url:args.url||messageURL(channelId,row.id),version:args.version,summary:args.summary,evidence:messageURL(channelId,row.id),messageAt:row.createdAt};
 }else if(args.action==='reschedule')p={...p,date:args.date??null,...(args.times!==undefined?{times:args.times}:{})};
 else if(['accept','complete'].includes(args.action)){
  const text=request.sourceContent||request.content||'';
  if(!/(通过了|验收通过|确认完成|已完成|做完了|完成了)/.test(text)||/(没|未|不|尚未)(?:有)?(?:通过|完成)|不算|别.*(?:通过|完成)|[?？]|是否|能否|如果|假如|例如|比如|引用/.test(text))throw Error('未核对到本人明确完成结论，请在任务行勾选确认');
  const reviewer=task.reviewer||session.channels.list().channels.find(c=>c.id===TASK_SOURCE).creator;
  if(client.owner!==reviewer)throw Error('仅指定验收人可确认完成');
  if(args.action==='accept'){
   const delivery=task.delivery;
   const uniqueVersion=delivery&&text.includes(delivery.version)&&data.tasks.filter(t=>!t.removed&&t.status==='review'&&t.executionChannel===channelId&&t.delivery?.version===delivery.version).length===1;
   if(!delivery||(!text.includes(id)&&!uniqueVersion&&request.replyParentId!==new URL(delivery.evidence).searchParams.get('id')))throw Error('通过结论未明确对应当前版本，请勾选该版本确认');
   if(request.createdAt<(delivery.messageAt||0)||request.createdAt*1000<Date.parse(task.lastRevisionAt||'1970-01-01'))throw Error('旧确认不能验收新一轮');
   p={...p,version:delivery.version,delivery:delivery.url};
  }else if(!text.includes(id))throw Error('完成结论需明确任务，请在任务行直接勾选');
 }
 if(['start','deliver','blocked'].includes(args.action)&&task?.executor&&task.executor!==client.pubkey)throw Error('当前Agent不是此任务执行人');
 const human=['accept','complete'].includes(args.action);
 const event={event_id:`${evidenceId}:${args.action}:${id}:${args.expected_revision}`,task_id:id,action:args.action,revision:args.expected_revision,actor:human?client.owner:client.pubkey,at:new Date().toISOString(),payload:p};
 const duplicate=flowRecords(data.content).find(e=>e.event_id===event.event_id);
 // A retry with the original revision returns the previously accepted event.
 if(duplicate){appendFlow(data,event);return {duplicate:true,task:data.tasks.find(t=>t.id===id),event:duplicate};}
 const saved=await saveFlow({session,check:authorize,data,events:[event]});authorize();
 const updated=parseTaskCanvas(saved);ctx.taskFlowUpdated?.(updated);
 return {baselineRevision:saved.id,task:updated.tasks.find(t=>t.id===id),event};
}
export function registerTaskFlow(ctx){
 ctx.agents.addInstructions({id:'task-lifecycle',text:TASK_AGENT_RULES});
 ctx.agents.addTool({name:'opcb_task_flow',description:'读取/建立同源任务，并在实际开工、修改、交付时自动写状态。每次变更需本人request_id和expected_revision，交付需执行Agent真实消息evidence_id、版本。保留轮次、验收人和事件；不执行生成或发消息。',inputSchema:{type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['read','create','start','revise','deliver','blocked','reschedule','accept','complete','reopen','remove','restore']},task_id:{type:'string'},item_key:{type:'string',pattern:'^[-a-z0-9_]{1,64}$',maxLength:64,description:'同一本人指令建立多条时的稳定事项键；重试不换key；仅create且不传task_id'},include_removed:{type:'boolean'},expected_revision:{type:'integer',minimum:0},request_id:{type:'string'},evidence_id:{type:'string'},title:{type:'string'},summary:{type:'string'},goal:{type:'string'},assignee:{type:'string'},team:{type:'string'},project:{type:'string'},date:{type:['string','null']},times:{type:'array',items:{type:'string'}},execution_kind:{type:'string',enum:['agent','human']},version:{type:'string'},url:{type:'string'}}},async call(client,context,args){return JSON.stringify(await recordAgentFlow({ctx,client,context,args}));}});
}
