// Only explicitly registered company-level projects belong on the executive board.
export const MARKER='opcb-project-workspace';
export const SUMMARY_LIMIT=40;
export const summaryLength=value=>Array.from(value||'').length;
export function validateSummary(value=''){
 if(typeof value!=='string'||/[\r\n\u2028\u2029]/u.test(value)||summaryLength(value)>SUMMARY_LIMIT)throw Error('一句话进度限40字（含标点），请写在一行');
 return value;
}
// Old summaries remain readable. Every changed or newly registered summary uses the short format.
export function validateSummaryUpdate(project,prior){
 if(!prior||project.summary!==prior.summary)validateSummary(project.summary||'');
 for(const item of project.workstreams||[]){const old=prior?.workstreams?.find(w=>w.id===item.id);if(!old||item.summary!==old.summary)validateSummary(item.summary||'');}
}

export const STATUS={planning:'待开始',doing:'进行中',blocked:'受阻',review:'待验收',done:'已验收'};
export const EVENT_TYPES={milestone:'项目节点',travel:'出差',leave:'请假',meeting:'会议'};
const block=/^```opcb-project-workspace\s*\n([\s\S]*?)^```[ \t]*$/gm;
export const dateValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const text=(v,max=8000)=>typeof v==='string'&&v.length<=max;
export function validateProject(value,channelId){
 const p=structuredClone(value);
 if(!p||p.schema!==1||p.id!==channelId||p.level!=='company'||!Number.isSafeInteger(p.revision)||p.revision<0||!text(p.title,180)||!p.title.trim()||!text(p.owner,120)||!p.owner.trim()||!text(p.ownerId,128)||!p.ownerId||!Object.hasOwn(STATUS,p.status))throw Error('顶层任务资料格式无效');
 if(!text(p.company??'',120))throw Error('所属公司名称格式无效');
 if(!text(p.responsible??'',120))throw Error('频道负责人名称格式无效');
 for(const key of ['goal','summary','blocker','decision'])if(!text(p[key]||''))throw Error('任务文字过长或格式无效');
 if(p.createdOn!==undefined&&(!dateValid(p.createdOn)||typeof p.createdOnSource!=='string'||!/^buzz:\/\/message\?channel=[^&]+&id=[0-9a-f]{64}$/.test(p.createdOnSource)))throw Error('频道创建日期须有有效日期与确认来源');
 for(const key of ['start','due'])if(p[key]&&!dateValid(p[key]))throw Error('项目日期无效');
 if(p.start&&p.due&&p.start>p.due)throw Error('项目结束日期不能早于开始日期');
 if(!Array.isArray(p.stages)||p.stages.length>12||!Array.isArray(p.tasks)||p.tasks.length>400||!Array.isArray(p.events)||p.events.length>300||!Array.isArray(p.artifacts)||p.artifacts.length>400)throw Error('项目记录数量或格式无效');
 const workstreams=p.workstreams??[];
 if(!Array.isArray(workstreams)||workstreams.length>100)throw Error('分项任务数量或格式无效');
 const workstreamIds=new Set();
 for(const w of workstreams){
  if(!text(w.id,128)||!w.id||workstreamIds.has(w.id)||!text(w.title,240)||!w.title.trim()||!text(w.owner||'',120)||!text(w.summary||'',500)||!text(w.channelId??'',128))throw Error('分项任务格式无效');
  for(const key of ['start','end'])if(w[key]&&!dateValid(w[key]))throw Error('分项任务日期无效');
  if(w.end&&(!w.start||w.end<w.start))throw Error('分项结束日期不能早于开始日期');
  workstreamIds.add(w.id);
 }
 const stageIds=new Set(),taskIds=new Set();
 for(const s of p.stages){if(!text(s.id,128)||!s.id||stageIds.has(s.id)||!text(s.title,180)||!s.title.trim())throw Error('阶段名称或编号无效');stageIds.add(s.id);}
 for(const t of p.tasks){if(!text(t.id,128)||!t.id||taskIds.has(t.id)||!stageIds.has(t.stage)||!text(t.title,240)||!t.title.trim()||!text(t.owner||'',120)||!text(t.description||'')||!text(t.channelId||'',128)||!Object.hasOwn(STATUS,t.status)||t.due&&!dateValid(t.due)||t.workstreamId&&!workstreamIds.has(t.workstreamId))throw Error('执行任务格式无效');taskIds.add(t.id);}
 const eventIds=new Set();
 for(const e of p.events){if(!text(e.id,128)||!e.id||eventIds.has(e.id)||!text(e.title,240)||!e.title.trim()||!Object.hasOwn(EVENT_TYPES,e.type)||!dateValid(e.date)||e.end&&(!dateValid(e.end)||e.end<e.date)||!text(e.owner||'',120))throw Error('日历记录格式无效');eventIds.add(e.id);}
 const artifactIds=new Set();
 for(const a of p.artifacts){if(!text(a.id,1024)||!a.id||artifactIds.has(a.id)||!text(a.name,240)||!a.name.trim()||!safeUrl(a.url)||a.stage&&!stageIds.has(a.stage)||!text(a.version||'',120)||!['draft','approved'].includes(a.status)||!text(a.messageId||'',128))throw Error('产物记录格式无效');artifactIds.add(a.id);}
 return p;
}
export function readProject(event,channelId){
 const matches=[...(event?.content||'').matchAll(new RegExp(block.source,block.flags))];
 if(!matches.length)return null;
 if(matches.length!==1)throw Error('频道存在重复项目记录，请先核对');
 let data;try{data=JSON.parse(matches[0][1]);}catch{throw Error('频道项目记录损坏，未覆盖原资料');}
 return validateProject(data,channelId);
}
export function replaceProject(content,project){
 validateProject(project,project.id);
 const matches=[...content.matchAll(new RegExp(block.source,block.flags))];
 if(matches.length>1)throw Error('频道存在重复项目记录');
 // Do not silently overwrite an unrecognized or damaged existing document.
 if(matches.length)readProject({content},project.id);
 const next='```'+MARKER+'\n'+JSON.stringify(project,null,2)+'\n```';
 const result=matches.length?content.slice(0,matches[0].index)+next+content.slice(matches[0].index+matches[0][0].length):content+(content?'\n\n':'')+next+'\n';
 if(new TextEncoder().encode(result).length>256000)throw Error('频道资料超过保存上限');
 return result;
}
export function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
// Business responsibility is a display assignment, independent of membership and editing rights.
export const responsibleName=p=>p.responsible?.trim()||p.owner;
export function groupProjects(projects,query='',owner=''){
 const q=query.trim().toLocaleLowerCase();const result=new Map();
 for(const p of projects){if(p.level!=='company'||owner&&p.ownerId!==owner||q&&![p.title,responsibleName(p),p.summary,p.goal].join(' ').toLocaleLowerCase().includes(q))continue;const key=p.responsible?.trim()?'responsible:'+responsibleName(p):p.ownerId;if(!result.has(key))result.set(key,{id:key,name:responsibleName(p),projects:[]});result.get(key).projects.push(p);}
 return [...result.values()];
}
export function calendarEvents(projects){return projects.flatMap(p=>[
 ...(p.due?[{id:p.id+':due',title:p.title,type:'milestone',date:p.due,owner:p.owner,projectId:p.id,projectTitle:p.title,root:true}]:[]),
 ...p.events.map(e=>({...e,projectId:p.id,projectTitle:p.title})),
 ...p.tasks.filter(t=>t.due).map(t=>({id:p.id+':'+t.id,title:t.title,type:'task',date:t.due,owner:t.owner,projectId:p.id,projectTitle:p.title,taskId:t.id}))]);}
