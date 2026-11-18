import {canExecuteInChannel,openExecutionSolo,readExecutionPreference} from '../media-workspace/execution.mjs';
import {readProduction,productionContent,newProduction,changeProduction,attachment} from './production-model.mjs';

export function productionAccess(connection,id){
 const s=connection?.session,list=s?.channels.list(),c=list?.channels.find(c=>c.id===id);
 return connection?.status==='ready'&&!connection.cached&&list?.status==='ready'&&canExecuteInChannel(c,s.viewer)&&c.channelType==='solo'&&c.private===true&&c.creator===s.viewer?c:null;
}
export function createProductionStore(ctx,{storage=globalThis.localStorage}={}){
 let refreshPromise,uploading=false;
 let connection,disposed=false,generation=0,active='',records={},error='',pending=false,loading=false,unsub=()=>{},inflight;
 const listeners=new Set();let state={records,active,error,pending,loading,unfiled:[]};
 const emit=patch=>{if(!disposed){state={...state,...patch};listeners.forEach(fn=>fn());}};
 const check=(c=connection,epoch=generation)=>{const now=ctx.relay.snapshot();if(disposed||generation!==epoch||now.status!=='ready'||now.cached||now.session!==c?.session||now.scope!==c.scope||now.generation!==c.generation)throw Error('账号或社区已变化，请重新打开制作页');return now;};
 const key=card=>`opcb.factory.production-route.v1:${connection.scope}:${connection.session.viewer}:${card}`;
 const read=async(id,c=connection,epoch=generation)=>{
  check(c,epoch);if(!productionAccess(c,id))throw Error('原执行Solo不可访问，未读取资料');
  const head=await c.session.canvas.read(id);check(c,epoch);if(!productionAccess(check(c,epoch),id))throw Error('执行Solo权限已变化');
  const doc=readProduction(head);if(doc&&doc.owner!==c.session.viewer)throw Error('制作资料所属人不一致');
  return {channel:id,headId:head?.id||null,doc};
 };
 const refreshOnce=async()=>{
  if(disposed||!connection||loading)return;const c=connection,epoch=generation;loading=true;emit({loading:true});
  const roster=c.session.channels.list();if(roster.status!=='ready'){loading=false;emit({records:{},loading:false,error:'会话目录仍在加载'});return;}
  const candidates=roster.channels.filter(x=>productionAccess(c,x.id));const next={},ambiguous=new Set();let failures=0;
  const queue=[...candidates];
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length){const item=queue.shift();try{const value=await read(item.id,c,epoch);if(value.doc){if(next[value.doc.cardId]||ambiguous.has(value.doc.cardId)){ambiguous.add(value.doc.cardId);delete next[value.doc.cardId];throw Error('同一素材有多个执行Solo');}next[value.doc.cardId]=value;}}catch(e){if(generation!==epoch||disposed)return;failures++;}}}));
  if(generation===epoch&&!disposed){records=next;emit({records,error:failures?`${failures}份会话资料暂未核验；相关条目不自动重建`:''});}
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
 return {
  snapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
  bind(c){if(connection?.session===c.session&&connection?.scope===c.scope&&connection?.generation===c.generation)return;unsub();generation++;connection=c;records={};active='';loading=false;pending=false;uploading=false;inflight=undefined;refreshPromise=undefined;const epoch=generation;let unfiled=[];try{unfiled=JSON.parse(storage.getItem(`opcb.factory.unfiled.v1:${c.scope}:${c.session?.viewer}`)||'[]');}catch{}emit({records,active,error:'',loading:false,pending:false,unfiled});
   const offLive=c.session?.subscribeLive?.(batch=>{for(const event of batch.events||[]){if(event.kind!==40100)continue;const id=event.tags?.find(t=>t[0]==='d')?.[1];if(!Object.values(records).some(r=>r.channel===id))continue;void read(id,c,epoch).then(record=>{if(epoch!==generation)return;records=Object.fromEntries(Object.entries(records).filter(([,r])=>r.channel!==id));if(record.doc)records={...records,[record.doc.cardId]:record};emit({records});},()=>{if(epoch!==generation)return;records=Object.fromEntries(Object.entries(records).filter(([,r])=>r.channel!==id));emit({records,error:'制作会话资料暂未核验，请刷新'});});}});
   const offList=c.session?.channels.subscribeList(()=>{records=Object.fromEntries(Object.entries(records).filter(([,r])=>productionAccess(ctx.relay.snapshot(),r.channel)));emit({records});});
   unsub=()=>{offLive?.();offList?.();};
  },
  refresh,
  async open(card,number){
   const c=check(),epoch=generation;if(inflight||pending||uploading)throw Error('上一项制作操作尚未完成，请稍后选择素材');
   inflight=(async()=>{pending=true;emit({pending:true,error:''});try{
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
    active=card.id;records={...records,[card.id]:record};emit({active,records});return record;
   }catch(e){if(epoch===generation)emit({error:e.message});throw e;}finally{if(epoch===generation){pending=false;emit({pending:false});inflight=undefined;}}})();return inflight;
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
