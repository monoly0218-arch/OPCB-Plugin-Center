const key = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const COLLECTION = {name:'mobile-design-workspace',type:'opcb.mobile-design.workspace',version:1,project:()=>[]};
export const PREFERENCE = 'execution-binding';
export const MAPPINGS = Object.freeze([
  {reference:'社交动态',target:'首页',page:'home'},
  {reference:'对话与状态',target:'OPCB Agent 聊天',page:'agent_chat'},
  {reference:'人物发现',target:'上传图片与执行制作',page:'ready'},
  {reference:'个人主页',target:'下载与发布',page:'detail'},
  {reference:'直播页面／路线结果',target:'填写邀请码',page:'invite'},
]);
export function canRead(channel,viewer){return !!viewer&&!!channel&&!channel.archived&&!channel.cached&&!channel.pending&&!channel.metadataPending&&!channel.metadataCached&&Array.isArray(channel.members)&&channel.members.includes(viewer);}
export function canBind(channel,viewer){return canRead(channel,viewer)&&!channel.readOnly;}
export function validateBinding(value,viewer){
  if(value==null)return null;
  if(value.schema!==1||value.owner!==viewer||!Number.isInteger(value.revision)||value.revision<1||typeof value.channel!=='string'||!value.channel||typeof value.label!=='string'||value.label.length>100||value.source&&(!key(value.source.message)||typeof value.source.url!=='string'||!isHtml(value.source)))throw Error('执行会话记录无效，请重新绑定');
  return value;
}
export function isHtml(file){return typeof file?.url==='string'&&/^https:\/\//.test(file.url)&&(/\.html?(?:[?#]|$)/i.test(file.url)||/\.html?$/i.test(file.name||'')||/^text\/html(?:;|$)/i.test(file.mime||''));}
export function chooseSource(row,url){
  const candidates=(row.attachments||[]).filter(isHtml);
  for(const match of String(row.content||'').matchAll(/https:\/\/[^\s<>"'()]+\.html?(?:\?[^\s<>"'()]*)?/g)){if(!candidates.some(c=>c.url===match[0]))candidates.push({url:match[0],name:'设计计划与成果.html',mime:'text/html'});}
  const found=url?candidates.find(f=>f.url===url):candidates.length===1?candidates[0]:null;
  if(!found)throw Error('请指定当前会话原消息中的HTML附件');
  if(found.size&&found.size>50*1024*1024)throw Error('HTML附件超过50MB');
  const parsed=new URL(found.url);if(parsed.username||parsed.password)throw Error('附件URL不可包含凭据');
  return {message:row.id,url:found.url,name:found.name||'设计计划与成果.html',mime:found.mime||'text/html'};
}
export async function exactMessage(session,client,channel,id,check){
  if(!key(id)||typeof client.effectiveEdit!=='function'||typeof session.thread!=='function')throw Error('需要原始消息及宿主读取能力');
  check();await client.effectiveEdit(id,channel);check();
  const thread=session.thread(channel,id,{exact:true});
  try{await thread.refresh();check();const s=thread.snapshot(),row=s.target;if(s.targetStatus!=='ready'||row?.id!==id||row.channelId!==channel||row.edited||row.delivery&&!['accepted','seen'].includes(row.delivery))throw Error('原消息已变化或无权读取');return row;}finally{thread.dispose();}
}
export function agentContext(ctx,client,context){
  const relay=ctx.agents.relay(client.key),connection=relay?.snapshot(),owner=ctx.relay.snapshot();
  const check=()=>{
    client.signal?.throwIfAborted();const now=relay?.snapshot(),human=ctx.relay.snapshot();
    if(!client.signal||connection?.status!=='ready'||connection.cached||owner.status!=='ready'||owner.cached||now?.session!==connection.session||now.scope!==connection.scope||now.generation!==connection.generation||human.session!==owner.session||human.generation!==owner.generation||human.scope!==connection.scope||human.session.viewer!==client.owner||connection.session.viewer!==client.owner)throw Error('当前身份或社区已变化');
    for(const session of [connection.session,human.session]){const list=session.channels.list(),channel=list.channels.find(c=>c.id===context.channel);if(list.status!=='ready'||!canBind(channel,client.owner)||!channel.members.includes(client.pubkey))throw Error('只能绑定本人和本Agent均可访问的当前执行会话');}
  };check();return {connection,check};
}
export async function bindFromAgent(ctx,client,context,args){
  const {connection,check}=agentContext(ctx,client,context);const request=await exactMessage(connection.session,client,context.channel,args.request_id,check);
  if(request.authorId!==client.owner||!/绑定|执行会话/.test(request.content||''))throw Error('绑定需本人明确要求执行会话的原始指令');
  const row=await exactMessage(connection.session,client,context.channel,args.source_message_id,check);
  if(![client.owner,client.pubkey].includes(row.authorId))throw Error('HTML需来自本人或当前执行Agent');
  const source=chooseSource(row,args.attachment_url);check();
  const collection=ctx.artifactStorage.open(COLLECTION);
  try{
    const old=validateBinding(await collection.preferences.get(PREFERENCE),client.owner);check();
    if(old?.request===args.request_id&&old.channel===context.channel&&old.source?.message===source.message&&old.source.url===source.url)return old;
    if((old?.revision||0)!==args.expected_revision)throw Error('绑定轮次已变化，请重新读取');
    const binding={schema:1,revision:args.expected_revision+1,owner:client.owner,channel:context.channel,label:args.label||'执行会话',source,request:args.request_id};
    if(binding.label.length>100)throw Error('会话名称过长');
    await collection.preferences.update(PREFERENCE,current=>{check();if((current?.revision||0)!==args.expected_revision)throw Error('绑定已被其他操作修改');return binding;});check();
    const saved=validateBinding(await collection.preferences.get(PREFERENCE),client.owner);check();
    if(saved?.revision!==binding.revision||saved.channel!==binding.channel||saved.source?.message!==binding.source.message)throw Error('绑定保存未确认，请回读状态');
    return saved;
  }finally{collection.close();}
}
export async function readAttachment(connection,binding,check){
  check();const source=binding?.source;if(!source)throw Error('尚未关联HTML成果');
  const thread=connection.session.thread(binding.channel,source.message,{exact:true});
  try{await thread.refresh();check();const s=thread.snapshot(),row=s.target;if(s.targetStatus!=='ready'||row?.id!==source.message||row.channelId!==binding.channel||row.edited)throw Error('HTML来源已变化或无权读取');chooseSource(row,source.url);return connection.session.media(source.url);}finally{thread.dispose();}
}