export function newProject(channel,viewer,name='') {return {schema:1,revision:0,id:channel.id,level:'company',title:channel.name,owner:name||'项目负责人',ownerId:viewer,status:'planning',goal:'',summary:'',blocker:'',decision:'',start:null,due:null,workstreams:[],stages:[{id:'A',title:'目标与准备'},{id:'B',title:'制作与执行'},{id:'C',title:'验证与交付'},{id:'D',title:'复盘与沉淀'}],tasks:[],events:[],artifacts:[]};}

// Inclusive calendar day count: start day is day 1; completed work freezes on its recorded end date.
// Missing/future dates remain unknown instead of borrowing a project date or implying hours worked.
export function elapsedDays(item,today){
 if(!dateValid(item?.start)||!dateValid(today)||item.start>today||item.end&&!dateValid(item.end))return null;
 const end=item.end&&item.end<today?item.end:today;
 if(end<item.start)return null;
 return Math.floor((Date.parse(end+'T00:00:00Z')-Date.parse(item.start+'T00:00:00Z'))/86400000)+1;
}

// Roles come from explicitly assigned management tasks, never the root owner or execution activity.
export function groupWorkstreams(items=[]){
 const groups=new Map();
 for(const item of items){const name=item.owner?.trim()||'负责人待分配';if(!groups.has(name))groups.set(name,{name,items:[]});groups.get(name).items.push(item);}
 return [...groups.values()];
}

