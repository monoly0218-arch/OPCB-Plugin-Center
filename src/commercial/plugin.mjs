import {REVIEW_PREF,validateReviewBinding,readReviewRecord,mergeReviewRecord} from './review-source.mjs';
import {openMobilePreview} from './mobile-preview.mjs';
import {MOBILE_PREF,validateMobileBinding,readMobileMessage,embeddedMobileHTML} from './mobile-source.mjs';
import {createBuzzComments} from './comments.mjs';
import {normalizeGrowthDraft,mergeGrowthChanges} from './growth-draft.mjs';
import {mountCommercialView} from './design-view.mjs';
import {readReportSource,emptyReportData,authorizeSource,saveSharedReport,metricKeys,requireReportChannel} from './model.mjs';
import {normalizeLibrary,normalizeCommercialPlan} from './legacy-model.mjs';
import {createReportRefresh} from './refresh.mjs';
import {REPORT_CACHE_KEY,reportScope,createReportSnapshot,canStoreReportSnapshot,readReportSnapshot} from './local-report-cache.mjs';
import {FACTORY_CHANNEL,createWorkSyncClient,createWorkSyncFeed,personalBindingChannels,publishWorkSyncBinding,workSyncStorage} from './work-sync.mjs';
import {workSyncBindingForm} from './work-sync-view.mjs';
export const inject=['react','pages','relay','artifactStorage','agents','browser','host'];
export function apply(ctx){
 const React=ctx.react,h=React.createElement;
 const workSyncApi=typeof OPCB_WORK_SYNC_API==='string'?OPCB_WORK_SYNC_API:'';
 const workSyncClient=workSyncApi&&ctx.host?.request?createWorkSyncClient(ctx.host,workSyncApi):null;
 const workSyncDisk=workSyncClient&&workSyncStorage();
 let memorySnapshot,memoryMobile;
 function Workspace({connection}){
  const root=React.useRef(null);
  const [nativePreview,setNativePreview]=React.useState(null);
  React.useLayoutEffect(()=>{
   let alive=true,collection,cache,offRoster,controller,view,snapshot;
   let attempted=false,accessEpoch=0,mobileAttempted=false,mobileChannel='',mobileObjectURL='',mobileBindingKey='',mobileEpoch=0;
   let mobileController,mobileRuntime,mobileSlot,previewFrame;
   const downloads=new Map();
   const shell=()=>({...emptyReportData(),interactiveShell:true,loading:false,notice:'正在打开本地报告…',renderKey:'shell'});
   let data=shell();
   const current=()=>{if(!alive)throw Error('页面已关闭');return ctx.relay.snapshot();};
   const safe=()=>authorizeSource(connection,current);
   const update=patch=>{if(!alive)return;data={...data,...patch};view?.update(data);};
   const scope=reportScope(connection);
   const canReadFactory=()=>{
    try{safe();requireReportChannel(connection.session,FACTORY_CHANNEL);return true;}
    catch{return false;}
   };
   const identity={owner:connection.session.viewer,community:connection.session.relayAuthor};
   const workSync=workSyncClient&&createWorkSyncFeed({client:workSyncClient,storage:workSyncDisk,
    key:JSON.stringify([workSyncApi,identity.community,scope]),identity,access:canReadFactory,
    onState:workSync=>update({workSync})});
   function connectWorkSync({open,body,modal}){
    if(!workSync||!canReadFactory())return;
    open('连接模版工厂',workSyncBindingForm(personalBindingChannels(connection.session)));
    const form=body.querySelector('[data-work-sync-bind]');
    if(!form)return;
    form.onsubmit=async event=>{
     event.preventDefault();
     const button=form.querySelector('button'),status=form.querySelector('[data-work-sync-status]');
     button.disabled=true;status.textContent='正在连接…';
     const channel=form.elements.channel.value;
     try{
      await workSync.bind((content,signal)=>publishWorkSyncBinding(connection.session,channel,content,signal));
      if(workSync.status().snapshot&&modal.open)modal.close();
      else status.textContent=workSync.status().notice||'连接未完成，请重试。';
     }catch(error){status.textContent=error.message;}
     finally{button.disabled=false;}
    };
   }
   if(memoryMobile?.scope!==scope)memoryMobile=undefined;
   const nativeMode=Boolean(ctx.browser?.available&&ctx.host?.spawn);
   const syncMobile=()=>{
    if(!nativeMode||!alive)return;
    cancelAnimationFrame(previewFrame);
    previewFrame=requestAnimationFrame(()=>{
     const el=root.current,slot=el.querySelector('[data-native-phone]');
     if(slot!==mobileSlot){
      if(mobileSlot)previewObserver.unobserve(mobileSlot);
      mobileSlot=slot;if(slot)previewObserver.observe(slot);
     }
     if(!slot||!mobileRuntime){setNativePreview(null);return;}
     const box=slot.getBoundingClientRect(),base=el.parentElement.getBoundingClientRect();
     const panel=slot.closest('.panel')?.getBoundingClientRect()||base;
     const url=new URL(mobileRuntime.url);
     url.searchParams.set('mode',slot.dataset.nativePhone==='flat'?'flat':'live');
     url.searchParams.set('screen',slot.dataset.nativePhone);
     const x=Math.round(box.left-base.left),y=Math.round(box.top-base.top);
     const width=Math.round(box.width),height=Math.round(box.height);
     const top=Math.max(0,Math.ceil(Math.max(base.top,panel.top)-box.top));
     const bottom=Math.max(0,Math.ceil(box.bottom-Math.min(base.bottom,panel.bottom)));
     const visible=width>0&&height>top+bottom&&!el.querySelector('#modal[open]');
     const next={url:url.href,x,y,width,height,top,bottom,visible};
     setNativePreview(old=>old&&Object.keys(next).every(key=>old[key]===next[key])?old:next);
    });
   };
   const previewObserver=new ResizeObserver(syncMobile);
   previewObserver.observe(root.current);
   root.current.addEventListener('scroll',syncMobile,true);
   const releaseMobile=()=>{
    mobileController?.abort();mobileController=undefined;
    mobileRuntime?.close();mobileRuntime=undefined;
    if(mobileObjectURL)URL.revokeObjectURL(mobileObjectURL);
    mobileObjectURL='';mobileChannel='';mobileBindingKey='';mobileEpoch++;
    if(alive)setNativePreview(null);
   };
   const refresh=(options)=>{
    try{safe();return controller?.refresh(options);}
    catch(error){update({notice:error.message});return Promise.resolve();}
   };
   async function requestMobile(){
    if(!alive||mobileAttempted||!collection)return;
    try{safe();}catch{return;}
    mobileAttempted=true;
    const controller=mobileController=new AbortController();
    const epoch=mobileEpoch;
    let sourceChannel;
    const check=()=>{
     safe();
     if(epoch!==mobileEpoch)throw Error('社区权限已变化');
     if(sourceChannel)requireReportChannel(connection.session,sourceChannel);
    };
    try{
     const binding=validateMobileBinding(await collection.preferences.get(MOBILE_PREF),connection.session.viewer);
     check();
     if(!binding){update({mobileNotice:'手机版原稿尚未关联'});return;}
     sourceChannel=mobileChannel=binding.channel;
     const sourceLink='buzz://message?channel='+binding.channel+'&id='+binding.message;
     mobileBindingKey=JSON.stringify(binding);
     update({mobileSourceLink:sourceLink});
     let html=memoryMobile?.scope===scope&&memoryMobile.key===mobileBindingKey?memoryMobile.html:'';
     if(!html){
      await readMobileMessage(connection.session,binding,check);
      const response=await fetch(connection.session.media(binding.url),{signal:controller.signal,redirect:'error'});
      if(!response.ok||Number(response.headers.get('content-length'))>50*1024*1024)throw Error('手机稿读取失败');
      const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
      const chunks=[];let bytes=0;
      try{
       while(true){
        const chunk=await reader.read();
        if(chunk.done)break;
        bytes+=chunk.value.byteLength;
        if(bytes>50*1024*1024)throw Error('手机稿超过50MB');
        chunks.push(decoder.decode(chunk.value,{stream:true}));
        check();
       }
       chunks.push(decoder.decode());
      }finally{await reader.cancel().catch(()=>{});}
      check();
      html=embeddedMobileHTML(chunks.join(''));
      memoryMobile={scope,key:mobileBindingKey,html};
     }
     check();
     if(nativeMode){
      const runtime=await openMobilePreview(ctx.host,html,controller.signal);
      try{check();}catch(error){runtime.close();throw error;}
      mobileRuntime=runtime;
      void runtime.exited.then(()=>{
       if(!alive||runtime!==mobileRuntime)return;
       releaseMobile();
       update({mobileNativeReady:false,mobileNotice:'手机稿预览已退出'});
      });
     }else if(ctx.browser){
      throw Error('当前设备不支持 Buzz 内嵌手机版原稿');
     }else{
      mobileObjectURL=URL.createObjectURL(new Blob([html],{type:'text/html'}));
     }
     update({reviewAssets:{...data.reviewAssets,mobileObjectURL,mobileRevision:binding.revision},
      mobileNativeReady:Boolean(mobileRuntime),mobileNotice:''});
    }catch(error){
     if(alive&&epoch===mobileEpoch){releaseMobile();update({mobileNativeReady:false,mobileNotice:error.message});}
    }
   }
   const download=(value,name)=>{safe();const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=root.current.ownerDocument.createElement('a');a.href=url;a.download=name;a.click();const timer=setTimeout(()=>{URL.revokeObjectURL(url);downloads.delete(url);},0);downloads.set(url,timer);};
   async function settings({open,body,esc,modal}){
    safe();if(!snapshot)throw Error('请先加载报告');const draftSource={revision:data.revision,plan:data.plan};
    const labels={posts:'已发布内容',views:'曝光',arrivals:'到站',codeUsers:'领取体验',starts:'提交生成',successes:'成功出片',saves:'确认保存',registrations:'注册',paidUsers:'真实付费用户',willingToShare:'愿意发布',repeatUsers:'再次使用',qualifiedOutputs:'合格片',attempts:'总尝试',revenue:'实收收入',refunds:'退款',generationCost:'生成实付',acquisitionCost:'媒体合作',subsidyCost:'免费补贴',otherCost:'其他履约',usableTemplates:'可用模板',characters:'人物',looks:'造型',chainTests:'链路测试',publishedUsers:'实际发布人数',follows:'关注小红书账号',groupJoins:'加入私域群',gatePassed:'两项均核验通过',accountReturns:'账号回流',groupReturns:'私域回流'};
    open('Data',`<div class="data-form"><a class="source-link" href="${esc(data.source)}">共享来源 ↗</a><div class="row wrap"><button class="pill" id="export-library">导出模板</button><button class="pill" id="export-plan">导出计划</button><button class="pill" id="export-growth">导出标题草稿</button></div><label>导入模板 JSON<input id="import-library" type="file" accept="application/json,.json"></label><label>导入计划 JSON<input id="import-plan" type="file" accept="application/json,.json"></label><form id="shared-record"><h2>Shared results</h2><label>统计日期<input type="date" name="asOf" value="${esc(data.metricsAsOf?.slice(0,10)||'')}"></label><label>证据链接<input type="url" name="evidence" value="${esc(data.metricsEvidence||'')}" placeholder="https:// 或 buzz://"></label><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${metricKeys.map(k=>`<label>${esc(labels[k]||k)}<input type="number" name="metric-${k}" min="0" max="1000000000" step="any" value="${data.metrics[k]??''}"></label>`).join('')}</div><button class="pill primary" type="submit">保存到共享来源</button><p id="save-message" class="save-message" role="status"></p></form></div>`);
    body.querySelector('#export-library').onclick=async()=>{try{safe();const value=await collection.preferences.get('library');safe();download(value||{schema:1,templates:[],screens:[]},'BRAND_LIBRARY.json');}catch(error){update({notice:error.message});}};
    body.querySelector('#export-growth').onclick=()=>download(data.growthDraft||{schema:1,titles:{}},'COMMERCIAL_TITLE_DRAFT.json');
    body.querySelector('#export-plan').onclick=()=>download({...data.plan,metrics:data.metrics,metricsAsOf:data.metricsAsOf,metricsEvidence:data.metricsEvidence},'COMMERCIAL_PLAN.json');
    for(const [id,key,normalize] of [['import-library','library',normalizeLibrary],['import-plan','commercial-plan',normalizeCommercialPlan]])body.querySelector('#'+id).onchange=async e=>{
     const file=e.target.files?.[0];e.target.value='';if(!file)return;
     try{if(file.size>50*1024*1024)throw Error('文件超过50MiB');const incoming=normalize(JSON.parse(await file.text()));safe();
      await collection.preferences.update(key,old=>{safe();if(key!=='library')return incoming;const existing=old?normalizeLibrary(old):{schema:1,templates:[],screens:[]};return normalizeLibrary({schema:1,templates:[...existing.templates,...incoming.templates.filter(n=>!existing.templates.some(x=>x.key===n.key))],screens:[...existing.screens,...incoming.screens.filter(n=>!existing.screens.some(x=>x.title===n.title&&x.image===n.image))]});});
      safe();modal.close();await refresh({afterWrite:true});
     }catch(error){if(alive&&modal.open)body.querySelector('#save-message').textContent=error.message;}
    };
    body.querySelector('#shared-record').onsubmit=async e=>{
     e.preventDefault();const form=e.currentTarget,button=form.querySelector('button[type=submit]'),message=form.querySelector('#save-message');button.disabled=true;
     try{const fields=new FormData(form),metrics={};for(const k of metricKeys){const value=fields.get('metric-'+k);metrics[k]=value===''?null:Number(value);}
      const record={schema:1,asOf:String(fields.get('asOf')||''),evidence:String(fields.get('evidence')||''),metrics,plan:draftSource.plan};
      await saveSharedReport({connection,current,data:draftSource,record});safe();message.textContent='已保存并回读共享来源';await refresh({afterWrite:true});
     }catch(error){if(alive){message.textContent=error.message;if(error.message.includes('来源已变化')){const review=root.current.ownerDocument.createElement('div');review.className='data-form';review.innerHTML='<button class="pill" type="button">核对最新共享实绩</button>';message.after(review);review.querySelector('button').onclick=async()=>{try{const latest=await readReportSource(connection,current,collection);safe();review.innerHTML='<details open><summary>最新共享实绩</summary><pre style="white-space:pre-wrap;font-size:16px">'+esc(JSON.stringify(latest.metrics,null,2))+'</pre></details><button class="pill" type="button">已核对，保留草稿继续保存</button>';review.querySelector('button').onclick=()=>{draftSource.revision=latest.revision;draftSource.plan=latest.plan;message.textContent='已核对最新来源，原表单草稿保留';review.remove();};}catch(failure){message.textContent=failure.message;}};}}}finally{if(alive)button.disabled=false;}
    };
   }
   const comments=createBuzzComments({connection,current});
   const show=(next,cached)=>{
    const report=readReportSnapshot(next,connection,current);
    if(!report)return false;
    snapshot=next;
    const mobile={mobileNativeReady:Boolean(mobileRuntime),mobileSourceLink:data.mobileSourceLink,mobileNotice:data.mobileNotice};
    data={...report,...mobile,workSync:workSync?.status(),loading:false,interactiveShell:true,notice:cached?'本地缓存 · '+report.updatedAt:'',error:''};
    if(mobileObjectURL)data.reviewAssets={...data.reviewAssets,mobileObjectURL};
    view?.update(data);
    if(root.current?.querySelector('[data-mobile-request]'))void requestMobile();
    return true;
   };
   function restore(candidate){
    try{return show(candidate,true);}catch{return false;}
   }
   function onRoster(){
    if(!alive)return;
    if(connection.session.channels.list().status==='ready')workSync?.roster(canReadFactory());
    try{
     safe();
     if(snapshot)readReportSnapshot(snapshot,connection,current);
    }catch(error){
     if(snapshot||controller?.pending){
      accessEpoch++;snapshot=undefined;
      if(memorySnapshot?.scope===scope)memorySnapshot=undefined;
      if(memoryMobile?.scope===scope)memoryMobile=undefined;
      releaseMobile();mobileAttempted=false;
      data={...shell(),renderKey:'denied',notice:'',error:error.message};
      view?.update(data);
     }else if(connection.session.channels.list().status==='ready'){
      update({notice:error.message});
     }
     return;
    }
    if(mobileChannel){
     try{requireReportChannel(connection.session,mobileChannel);}
     catch(error){
      if(memoryMobile?.scope===scope)memoryMobile=undefined;
      releaseMobile();
      update({reviewAssets:snapshot?.data.reviewAssets||{},mobileNativeReady:false,mobileSourceLink:'',mobileNotice:error.message});
     }
    }
    if(root.current.querySelector('[data-mobile-request]'))void requestMobile();
    if(attempted)return;
    attempted=true;
    if(snapshot||restore(memorySnapshot))return;
    const epoch=accessEpoch;
    void (async()=>{
     let disk;
     try{disk=await cache?.preferences.get(REPORT_CACHE_KEY);}catch{}
     if(!alive||epoch!==accessEpoch||snapshot||controller.pending)return;
     if(restore(disk)){memorySnapshot=disk;return;}
     await refresh();
    })();
   }
   restore(memorySnapshot);
   view=mountCommercialView(root.current,data,{
    layoutKey:connection.session.viewer+':'+connection.scope,comments,refresh:()=>{
     if(!mobileChannel)mobileAttempted=false;
     void workSync?.refresh();
     return refresh();
    },connectWorkSync,requestMobile,syncMobile,retryMobile:()=>{
     if(mobileRuntime||mobileObjectURL)return;
     mobileAttempted=false;update({mobileNotice:''});void requestMobile();
    },
    saveGrowthDraft:async (titles,fields={})=>{
     safe();
     await collection.preferences.update('growth-draft',old=>{
      safe();
      return mergeGrowthChanges(normalizeGrowthDraft(old),{titles,copies:fields.copies||{},tags:fields.tags||{}},fields.base||{});
     });
     safe();await refresh({afterWrite:true});return '已保存到Buzz';
    },
    settleTitleConflict:async()=>{safe();await refresh();},
    settings:args=>{void settings(args).catch(error=>update({notice:error.message}));}
   });
   const cleanup=()=>{
    alive=false;cancelAnimationFrame(previewFrame);previewObserver.disconnect();
    workSync?.dispose();
    root.current?.removeEventListener('scroll',syncMobile,true);releaseMobile();
    for(const [url,timer] of downloads){clearTimeout(timer);URL.revokeObjectURL(url);}
    downloads.clear();controller?.dispose();offRoster?.();
    view.dispose();comments.dispose();collection?.close();cache?.close();
   };
   try{
    collection=ctx.artifactStorage.open({name:'brand-library',type:'opcb.results-report.library',version:1,project:()=>[]});
    try{cache=ctx.artifactStorage.open({name:'report-cache',type:'opcb.results-report.cache',version:1,project:()=>[]});}catch{}
    controller=createReportRefresh({
     async read(){
      const savedAt=Date.now(),epoch=accessEpoch,session=connection.session;
      const check=()=>{safe();if(epoch!==accessEpoch)throw Error('社区权限已变化');};
      check();
      const [base,bindingValue,phoneBinding]=await Promise.all([
       readReportSource(connection,current,collection),
       collection.preferences.get(REVIEW_PREF),
       collection.preferences.get(MOBILE_PREF).catch(()=>undefined)
      ]);
      check();
      const binding=validateReviewBinding(bindingValue,session.viewer);
      const review=binding?await readReviewRecord(session,binding,check):null;
      const channels=binding?[binding.channel,...Object.values(review.assets).map(asset=>asset.channel)]:[];
      const roster=safe(),profiles=session.profiles.snapshot();
      const missingProfiles=(roster.members||[]).filter(pubkey=>!profiles.has(pubkey));
      if(missingProfiles.length)void Promise.resolve(session.profiles.ensure(missingProfiles,'background')).catch(()=>{});
      const peopleProfiles=(roster.members||[]).flatMap(pubkey=>{
       const p=profiles.get(pubkey);
       return p?[{pubkey,name:p.name||pubkey.slice(0,8),picture:p.picture||''}]:[];
      });
      const report=mergeReviewRecord(base,review);
      check();
      if(phoneBinding!==undefined&&mobileBindingKey&&JSON.stringify(phoneBinding)!==mobileBindingKey){
       if(memoryMobile?.scope===scope)memoryMobile=undefined;
       releaseMobile();mobileAttempted=false;
       data={...data,mobileNativeReady:false,mobileSourceLink:'',mobileNotice:''};
      }
      return createReportSnapshot(connection,{
       ...report,peopleProfiles,renderKey:base.renderKey+':'+(binding?.message||'')+':'+JSON.stringify(peopleProfiles),
       updatedAt:new Date().toLocaleTimeString('zh-CN',{hour12:false})
      },channels,savedAt);
     },
     onState(state){
      if(state.data){
       try{if(!show(state.data,false))return;}catch(error){update({loading:false,notice:error.message});return;}
       memorySnapshot=state.data;
       if(cache&&canStoreReportSnapshot(state.data)){
        void cache.preferences.update(REPORT_CACHE_KEY,old=>old?.savedAt>state.data.savedAt?old:state.data).catch(()=>{});
       }
      }else if(state.error){
       update({loading:false,notice:state.error});
      }else{
       update({loading:state.loading,notice:snapshot?'正在更新数据…':'正在读取共享报告…'});
      }
     }
    });
    offRoster=connection.session.channels.subscribeList(onRoster);
    if(connection.session.channels.list().status!=='ready')connection.session.channels.ensureList();
    onRoster();
   }catch(error){update({loading:false,notice:error.message});}
   return cleanup;
  },[connection.session,connection.scope,connection.generation]);
  const position=nativePreview;
  const overlay=position&&h('div',{style:{position:'absolute',left:position.x,top:position.y+position.top,width:position.width,
   height:Math.max(0,position.height-position.top-position.bottom),display:position.visible?'flex':'none',zIndex:2}},
   h(ctx.browser.View,{url:position.url,label:'OPCB R8 手机体验'}));
  return h('div',{style:{position:'relative',width:'100%',height:'100%',minHeight:0}},
   h('div',{className:'commercial-v3',ref:root,'data-commercial-v3':true}),overlay);

 }
 function Page(){const connection=React.useSyncExternalStore(ctx.relay.subscribe,ctx.relay.snapshot,ctx.relay.snapshot);const visit=React.useMemo(()=>({}),[connection.session,connection.scope,connection.generation]);const previous=React.useRef(),sequence=React.useRef(0);if(previous.current!==visit){previous.current=visit;sequence.current++;}return connection.status==='ready'&&!connection.cached&&connection.session?.viewer?h(Workspace,{connection,key:sequence.current}):h('p',{role:'status'},'连接当前账号的社区后读取商业计划');}
 const toolAccess=(client,context)=>{const relay=ctx.agents.relay(client.key),connection=relay?.snapshot(),host=ctx.relay.snapshot();const check=()=>{client.signal?.throwIfAborted();const now=relay?.snapshot(),human=ctx.relay.snapshot();if(!client.signal||connection?.status!=='ready'||connection.cached||now?.session!==connection.session||now.scope!==connection.scope||now.generation!==connection.generation||human.status!=='ready'||human.cached||human.session!==host.session||human.scope!==connection.scope||human.generation!==host.generation||connection.session.viewer!==client.owner||human.session.viewer!==client.owner)throw Error('当前身份或社区已变化');for(const session of [connection.session,human.session]){const list=session.channels.list(),c=list.channels.find(c=>c.id===context.channel);if(list.status!=='ready'||!c||c.readOnly||c.archived||c.cached||c.pending||c.metadataPending||c.metadataCached||!c.members?.includes(client.owner)||!c.members.includes(client.pubkey))throw Error('执行会话无权关联手机稿');}};check();return {connection,check};};
 ctx.agents.addTool({name:'opcb_commercial_mobile_source',description:'Read or bind the owner-scoped HTML source reused from OPCB Mobile. Binding needs the current owner request, exact source message and revision; it never publishes the HTML.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['read','bind']},request_id:{type:'string'},expected_revision:{type:'integer'},source_channel:{type:'string'},source_message:{type:'string'},source_url:{type:'string'}},additionalProperties:false},async call(client,context,args){const {connection,check}=toolAccess(client,context),store=ctx.artifactStorage.open({name:'brand-library',type:'opcb.results-report.library',version:1,project:()=>[]});try{const old=validateMobileBinding(await store.preferences.get(MOBILE_PREF),client.owner);check();if(args.action!=='bind')return JSON.stringify({binding:old,revision:old?.revision||0});if(args.expected_revision!==(old?.revision||0))throw Error('手机稿绑定已变化，请刷新');if(!/^[a-f0-9]{64}$/.test(args.request_id||''))throw Error('需要本人原始指令');const requestThread=connection.session.thread(context.channel,args.request_id,{exact:true});try{await requestThread.refresh();check();const snapshot=requestThread.snapshot(),request=snapshot.target;if(snapshot.targetStatus!=='ready'||request?.id!==args.request_id||request.channelId!==context.channel||request.authorId!==client.owner||request.edited||!/插件|手机|Mobile|标注/.test(request.content||''))throw Error('需要本会话本人明确更新指令');}finally{requestThread.dispose();}const binding=validateMobileBinding({schema:1,owner:client.owner,revision:(old?.revision||0)+1,channel:args.source_channel,message:args.source_message,url:args.source_url},client.owner);const row=await readMobileMessage(connection.session,binding,check);if(![client.owner,client.pubkey].includes(row.authorId))throw Error('手机稿需来自本人或当前Agent');await store.preferences.update(MOBILE_PREF,value=>{check();if((validateMobileBinding(value,client.owner)?.revision||0)!==args.expected_revision)throw Error('手机稿绑定冲突');return binding;});check();return JSON.stringify({binding:validateMobileBinding(await store.preferences.get(MOBILE_PREF),client.owner),revision:binding.revision});}finally{store.close();}}});
 ctx.agents.addTool({name:'opcb_commercial_review_source',description:'Read or bind the owner-authorized review JSON with metrics, content drafts, owner-assigned work and exact Buzz media sources. Requires this conversation owner request, exact attachment and revision. Live task state is never imported.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['read','bind']},request_id:{type:'string'},expected_revision:{type:'integer'},source_channel:{type:'string'},source_message:{type:'string'},source_url:{type:'string'}},additionalProperties:false},async call(client,context,args){
 const {connection,check}=toolAccess(client,context),store=ctx.artifactStorage.open({name:'brand-library',type:'opcb.results-report.library',version:1,project:()=>[]});
 try{const old=validateReviewBinding(await store.preferences.get(REVIEW_PREF),client.owner);check();if(args.action!=='bind')return JSON.stringify({binding:old,revision:old?.revision||0});if(args.expected_revision!==(old?.revision||0))throw Error('审阅内容绑定已变化，请刷新');
 if(!/^[a-f0-9]{64}$/.test(args.request_id||''))throw Error('需要本人原始指令');const thread=connection.session.thread(context.channel,args.request_id,{exact:true});try{await thread.refresh();check();const s=thread.snapshot(),r=s.target;if(s.targetStatus!=='ready'||r?.id!==args.request_id||r.channelId!==context.channel||r.authorId!==client.owner||r.edited||!/插件|同步|数据|标注|布置.{0,12}任务|发布日历/.test(r.content||''))throw Error('需要本会话本人明确同步指令');}finally{thread.dispose();}
 const binding=validateReviewBinding({schema:1,owner:client.owner,revision:(old?.revision||0)+1,channel:args.source_channel,message:args.source_message,url:args.source_url},client.owner);if(binding.channel!==context.channel)throw Error('请在原执行会话交付审阅数据');const source=await readMobileMessage(connection.session,binding,check);if(![client.owner,client.pubkey].includes(source.authorId))throw Error('需本人或当前Agent的审阅附件');const record=await readReviewRecord(connection.session,binding,check);check();await store.preferences.update(REVIEW_PREF,value=>{check();if((validateReviewBinding(value,client.owner)?.revision||0)!==args.expected_revision)throw Error('审阅内容绑定冲突');return binding;});check();const confirmed=validateReviewBinding(await store.preferences.get(REVIEW_PREF),client.owner);check();if(JSON.stringify(confirmed)!==JSON.stringify(binding))throw Error('审阅内容保存尚未确认');return JSON.stringify({binding:confirmed,revision:confirmed.revision,metrics:record.report.metrics,assets:Object.keys(record.assets),workPlan:record.workPlan?{tasks:record.workPlan.tasks.length,content:record.workPlan.content.length}:null});
 }finally{store.close();}
 }});
 ctx.pages.register({icon:OPCB_REPORT_ICON,id:'report',title:'OPCB 平台商业化计划与报告',primary:true,placement:'dock',layout:'workspace',component:Page});
}
