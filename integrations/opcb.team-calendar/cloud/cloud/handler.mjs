import {CalendarError,applyMutation,canonical,hash,id} from '../server/state.mjs';

export function createHandler({url,serviceKey,fetchImpl=fetch}) {
  const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  async function rpc(args,name='opcb_calendar_gateway') {
    const response=await fetchImpl(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw new CalendarError('日历数据服务暂时不可用；保存后请先查询操作回执',503);
    const data=await response.json();
    if(data.error)throw new CalendarError(data.error,data.status||500);
    return data;
  }
  return async request=>{
    try {
      const u=new URL(request.url),path=u.pathname.replace(/^(?:\/functions\/v1)?\/opcb-team-calendar(?=\/|$)/,'');
      if(request.method==='GET'&&path==='/health')return json(200,{ok:true,backend:'supabase',version:'1.0.7-prep'});
      const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if(!token)throw new CalendarError('未授权访问此日历',401);
      const viewer=request.headers.get('x-calendar-viewer');
      if(viewer&&!/^[a-f0-9]{64}$/.test(viewer))throw new CalendarError('用户身份格式不正确',403);
      // Shared API never uses cookies; reject browser cross-origin requests.
      if(request.headers.has('origin')&&request.headers.get('origin')!==u.origin)throw new CalendarError('不允许跨站请求',403);
      const identity={p_token_hash:hash(token),p_viewer:viewer};
      if(request.method==='POST'&&path==='/api/bind'){
        const length=Number(request.headers.get('content-length')||0);if(length>2048)throw new CalendarError('绑定请求过大',413);
        // Binding is a small, fixed payload. Limit the stream before parsing.
        const reader=request.body?.getReader();if(!reader)throw new CalendarError('绑定请求为空');
        let raw='',bytes=0;for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2048){await reader.cancel();throw new CalendarError('绑定请求过大',413);}raw+=new TextDecoder().decode(value);}
        let payload;try{payload=JSON.parse(raw);}catch{throw new CalendarError('JSON 格式不正确');}
        if(!/^[a-f0-9]{64}$/.test(payload?.pubkey||'')||!/^[a-f0-9]{64}$/.test(payload?.deviceHash||''))throw new CalendarError('绑定信息不正确');
        return json(200,await rpc({p_invite_hash:hash(token),p_pubkey:payload.pubkey,p_token_hash:payload.deviceHash},'opcb_calendar_redeem_invite'));
      }
      if(request.method==='GET'&&path==='/api/state'){
        const data=await rpc({...identity,p_action:'read'});delete data.actor;return json(200,data);
      }
      if(request.method==='GET'&&path==='/api/revision')return json(200,await rpc({...identity,p_action:'revision'}));
      if(request.method==='GET'&&path.startsWith('/api/operations/'))return json(200,(await rpc({...identity,p_action:'operation',p_request_id:decodeURIComponent(path.slice('/api/operations/'.length))})).receipt);
      if(request.method==='POST'&&path==='/api/mutate'){
        const reader=request.body?.getReader();if(!reader)throw new CalendarError('请求内容为空');
        const chunks=[];let size=0;
        for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256000){await reader.cancel();throw new CalendarError('请求内容过大',413);}chunks.push(value);}
        const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
        let payload;try{payload=JSON.parse(new TextDecoder().decode(raw));}catch{throw new CalendarError('JSON 格式不正确');}
        if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new CalendarError('请求格式不正确');
        id(payload.requestId);
        if(!Number.isSafeInteger(payload.expectedRevision)||payload.expectedRevision<0)throw new CalendarError('需要读取当前版本后再保存');
        const args={...identity,p_request_id:payload.requestId,p_fingerprint:hash(canonical(payload)),p_expected_revision:payload.expectedRevision};
        const prepared=await rpc({...args,p_action:'prepare'});
        if(prepared.receipt)return json(200,prepared.receipt);
        const {state}=applyMutation(prepared.state,prepared.principal,payload);
        return json(200,(await rpc({...args,p_action:'commit',p_state:state})).receipt);
      }
      throw new CalendarError('接口不存在',404);
    }catch(error){return json(error instanceof CalendarError?error.status:500,{error:error instanceof CalendarError?error.message:'日历服务暂时不可用；若正在保存请先查询操作回执'});}
  };
}