// Company is an explicit display grouping, never inferred from channel titles or used as an access grant.
export const companyName=project=>project.company?.trim()||'';
export function groupCompanies(projects=[]){
 const companies=new Map();
 for(const project of projects){
  if(project.level!=='company')continue;
  const id=companyName(project);
  if(!companies.has(id))companies.set(id,{id,name:id||'公司待登记',projects:[]});
  companies.get(id).projects.push(project);
 }
 return [...companies.values()];
}

// A board task is one explicitly registered, readable channel, never a nested workstream.
export function channelTasks(projects=[]){return [...new Map(projects.filter(p=>p.level==='company').map(p=>[p.id,p])).values()];}
// Native ChannelSummary.createdAt is relay-written Unix seconds, not metadata updates/activity.
export function channelTaskStats(projects=[],channels=[],today){
 if(!dateValid(today))throw Error('统计日期无效');
 const tasks=channelTasks(projects),roster=new Map(channels.map(c=>[c.id,c]));
 const day=new Date(today+'T00:00:00Z'),offset=(day.getUTCDay()+6)%7;
 const weekStart=new Date(day.getTime()-offset*86400000).toISOString().slice(0,10),monthStart=today.slice(0,7)+'-01';
 let month=0,week=0,unknown=0;
 for(const task of tasks){
  const created=channelCreatedDate(roster.get(task.id),task)?.date;
  if(!created){unknown++;continue;}
  if(created<=today&&created>=monthStart)month++;
  if(created<=today&&created>=weekStart)week++;
 }
 return {total:tasks.length,month,week,unknown,monthStart,weekStart};
}

// Native relay creation takes priority. A day-only fallback must be explicitly registered with its confirmation source.
const shanghaiDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function channelCreatedDate(channel,project){
 const stamp=channel?.createdAt;
 if(typeof stamp==='number'&&Number.isSafeInteger(stamp)&&stamp>=0&&!isNaN(new Date(stamp*1000).getTime()))return {date:shanghaiDate(stamp*1000),dateTime:new Date(stamp*1000).toISOString(),timestamp:stamp*1000,native:true};
 if(dateValid(project?.createdOn)&&typeof project.createdOnSource==='string'&&/^buzz:\/\/message\?channel=[^&]+&id=[0-9a-f]{64}$/.test(project.createdOnSource))return {date:project.createdOn,dateTime:project.createdOn,native:false};
 return null;
}
// Inclusive Shanghai calendar days: the creation date is day 1. No fabricated time-of-day for confirmed dates.
export function channelAge(channel,now=Date.now(),project){
 const created=channelCreatedDate(channel,project);
 if(!Number.isFinite(now)||isNaN(new Date(now).getTime())||!created||created.timestamp>now)return {known:false,text:'创建时间未知'};
 const days=elapsedDays({start:created.date},shanghaiDate(now));
 if(days===null)return {known:false,text:'创建时间未知'};
 return {known:true,text:`${days} 天`,dateTime:created.dateTime,title:`创建于 ${created.date}（北京时间；创建当天计第 1 天${created.native?'':'，本人确认日期'}）`};
}
