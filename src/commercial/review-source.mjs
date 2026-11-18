import {reportRecord,REPORT_BEGIN,REPORT_END} from './model.mjs';
import {normalizeGrowthDraft} from './growth-draft.mjs';
import {readMobileMessage} from './mobile-source.mjs';
export const REVIEW_PREF='review-content-source';
const allowedAssets=['countdownReference','countdownPoster','countdownOutput','launchReference','launchOutput','holidayReference','holidayOutput'];
export function validateReviewBinding(v,owner){
 if(v==null)return null;
 if(v.schema!==1||v.owner!==owner||!Number.isInteger(v.revision)||v.revision<1||!v.channel||!/^[a-f0-9]{64}$/.test(v.message)||typeof v.url!=='string')throw Error('审阅内容来源无效');
 const u=new URL(v.url);if(u.protocol!=='https:'||u.username||u.password||!(/\.(json|bin)$/i.test(u.pathname)))throw Error('审阅内容附件无效');return v;
}
export function normalizeReviewRecord(input){
 if(input?.schema!=='opcb-commercial-review-v1')throw Error('需要商业化审阅内容schema');
 const report=reportRecord(REPORT_BEGIN+'\n```json\n'+JSON.stringify(input.report)+'\n```\n'+REPORT_END);
 const growthDraft=normalizeGrowthDraft(input.growthDraft);
 const assets={};
 for(const [key,value] of Object.entries(input.assets||{})){
  if(!allowedAssets.includes(key)||!value?.channel||!/^[a-f0-9]{64}$/.test(value.message))throw Error('内容素材来源无效');
  const u=new URL(value.url);if(u.protocol!=='https:'||u.username||u.password||!(/\.(mp4|webm|mov|png|jpg|jpeg|webp)$/i.test(u.pathname)))throw Error('素材附件格式无效');
  assets[key]={channel:value.channel,message:value.message,url:u.href};
 }
 let cleanup=null;
 if(input.cleanup){
  const c=input.cleanup;
  if(c.schema!==1||!/^[a-f0-9]{64}$/.test(c.request||'')||!Array.isArray(c.taskIds)||!Array.isArray(c.contentIds)||c.taskIds.length>1000||c.contentIds.length>1000||[...c.taskIds,...c.contentIds].some(id=>typeof id!=='string'||!id||id.length>200))throw Error('清理范围无效');
  const retained=c.retained;
  if(!retained||typeof retained.id!=='string'||!c.contentIds.includes(retained.id)||typeof retained.title!=='string'||!retained.title.trim()||retained.title.length>160)throw Error('保留成品标题无效');
  cleanup={schema:1,request:c.request,taskIds:[...new Set(c.taskIds)],contentIds:[...new Set(c.contentIds)],retained:{id:retained.id,title:retained.title}};
 }
 return {report,growthDraft,assets,cleanup};
}
export async function readReviewRecord(session,binding,check,request=fetch){
 await readMobileMessage(session,binding,check);check();
 const response=await request(session.media(binding.url),{redirect:'error'});
 if(!response.ok)throw Error('审阅内容读取失败');
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2*1024*1024)throw Error('审阅内容超过2MB');chunks.push(part.value);check();}}finally{await reader.cancel().catch(()=>{});}
 const buffer=new Uint8Array(bytes);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
 const record=normalizeReviewRecord(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer)));check();
 const reviewAssets={};for(const [key,source] of Object.entries(record.assets)){await readMobileMessage(session,source,check);check();reviewAssets[key]=session.media(source.url);}
 return {...record,reviewAssets};
}
export function mergeReviewRecord(data,record){
 if(!record)return data;
 const metrics={...data.metrics},proof={};const newer=(record.report.asOf||'')>(data.metricsAsOf||'');
 for(const [key,value] of Object.entries(record.report.metrics))if(value!==null&&(newer||metrics[key]==null)){metrics[key]=value;proof[key]={evidence:record.report.evidence,asOf:record.report.asOf};}
 const growthDraft={schema:1};for(const f of ['titles','copies','tags'])growthDraft[f]={...record.growthDraft[f],...data.growthDraft?.[f]};
 const days=new Map((record.report.history||[]).map(d=>[d.date,d]));for(const day of data.metricHistory||[])days.set(day.date,day);
 let workspace={};
 if(record.cleanup){const c=record.cleanup,tasks=(data.tasks||[]).filter(t=>!c.taskIds.includes(t.id)),content=(data.content||[]).filter(p=>!c.contentIds.includes(p.id));
  workspace={planningCleared:true,cleanupRequest:c.request,tasks,dates:[...new Set(tasks.map(t=>t.date).filter(Boolean))].sort(),content:[{...c.retained,date:'',time:'',owner:'',titleOnly:true},...content],launchDate:'',operations:[],progress:{total:tasks.length,completed:tasks.filter(t=>t.completed).length,accepted:tasks.filter(t=>t.status==='done').length,review:tasks.filter(t=>t.status==='review').length,blocked:tasks.filter(t=>t.status==='blocked').length}};
 }
 return {...data,...workspace,metrics,growthDraft,metricHistory:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),metricSource:Object.keys(proof).length?'本人审阅登记':data.metricSource,metricsAsOf:Object.keys(proof).length&&newer?record.report.asOf:data.metricsAsOf,metricsEvidence:Object.keys(proof).length?record.report.evidence:data.metricsEvidence,reviewMetricEvidence:proof,reviewAssets:record.reviewAssets};
}
