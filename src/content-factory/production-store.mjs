import {loadReferenceVideo} from './reference-video.mjs';
import {readLibrary,libraryContent,renameLibraryEntry} from './material-library.mjs';
import {canExecuteInChannel,openExecutionSolo,readExecutionPreference} from '../media-workspace/execution.mjs';
import {readProduction,productionContent,newProduction,changeProduction,attachment} from './production-model.mjs';

export function productionAccess(connection,id){
 const s=connection?.session,list=s?.channels.list(),c=list?.channels.find(c=>c.id===id);
 return connection?.status==='ready'&&!connection.cached&&list?.status==='ready'&&canExecuteInChannel(c,s.viewer)&&c.channelType==='solo'&&c.private===true&&c.creator===s.viewer?c:null;
}
export function createProductionStore(ctx,{storage=globalThis.localStorage,readReference=card=>loadReferenceVideo(ctx,card)}={}){
 let refreshPromise,uploading=false;
 let connection,disposed=false,generation=0,active='',records={},error='',pending=false,loading=false,unsub=()=>{},inflight;
 const listeners=new Set();let state={records,active,error,pending,loading,unfiled:[],library:null};
 const emit=patch=>{if(!disposed){state={...state,...patch};listeners.forEach(fn=>fn());}};
 const check=(c=connection,epoch=generation)=>{const now=ctx.relay.snapshot();if(disposed||generation!==epoch||now.status!=='ready'||now.cached||now.session!==c?.session||now.scope!==c.scope||now.generation!==c.generation)throw Error('账号或社区已变化，请重新打开制作页');return now;};
 const key=card=>`opcb.factory.production-route.v1:${connection.scope}:${connection.session.viewer}:${card}`;
 const read=async(id,c=connection,epoch=generation)=>{
  check(c,epoch);if(!productionAccess(c,id))throw Error('原执行Solo不可访问，未读取资料');
  const head=await c.session.canvas.read(id);check(c,epoch);if(!productionAccess(check(c,epoch),id))throw Error('执行Solo权限已变化');
  const doc=readProduction(head);if(doc&&doc.owner!==c.session.viewer)throw Error('制作资料所属人不一致');
  const library=readLibrary(head);if(library&&library.owner!==c.session.viewer)throw Error('图库所属人不一致');
  return {channel:id,headId:head?.id||null,doc,library};
 };
 const refreshOnce=async()=>{
  if(disposed||!connection||loading)return;const c=connection,epoch=generation;loading=true;emit({loading:true});
  const roster=c.session.channels.list();if(roster.status!=='ready'){loading=false;emit({records:{},loading:false,error:'会话目录仍在加载'});return;}
  const candidates=roster.channels.filter(x=>productionAccess(c,x.id));const next={},ambiguous=new Set(),libraries=[];let failures=0;
  const queue=[...candidates];
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){const item=queue.shift();try{const value=await read(item.id,c,epoch);if(value.library)libraries.push({channel:item.id,headId:value.headId,doc:value.library});if(value.doc){if(next[value.doc.cardId]||ambiguous.has(value.doc.cardId)){ambiguous.add(value.doc.cardId);delete next[value.doc.cardId];throw Error('同一素材有多个执行Solo');}next[value.doc.cardId]=value;}}catch(e){if(generation!==epoch||disposed)return;failures++;}}}));
  if(generation===epoch&&!disposed){records=next;emit({records,library:libraries.length===1?libraries[0]:null,error:libraries.length>1?'存在多个角色／产品库，请核对原会话':failures?`${failures}份会话资料暂未核验；相关条目不自动重建`:''});}
  if(generation===epoch){loading=false;emit({loading:false});}
 };
 const refresh=()=>{if(refreshPromise)return refreshPromise;const epoch=generation,operation=refreshOnce().finally(()=>{if(epoch===generation&&refreshPromise===operation)refreshPromise=undefined;});refreshPromise=operation;return operation;};
 const save=async(record,next,c=connection,epoch=generation)=>{
  check(c,epoch);if(!productionAccess(c,record.channel))throw Error('当前身份不可保存制作记录');
  const head=await c.session.canvas.read(record.channel);check(c,epoch);
  if((head?.id||null)!==record.headId)throw Error('制作资料已有更新，请刷新后重试');
  if(!productionAccess(check(c,epoch),record.channel))throw Error('执行Solo权限已变化，未保存');
  const content=productionContent(head?.content,next);
  const saved=await c.session.canvas.save(record.channel,content,head?.id,{preserveApproval:true});check(c,epoch);
  if(!saved?.id||saved.content!==content)throw Error('保存结果尚未确认，请刷新核对，勿重复提交');
  const observed=await read(record.channel,c,epoch);
  if(observed.headId!==saved.id||observed.doc?.revision!==next.revision)throw Error('保存后的版本尚未确认，请刷新核对');
  records={...records,[next.cardId]:observed};emit({records});return observed;
 };
 async function mutation(cardId,action,args,actor){
  if(pending)throw Error('上一项制作操作尚未完成');
  const c=check(),epoch=generation,record=records[cardId];if(!record)throw Error('先打开素材的执行Solo');
  pending=true;emit({pending:true,error:''});
  try{const latest=await read(record.channel,c,epoch);if(!latest.doc||latest.doc.cardId!==cardId)throw Error('素材绑定已变化');const next=changeProduction(latest.doc,action,args,actor||{owner:c.session.viewer,pubkey:c.session.viewer});return await save(latest,next,c,epoch);}
  catch(e){if(epoch===generation)emit({error:e.message});throw e;}finally{if(epoch===generation){pending=false;emit({pending:false});}}
 }

 // The host already partitions its journal by community and viewer. Its
 // recovery keys are limited to 200 characters, unlike our local storage keys.
 const nativeKey = dispatch => `opcb.factory.dispatch.v2:${dispatch.id}`;
 const legacyKey = (c, dispatch) => `opcb.factory.dispatch.v1:${c.scope}:${c.session.viewer}:${dispatch.id}`;
 const messageIdPattern = /^[a-f0-9]{64}$/;
 async function findDelivery(c, dispatch) {
  const oldKey = legacyKey(c, dispatch);
  const keys = [nativeKey(dispatch), ...(oldKey.length <= 200 ? [oldKey] : [])];
  const outbox = c.session.outbox;
  const retained = storage.getItem(oldKey);
  const knownId = dispatch.messageId || retained;
  let entry = outbox?.snapshot?.().find(item => keys.includes(item.recovery?.key) || knownId && item.event?.id === knownId);
  if (!entry && !knownId && outbox?.recovery) {
   for (const key of keys) {
    entry = await outbox.recovery(key);
    if (entry) break;
   }
  }
  const id = knownId || entry?.event?.id;
  return {id:messageIdPattern.test(id || '') ? id : '', entry};
 }
 async function recordReceipt(cardId, versionId, dispatch, messageId, c, epoch) {
  const latest = await read(records[cardId].channel, c, epoch);
  const version = latest.doc?.versions.find(item => item.id === versionId);
  if (!version || version.dispatch?.id !== dispatch.id) throw Error('制作版本绑定已变化，请核对原会话');
  if (version.dispatch.messageId === messageId) return latest;
  const next = changeProduction(latest.doc, 'dispatch_receipt', {
   expected_revision: latest.doc.revision, version_id: versionId,
   dispatch_id: dispatch.id, message_id: messageId,
  }, {owner:c.session.viewer,pubkey:c.session.viewer});
  return save(latest, next, c, epoch);
 }
 function checkExecutor(c,epoch,channelId,executor,getExecutor,requireMember=true) {
  const channel=productionAccess(check(c,epoch),channelId);
  if (!channel || channel.members.some(id=>id!==c.session.viewer&&id!==executor) ||
      (requireMember && !channel.members.includes(executor))) {
   throw Error('执行Solo的成员或权限已变化，请核对右侧会话');
  }
  if (getExecutor && getExecutor()!==executor) throw Error('右侧Solo的Agent已变化，请重新确认执行');
  return channel;
 }
 async function changeDispatch(record, version, action, c, epoch) {
  const next = changeProduction(record.doc,action,{
   expected_revision:record.doc.revision,version_id:version.id,dispatch_id:version.dispatch.id,
  },{owner:c.session.viewer,pubkey:c.session.viewer});
  return save(record,next,c,epoch);
 }
 async function sendDispatch(latest, version, c, epoch, getExecutor) {
  const {dispatch}=version;
  const {channel,doc}=latest;
  const executor=dispatch.executor;
  await c.session.outbox?.ready?.();
  checkExecutor(c,epoch,channel,executor,getExecutor);
  if(typeof c.session.messages?.send!=='function')throw Error('当前宿主不能发送执行指令');
  // Claim this exact version before sending. After a crash during submission
  // an absent local receipt is ambiguous and must not permit a new message.
  const attempt=await changeDispatch(latest,version,'dispatch_attempt',c,epoch);
  let messageId;
  try {
   checkExecutor(c,epoch,channel,executor,getExecutor);
   const text = ['请执行这份内容工厂制作，使用下面的提示词和本条附件。',
    `素材：${doc.title}`, `production_version: ${version.id}`,
    `制作版本：${version.number}.0`, `dispatch_id: ${dispatch.id}`, `revision: ${attempt.doc.revision}`,
    '', ...(version.notes?['本轮备注（请同时核对以下补充要求）：',version.notes,'']:[]), ...(version.workflowPrompt?['工作流提示词：',version.workflowPrompt,'','模板提示词：',version.prompt||'尚未反推。请完整观看本条参考视频，结合角色与产品图反推模板1.0提示词，使用update_template_prompt保存真实回执后再按工作流执行。']: [version.prompt]), '',
    ...version.materials.map((m,i) => `${i+1}. ${m.kind === 'person' ? '角色' : m.kind === 'product' ? '产品' : '参考'} · ${m.libraryName || m.name} · ${m.name}`),
    '', '先读取opcb_factory_execution核对本版。实际开工后start，完成后附成片回写deliver，并通过update_prompt保存本轮整理后的完整提示词。本人验收后才是交付版。',
    'Higgsfield账号只走opcb.higgsfield-mailbox的实际可用工具。领取不等于生成授权；缺少工具或授权时记录具体阻塞，不切换付费入口。'].join('\n');
   messageId = c.session.messages.send(channel,text,[executor],version.materials,{
    key:nativeKey(dispatch),value:JSON.stringify({cardId:doc.cardId,versionId:version.id,dispatchId:dispatch.id}),
   });
  } catch (error) {
   // Native send throws synchronously before adding an event to the journal.
   await changeDispatch(attempt,version,'dispatch_rejected',c,epoch);
   throw Error('指令未进入发送队列，可点「核对发送」续送。'+error.message);
  }
  if(!messageIdPattern.test(messageId || ''))throw Error('发送回执尚未确认，请核对原生Solo');
  storage.setItem(legacyKey(c,dispatch),messageId);
  check(c,epoch);
  try {
   const recorded=await recordReceipt(doc.cardId,version.id,dispatch,messageId,c,epoch);
   return {...recorded,deliveryNotice:'已交给 Buzz 发送，请在右侧 Solo 查看消息。'};
  } catch (error) {
   throw Error('已交给 Buzz 发送，点击「核对发送」可补记回执。'+error.message);
  }
 }
 async function reconcile(latest,version,c,epoch,getExecutor) {
  const {dispatch}=version;
  const {id,entry}=await findDelivery(c,dispatch);
  check(c,epoch);
  if(id){
   const recorded=await recordReceipt(latest.doc.cardId,version.id,dispatch,id,c,epoch);
   const outbox=c.session.outbox;
   const local=outbox?.snapshot?.().find(item=>item.event?.id===id);
   if(local&&['failed','unknown'].includes(local.delivery)&&outbox?.retry){
    checkExecutor(c,epoch,latest.channel,dispatch.executor,getExecutor);
    outbox.retry(id);
    return {...recorded,deliveryNotice:'已重试发送原消息，请在右侧 Solo 查看结果。'};
   }
   if(entry&&['accepted','seen'].includes(entry.delivery)){
    return {...recorded,deliveryNotice:'Buzz 已确认收到原消息。'};
   }
   return {...recorded,deliveryNotice:'已核对原发送编号，请在右侧 Solo 查看投递状态。'};
  }
  const neverEnqueued=dispatch.state==='retryable'||dispatch.state==='prepared'&&
   (dispatch.transport===2||legacyKey(c,dispatch).length>200);
  if(!neverEnqueued)throw Error('发送结果待核对，请查看原生Solo；本版保留原指令编号');
  return sendDispatch(latest,version,c,epoch,getExecutor);
 }
 async function execute(cardId, args) {
  if (pending || uploading || inflight) throw Error('上一项制作操作尚未完成');
  const c = check(), epoch = generation, record = records[cardId];
  if (!record) throw Error('先打开对应素材的执行Solo');
  pending = true; emit({pending:true,error:''});
  try {
   let latest = await read(record.channel, c, epoch);
   const version = latest.doc?.versions.find(v=>v.id===latest.doc.currentVersion);
   if(version?.dispatch&&version.status==='queued'){
    return await reconcile(latest,version,c,epoch,args.getExecutor);
   }
   if(!latest.doc||latest.doc.revision!==args.expected_revision)throw Error('制作资料已有更新，请先核对新版本');
   if(!c.session.agentChoices?.snapshot().selectable?.some(a=>a.pubkey===args.executor))throw Error('右侧Solo的执行Agent尚不可用，请在右侧确认');
   const channel=checkExecutor(c,epoch,record.channel,args.executor,args.getExecutor,false);
   if(!channel.members.includes(args.executor)){
    if(!c.session.channelWrites?.addAgents)throw Error('当前宿主不能从Solo加入执行Agent');
    await c.session.channelWrites.addAgents(record.channel,[args.executor],()=>{
     try{checkExecutor(c,epoch,record.channel,args.executor,args.getExecutor,false);return true;}catch{return false;}
    });
   }
   checkExecutor(c,epoch,record.channel,args.executor,args.getExecutor);
   await c.session.outbox?.ready?.();
   latest=await read(record.channel,c,epoch);
   if(typeof c.session.messages?.send!=='function')throw Error('当前宿主不能发送执行指令');
   checkExecutor(c,epoch,record.channel,args.executor,args.getExecutor);
   const next=changeProduction(latest.doc,'prepare_execution',{...args,nativeDispatch:true},{owner:c.session.viewer,pubkey:c.session.viewer});
   latest=await save(latest,next,c,epoch);
   return await sendDispatch(latest,latest.doc.versions.find(v=>v.id===latest.doc.currentVersion),c,epoch,args.getExecutor);
  } catch (error) {if(epoch===generation)emit({error:error.message});throw error;}
  finally {if(epoch===generation){pending=false;emit({pending:false});}}
 }
 async function syncReference(card, file) {
  if(pending||uploading||inflight)throw Error('上一项制作操作尚未完成');
  const c=check(),epoch=generation,record=records[card.id];
  if(!record)throw Error('先打开模板Solo');
  pending=true;emit({pending:true,error:''});
  const recoveryKey=`opcb.factory.reference-upload.v1:${c.scope}:${c.session.viewer}:${card.id}`;
  try {
   let latest=await read(record.channel,c,epoch);
   if(latest.doc.versions.some(v=>['queued','running'].includes(v.status)))throw Error('执行中不能替换参考视频');
   let saved=JSON.parse(storage.getItem(recoveryKey)||'null');
   if(file&&saved)throw Error('有参考视频待归档，请先同步原视频再替换');
   if(!saved){
    file=file||await readReference(card);check(c,epoch);
    if(!file.type?.startsWith('video/')||!file.size||file.size>64*1024*1024)throw Error('请上传完整视频文件，单个最多64MB');
    saved=attachment(await c.session.attachments.upload(file,record.channel,new AbortController().signal));check(c,epoch);
    storage.setItem(recoveryKey,JSON.stringify(saved));
   }
   const next=changeProduction(latest.doc,'reference_video',{version_id:latest.doc.currentVersion,expected_revision:latest.doc.revision,file:saved},{owner:c.session.viewer,pubkey:c.session.viewer});
   latest=await save(latest,next,c,epoch);storage.removeItem?.(recoveryKey);return latest;
  }catch(e){if(epoch===generation)emit({error:e.message});throw e;}
  finally{if(epoch===generation){pending=false;emit({pending:false});}}
 }
 async function addLibraryFiles(kind, name, files) {
  if (pending || uploading || !['person','product'].includes(kind)) throw Error('上一项制作操作尚未完成');
  const c = check(), epoch = generation;
  let library = state.library;
  const recoveryKey=`opcb.factory.library-upload.v1:${c.scope}:${c.session.viewer}`;
  if(storage.getItem(recoveryKey))throw Error('有已上传图片待归档，请先恢复上次上传');
  if (!files.length || files.length > 20 || files.some(f => !f.type.startsWith('image/') || !f.size || f.size > 64*1024*1024)) throw Error('每项最多20张图片，单张最多64MB');
  pending = true; emit({pending:true,error:''});
  try {
   if (!library) {
    await refresh(); check(c,epoch); library=state.library;
    if (!library) {
     if(state.error)throw Error('图库尚未完整核验，请先刷新');
     const routeKey=`opcb.factory.library-route.v1:${c.scope}:${c.session.viewer}`;
     const channel=await openExecutionSolo({session:c.session,record:readExecutionPreference(routeKey,storage),check:()=>check(c,epoch),save:route=>storage.setItem(routeKey,JSON.stringify(route)),title:'内容工厂 · 角色与产品库'});
     const head=await c.session.canvas.read(channel);check(c,epoch);
     let doc=readLibrary(head);
     if(!doc){
      doc={schema:1,kind:'opcb.factory.library',owner:c.session.viewer,revision:0,entries:[]};
      const content=libraryContent(head?.content,doc),saved=await c.session.canvas.save(channel,content,head?.id,{preserveApproval:true});check(c,epoch);
      if(!saved?.id||saved.content!==content)throw Error('图库建立尚未确认，请刷新核对');
     }
     library={channel,doc};
    }
   }
   if(library.doc.owner!==c.session.viewer||!productionAccess(c,library.channel))throw Error('图库所属人或权限已变化');
   const entry = {id:crypto.randomUUID(),kind,name:(String(name || '').trim() || files[0].name).slice(0,160),files:[]};
   try {
    for (const file of files) {
     const value = await c.session.attachments.upload(file,library.channel,new AbortController().signal);
     check(c,epoch); entry.files.push(attachment(value));
     storage.setItem(recoveryKey,JSON.stringify({channel:library.channel,entry}));
    }
    return await saveLibraryEntry(entry,library.channel,c,epoch,recoveryKey);
   } catch(error) {
    if(entry.files.length)throw Error(`已有${entry.files.length}张图片上传，可恢复上次上传后补充。`+error.message);
    throw error;
   }
  } finally { if(epoch===generation){pending=false;emit({pending:false});} }
 }
 async function saveLibraryEntry(entry, channel, c, epoch, key) {
  const head = await c.session.canvas.read(channel); check(c,epoch);
  const doc = readLibrary(head);
  if (!doc || doc.owner !== c.session.viewer || !productionAccess(c,channel)) throw Error('图库所属人或权限已变化');
  if (!doc.entries.some(item => item.id === entry.id)) {
   const next = {...doc,revision:doc.revision+1,entries:[...doc.entries,entry]};
   const content = libraryContent(head?.content,next);
   const saved = await c.session.canvas.save(channel,content,head?.id,{preserveApproval:true}); check(c,epoch);
   if (!saved?.id || saved.content !== content) throw Error('图库保存未确认，可重新归档已上传图片');
  }
  const observed = await read(channel,c,epoch);
  if (!observed.library?.entries.some(item => item.id === entry.id)) throw Error('图库回读未确认，请重新归档');
  emit({library:{channel,headId:observed.headId,doc:observed.library}});
  storage.removeItem?.(key); return entry;
 }
 return {
  execute, addLibraryFiles, syncReference,
  async renameLibrary(id, name, expectedRevision) {
   if(pending || uploading)throw Error('上一项制作操作尚未完成');
   const c=check(),epoch=generation,library=state.library;
   if(!library)throw Error('请先读取角色／产品库');
   pending=true;emit({pending:true,error:''});
   try {
    const latest=await read(library.channel,c,epoch);
    const next=renameLibraryEntry(latest.library,id,name,expectedRevision);
    if(!productionAccess(check(c,epoch),library.channel))throw Error('图库权限已变化');
    const head=await c.session.canvas.read(library.channel);check(c,epoch);
    if(head?.id!==latest.headId)throw Error('图库已有更新，请刷新后重新改名');
    const content=libraryContent(head.content,next);
    const saved=await c.session.canvas.save(library.channel,content,head.id,{preserveApproval:true});check(c,epoch);
    if(!saved?.id || saved.content!==content)throw Error('改名保存尚未确认，请刷新核对');
    const observed=await read(library.channel,c,epoch);
    emit({library:{channel:library.channel,headId:observed.headId,doc:observed.library}});
    if(observed.headId!==saved.id || observed.library?.revision!==next.revision)throw Error('图库已有后续更新，请刷新核对名称');
    return observed.library;
   } finally {if(epoch===generation){pending=false;emit({pending:false});}}
  },
  async recoverLibraryUpload() {
   const c=check(),epoch=generation,key=`opcb.factory.library-upload.v1:${c.scope}:${c.session.viewer}`;
   const item=JSON.parse(storage.getItem(key)||'null');
   if(!item)throw Error('没有待归档的图库图片');
   if(pending||uploading)throw Error('上一项制作操作尚未完成');
   pending=true;emit({pending:true});
   try{return await saveLibraryEntry(item.entry,item.channel,c,epoch,key);}
   finally{if(epoch===generation){pending=false;emit({pending:false});}}
  },
  snapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
  bind(c){if(connection?.session===c.session&&connection?.scope===c.scope&&connection?.generation===c.generation)return;unsub();generation++;connection=c;records={};active='';loading=false;pending=false;uploading=false;inflight=undefined;refreshPromise=undefined;const epoch=generation;let unfiled=[];try{unfiled=JSON.parse(storage.getItem(`opcb.factory.unfiled.v1:${c.scope}:${c.session?.viewer}`)||'[]');}catch{}emit({records,active,error:'',loading:false,pending:false,unfiled,library:null});
   const offLive=c.session?.subscribeLive?.(batch=>{for(const event of batch.events||[]){if(event.kind!==40100)continue;const id=event.tags?.find(t=>t[0]==='d')?.[1];if(state.library?.channel===id){void refresh();continue;}if(!Object.values(records).some(r=>r.channel===id))continue;void read(id,c,epoch).then(record=>{if(epoch!==generation)return;records=Object.fromEntries(Object.entries(records).filter(([,r])=>r.channel!==id));if(record.doc)records={...records,[record.doc.cardId]:record};emit({records});},()=>{if(epoch!==generation)return;records=Object.fromEntries(Object.entries(records).filter(([,r])=>r.channel!==id));emit({records,error:'制作会话资料暂未核验，请刷新'});});}});
   const offList=c.session?.channels.subscribeList(()=>{records=Object.fromEntries(Object.entries(records).filter(([,r])=>productionAccess(ctx.relay.snapshot(),r.channel)));emit({records,library:state.library&&productionAccess(ctx.relay.snapshot(),state.library.channel)?state.library:null});});
   unsub=()=>{offLive?.();offList?.();};
  },
  refresh,
  async open(card,number){
   const c=check(),epoch=generation;if(inflight||pending||uploading)throw Error('上一项制作操作尚未完成，请稍后选择素材');
   const operation=(async()=>{pending=true;emit({pending:true,error:''});try{
    await refresh();check(c,epoch);
    let record=records[card.id];
    if(!record){
     if(state.error)throw Error('会话资料未完整核验，请先刷新；未新建重复Solo');
     const routeKey=key(card.id);let route=readExecutionPreference(routeKey,storage);
     const channel=await openExecutionSolo({session:c.session,record:route,check:()=>check(c,epoch),save:next=>{check(c,epoch);storage.setItem(routeKey,JSON.stringify(next));route=next;},title:`${String(number).padStart(2,'0')} · ${card.title} · 执行规划`});
     check(c,epoch);record=await read(channel,c,epoch);
     if(record.doc&&record.doc.cardId!==card.id)throw Error('原Solo已关联另一份素材，请核对');
     if(!record.doc)record=await save(record,newProduction(card,c.session.viewer),c,epoch);
    }
    if(!record.doc.prompts){const next=changeProduction(record.doc,'initialize_prompts',{expected_revision:record.doc.revision,version_id:record.doc.currentVersion},{owner:c.session.viewer,pubkey:c.session.viewer});record=await save(record,next,c,epoch);}
    active=card.id;records={...records,[card.id]:record};emit({active,records});return record;
   }catch(e){if(epoch===generation)emit({error:e.message});throw e;}finally{if(epoch===generation){pending=false;emit({pending:false});inflight=undefined;}}})();inflight=operation;
   const record=await operation;
   if(!record.doc.referenceVideo&&card.media_url){try{return await syncReference(card);}catch{return records[card.id];}}
   return record;
  },
  mutate:mutation,
  async upload(cardId,version,kind,file){
   if(uploading||pending)throw Error('上一项制作操作尚未完成');
   const c=check(),epoch=generation;uploading=true;emit({pending:true});
   try{
    const record=records[cardId];if(!record)throw Error('先打开对应执行Solo');
    const latest=await read(record.channel,c,epoch),v=latest.doc?.versions.find(v=>v.id===version);
    if(!v||(kind==='result'?(!['draft','running'].includes(v.status)||v.result||v.status==='draft'&&v.sealed):(v.status!=='draft'||v.sealed)))throw Error('此版本已封存，请新建版本');
    if(!file?.size||file.size>64*1024*1024||!c.session.attachments?.upload)throw Error('文件最多64MB，且需原生上传能力');
    const uploaded=attachment(await c.session.attachments.upload(file,record.channel,new AbortController().signal));check(c,epoch);
    const recovery={cardId,version,kind,file:uploaded};
    const recoveryKey=`opcb.factory.unfiled.v1:${c.scope}:${c.session.viewer}`;
    const retained=()=>{try{return JSON.parse(storage.getItem(recoveryKey)||'[]');}catch{return [];}};
    storage.setItem(recoveryKey,JSON.stringify([...retained().filter(x=>x.file?.url!==uploaded.url),recovery]));
    emit({unfiled:[...retained()]});
    try{
     const result=await mutation(cardId,kind==='result'?'result':'material',{expected_revision:latest.doc.revision,version_id:version,file:uploaded,kind});
     storage.setItem(recoveryKey,JSON.stringify(retained().filter(x=>x.file?.url!==uploaded.url)));emit({unfiled:retained()});return result;
    }catch(e){throw Error('文件已上传，版本保存未确认；可从待归档文件重新归档，不会重复上传。'+e.message);}
   }finally{if(epoch===generation){uploading=false;emit({pending:false});}}
  },
  async recoverUpload(item){
   const record=records[item.cardId];if(!record)throw Error('请先打开对应素材');
   const c=check(),savedKey=`opcb.factory.unfiled.v1:${c.scope}:${c.session.viewer}`;
   const queue=JSON.parse(storage.getItem(savedKey)||'[]');if(!queue.some(x=>x.file?.url===item.file?.url&&x.version===item.version))throw Error('待归档文件已变化');
   const epoch=generation,latest=await read(record.channel,c,epoch),result=await mutation(item.cardId,item.kind==='result'?'result':'material',{expected_revision:latest.doc.revision,version_id:item.version,file:item.file,kind:item.kind});
   check(c,epoch);const rest=JSON.parse(storage.getItem(savedKey)||'[]').filter(x=>x.file?.url!==item.file.url);storage.setItem(savedKey,JSON.stringify(rest));emit({unfiled:rest});return result;
  },
  async load(channel){const record=await read(channel);if(!record.doc)throw Error('当前Solo没有内容工厂制作记录');records={...records,[record.doc.cardId]:record};emit({records});return record;},
  read,dispose(){disposed=true;generation++;unsub();listeners.clear();},
 };
}
