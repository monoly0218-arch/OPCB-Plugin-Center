import {normalizeGrowthDraft} from './growth-draft.mjs';
import {operationSections} from './operations.mjs';
import {parseTaskCanvas} from '../tasks/live-model.mjs';
import {TASK_SOURCE,validDate} from '../tasks/source.mjs';
import {projectTaskDetails} from './task-details.mjs';
import {projectFlow} from '../tasks/lifecycle.mjs';
import {emptyCommercialPlan,normalizeCommercialPlan,normalizeLibrary,COMMERCIAL_METRICS} from './legacy-model.mjs';
export {TASK_SOURCE};
export const REPORT_BEGIN='<!-- opcb-commercial-report-v1:begin -->',REPORT_END='<!-- opcb-commercial-report-v1:end -->';
export const metricKeys=[...COMMERCIAL_METRICS];
export function reportRecord(content){
 const a=content.split(REPORT_BEGIN),b=content.split(REPORT_END);
 if(a.length===1&&b.length===1)return null;
 if(a.length!==2||b.length!==2||content.indexOf(REPORT_END)<content.indexOf(REPORT_BEGIN))throw Error('共享报告记录区不完整');
 const match=a[1].split(REPORT_END)[0].trim().match(/^```json\s*\n([\s\S]+)\n```$/);
 if(!match)throw Error('共享报告记录格式无效');
 let input;try{input=JSON.parse(match[1]);}catch{throw Error('共享报告JSON无效');}
 if(!input||input.schema!==1||!input.metrics||typeof input.metrics!=='object'||Array.isArray(input.metrics))throw Error('共享报告schema无效');
 const metrics={};
 for(const k of metricKeys){const n=input.metrics[k];if(n!==null&&n!==undefined&&(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e9))throw Error('共享实绩数值无效');metrics[k]=n??null;}
 if(Object.values(metrics).some(v=>v!==null)&&(!input.asOf||typeof input.asOf!=='string'||!validDate(input.asOf.slice(0,10))||typeof input.evidence!=='string'||!input.evidence.trim()))throw Error('实际数据需要统计日期和证据');
 if(input.evidence){const url=new URL(input.evidence);if(!['https:','buzz:'].includes(url.protocol)||url.username||url.password)throw Error('证据链接无效');}
 const history=normalizeMetricHistory(input.history);
 return {metrics,history,asOf:typeof input.asOf==='string'?input.asOf:'',evidence:input.evidence||'',plan:input.plan?normalizeCommercialPlan(input.plan):null};
}
export function normalizeMetricHistory(value=[]){
 if(!Array.isArray(value)||value.length>730)throw Error('最多730条逐日指标');
 const days=new Set();return value.map(row=>{if(!row||!validDate(row.date)||days.has(row.date))throw Error('逐日指标日期无效或重复');days.add(row.date);const metrics={};for(const k of metricKeys){const n=row.metrics?.[k];if(n!==null&&n!==undefined&&(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e9))throw Error('逐日指标数值无效');metrics[k]=n??null;}if(!row.evidence)throw Error('逐日指标需要证据');const url=new URL(row.evidence);if(!['https:','buzz:'].includes(url.protocol)||url.username||url.password)throw Error('逐日指标证据无效');return {date:row.date,evidence:row.evidence,metrics};}).sort((a,b)=>a.date.localeCompare(b.date));
}
export function contentEntries(content){
 const section=content.split('## 10篇内容与引流')[1]?.split(/\n## /)[0]||'';
 return [...section.matchAll(/^- (C\d{2}) (\d{4}-\d{2}-\d{2})[^\n]*?(\d{2}:\d{2})：\*\*(.+?)\*\*；([^\n]+)/gm)].map(([,id,date,time,title,format])=>{if(!validDate(date))throw Error('内容排期日期无效');return {id,date,time,title,format,owner:'周洋',tags:'',route:'',status:'草案'};});
}
const statusLabels={planning:'待回执',todo:'待开始',doing:'进行中',blocked:'受阻',review:'待验收',done:'已验收'};
export function buildReportData(event,libraryInput,planInput,growthInput){
 const baseline=parseTaskCanvas(event),tasks=projectFlow(projectTaskDetails(baseline.tasks,event.content),event.content).filter(t=>!t.removed);
 const library=libraryInput?normalizeLibrary(libraryInput):{templates:[],screens:[]};
 const shared=reportRecord(event.content);
 const plan=shared?.plan||(planInput?normalizeCommercialPlan(planInput):emptyCommercialPlan());
 const mapped=tasks.map(t=>({...t,sourceId:t.id,owner:t.assignee,time:(t.times||[]).join('／')||'待安排',deliverable:t.completionDefinition,acceptance:t.accepted?'本人已确认当前交付':t.acceptance||t.boundary||'未登记',statusLabel:statusLabels[t.status]||'待回执'}));
 const dates=[...new Set(mapped.map(t=>t.date).filter(Boolean))].sort();
 let content=contentEntries(event.content);
 if(!content.length)content=plan.content.map(c=>({...c,date:new Date(Date.parse(plan.launchDate+'T00:00:00Z')+c.day*86400000).toISOString().slice(0,10)}));
 let growthDraft;try{growthDraft=normalizeGrowthDraft(growthInput);}catch{growthDraft=normalizeGrowthDraft(null);}
 const videos=library.templates.map(v=>({...v,en:v.name,version:v.status||'待确认'}));
 const v6=library.screens.filter(s=>/V6|v6/.test(s.title+' '+s.note));
 const current=library.screens.filter(s=>/现站|当前网站|current site/i.test(s.title+' '+s.note));
 return {growthDraft,metricHistory:shared?.history||[],postMetrics:plan.postMetrics||{},operations:operationSections(event.content),plan,tasks:mapped,dates,content,videos,screens:v6.length?v6:library.screens,current,people:tasks.filter(t=>t.kind==='assignment').map(t=>({name:t.assignee,role:t.title})),budget:plan.budget,metrics:shared?.metrics||plan.metrics,metricsAsOf:shared?.asOf||plan.metricsAsOf,metricsEvidence:shared?.evidence||plan.metricsEvidence,screenLabel:v6.length?'V6 交互稿':'历史页面',metricSource:shared?'共享记录':Object.values(plan.metrics).some(v=>v!==null&&v!==undefined)?'本机记录':'待回执',source:baseline.source,revision:baseline.baselineRevision,sourceAt:baseline.syncedAt,updatedAt:'',loading:false,error:'',launchStatus:shared?.plan?.launchStatus||(/本轮排程基线/.test(event.content)?'排程基线 · 上线待批准':plan.launchStatus||'待确认'),launchDate:dates.find(d=>mapped.some(t=>t.code==='L01'&&t.date===d))||plan.launchDate,progress:{total:tasks.length,completed:tasks.filter(t=>t.completed).length,accepted:tasks.filter(t=>t.status==='done').length,review:tasks.filter(t=>t.status==='review').length,blocked:tasks.filter(t=>t.status==='blocked'||t.status==='doing'&&t.blockReason).length}};
}
export function emptyReportData(){return {tasks:[],dates:[],content:[],videos:[],screens:[],current:[],people:[],budget:emptyCommercialPlan().budget,metrics:{},progress:{total:0,completed:0,accepted:0,review:0,blocked:0},source:'buzz://channel/'+TASK_SOURCE,revision:'',launchDate:'',loading:true,error:'',updatedAt:''};}
export function authorizeSource(connection,current){
 const now=current();
 if(now.status!=='ready'||now.cached||!now.session?.viewer||now.session!==connection.session||now.scope!==connection.scope||now.generation!==connection.generation)throw Error('账号或社区已变化');
 const list=connection.session.channels.list(),c=list.channels.find(c=>c.id===TASK_SOURCE);
 if(list.status!=='ready'||!c||c.archived||c.cached||c.pending||c.metadataPending||c.metadataCached||!c.members?.includes(connection.session.viewer))throw Error('当前身份无权读取工作进度来源');
 return c;
}
export async function readReportSource(connection,current,collection){
 authorizeSource(connection,current);
 if(typeof connection.session.canvas?.read!=='function')throw Error('当前宿主不支持读取Canvas');
 const [event,library,plan,growth]=await Promise.all([connection.session.canvas.read(TASK_SOURCE),collection.preferences.get('library'),collection.preferences.get('commercial-plan'),collection.preferences.get('growth-draft')]);
 authorizeSource(connection,current);
 const data=buildReportData(event,library,plan,growth);
 const serialized=JSON.stringify({library,plan,growth});
 const bytes=globalThis.crypto?.subtle?new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized))):null;
 const stamp=bytes?Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''):serialized;
 authorizeSource(connection,current);
 return {...data,renderKey:event.id+':'+stamp};
}

export async function saveSharedReport({connection,current,data,record}){
 const access=()=>{const c=authorizeSource(connection,current);if(c.readOnly||!connection.session.canvas?.available||typeof connection.session.canvas.save!=='function')throw Error('当前身份不可保存共享报告');};
 access();
 let block=REPORT_BEGIN+'\n```json\n'+JSON.stringify(record,null,2)+'\n```\n'+REPORT_END;
 reportRecord(block);
 const head=await connection.session.canvas.read(TASK_SOURCE);access();
 if(head?.id!==data.revision)throw Error('来源已变化，草稿保留。请手动更新后核对再保存');
 const previous=reportRecord(head.content),byDay=new Map((previous?.history||[]).map(row=>[row.date,row]));
 if(previous?.asOf&&Object.values(previous.metrics).some(n=>n!==null))byDay.set(previous.asOf.slice(0,10),{date:previous.asOf.slice(0,10),evidence:previous.evidence,metrics:previous.metrics});
 if(record.asOf&&Object.values(record.metrics).some(n=>n!==null))byDay.set(record.asOf.slice(0,10),{date:record.asOf.slice(0,10),evidence:record.evidence,metrics:record.metrics});
 const history=normalizeMetricHistory([...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-730));
 block=REPORT_BEGIN+'\n```json\n'+JSON.stringify({...record,history},null,2)+'\n```\n'+REPORT_END;reportRecord(block);
 const start=head.content.indexOf(REPORT_BEGIN),end=head.content.indexOf(REPORT_END);
 reportRecord(head.content);
 const content=start<0?head.content+'\n\n'+block+'\n':head.content.slice(0,start)+block+head.content.slice(end+REPORT_END.length);
 if(new TextEncoder().encode(content).length>256000)throw Error('来源超过Canvas大小限制');
 const saved=await connection.session.canvas.save(TASK_SOURCE,content,head.id,{preserveApproval:true});access();
 if(!saved?.id||saved.content!==content)throw Error('未确认保存结果，请手动更新核对，勿重复保存');
 const confirmed=await connection.session.canvas.read(TASK_SOURCE);access();
 if(confirmed?.id!==saved.id||confirmed.content!==content)throw Error('保存后来源已有变化，请手动更新核对');
 return confirmed;
}
