// Existing schema/collection compatibility; no bundled team content.
export const REPORT_TITLE = 'OPCB 平台商业化计划与报告';
export const COMMERCIAL_METRICS = ['posts','views','arrivals','codeUsers','starts','successes','saves','registrations','paidUsers','willingToShare','repeatUsers','qualifiedOutputs','attempts','revenue','refunds','generationCost','acquisitionCost','subsidyCost','otherCost','follows','groupJoins','gatePassed','accountReturns','groupReturns','usableTemplates','characters','looks','chainTests','publishedUsers','publishedNotes','completionRate'];
export function emptyCommercialPlan() {
  return { schema:1, title:REPORT_TITLE, timezone:'Asia/Shanghai', launchDate:'2026-11-17', launchStatus:'方案待确认', updatedAt:'', intro:'请导入经授权的计划JSON；日期切换只用于排期，不代表实际已经上线。', goals:[], people:[], tasks:[], content:[], references:[], assumptions:[], sources:[], costNotes:[], metricDefinitions:[], researchGap:'', budget:{unitCost:40,freeTimes:1,trialUsers:20,paidGoal:20,paidConversion:20,mediaBudget:100,approved:false}, metrics:{}, metricsAsOf:'',metricsEvidence:'' };
}
export function shiftCommercialDate(date, offset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('日期格式应为YYYY-MM-DD');
  const value = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(value.valueOf()) || value.toISOString().slice(0,10) !== date) throw Error('日期无效');
  value.setUTCDate(value.getUTCDate()+offset); return value.toISOString().slice(0,10);
}
export function normalizeCommercialPlan(input) {
  if (!input || input.schema !== 1 || !Array.isArray(input.tasks) || !Array.isArray(input.content)) throw Error('需要schema=1及tasks/content数组');
  const defaults=emptyCommercialPlan();
  const str=(v,n=4000)=>typeof v==='string'?v.slice(0,n):'';
  const url=v=>{if(!v)return '';if(typeof v!=='string')throw Error('链接格式无效');const x=new URL(v);if(!['https:','buzz:'].includes(x.protocol))throw Error('仅允许HTTPS和Buzz证据链接');return v.slice(0,4000);};
  const number=(v,max=1e9)=>{if(v===''||v===null||v===undefined)return null;if(typeof v==='boolean')throw Error('数值无效');const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)throw Error('数值超出范围');return n;};
  const date=str(input.launchDate)||defaults.launchDate;shiftCommercialDate(date,0);
  if(input.tasks.length>200||input.content.length>200)throw Error('最多200条任务或内容');
  const ids=new Set();
  const tasks=input.tasks.map(t=>{const id=str(t.id,100);if(!id||ids.has(id)||!str(t.title))throw Error('任务编号重复或标题为空');ids.add(id);const a=number(t.fromDay<0?-t.fromDay:t.fromDay,365),b=number(t.toDay<0?-t.toDay:t.toDay,365);if(a===null||b===null||!Number.isInteger(t.fromDay)||!Number.isInteger(t.toDay)||t.fromDay>t.toDay)throw Error('任务日期范围无效');return {id,title:str(t.title),owner:str(t.owner),fromDay:t.fromDay,toDay:t.toDay,time:str(t.time),deliverable:str(t.deliverable),acceptance:str(t.acceptance),note:str(t.note),status:str(t.status)||'计划待执行',evidence:url(t.evidence)};});
  const metrics={};for(const k of COMMERCIAL_METRICS)metrics[k]=number(input.metrics?.[k]);
  const b=input.budget||defaults.budget;const budget={};for(const k of ['unitCost','freeTimes','trialUsers','paidGoal','paidConversion','mediaBudget'])budget[k]=number(b[k])??defaults.budget[k];
  if(budget.unitCost<=0||![1,2].includes(budget.freeTimes)||budget.paidConversion<=0||budget.paidConversion>100||!Number.isInteger(budget.trialUsers)||!Number.isInteger(budget.paidGoal))throw Error('成本须大于0，免费1或2次，人数须为整数，付费转化率须在0至100之间');budget.approved=b.approved===true;
  const postMetrics={};if(input.postMetrics){if(typeof input.postMetrics!=='object'||Array.isArray(input.postMetrics)||Object.keys(input.postMetrics).length>200)throw Error('帖子指标格式无效');for(const [id,row] of Object.entries(input.postMetrics)){if(!/^C\d{2,3}$/.test(id)||!row||!row.asOf||!row.evidence)throw Error('帖子指标需要编号、统计日期和证据');shiftCommercialDate(row.asOf,0);const proof=new URL(row.evidence);if(proof.username||proof.password)throw Error('证据不可包含凭据');const values={};for(const k of ['arrivals','paidUsers','revenue','cost'])values[k]=number(row[k]);postMetrics[id]={...values,asOf:row.asOf,evidence:url(row.evidence)};}}
  const strings=key=>Array.isArray(input[key])?input[key].slice(0,100).map(v=>str(v)):[];
  return {...defaults,title:str(input.title)||REPORT_TITLE,timezone:'Asia/Shanghai',launchDate:date,launchStatus:str(input.launchStatus),updatedAt:str(input.updatedAt),intro:str(input.intro),goals:strings('goals'),assumptions:strings('assumptions'),costNotes:strings('costNotes'),tasks,budget,metrics,postMetrics,metricsAsOf:str(input.metricsAsOf),metricsEvidence:url(input.metricsEvidence),researchGap:str(input.researchGap),
    people:(input.people||[]).slice(0,40).map(x=>({name:str(x.name),role:str(x.role),boundary:str(x.boundary)})),
    content:input.content.map(x=>{if(!Number.isInteger(x.day)||x.day<0||x.day>365)throw Error('内容日期无效');return {id:str(x.id),day:x.day,time:str(x.time),title:str(x.title),format:str(x.format),tags:str(x.tags),topic:str(x.topic),owner:str(x.owner),route:str(x.route),status:str(x.status),url:url(x.url)};}),
    references:(input.references||[]).slice(0,100).map(x=>({name:str(x.name),kind:str(x.kind),url:url(x.url),why:str(x.why),verified:str(x.verified)})),
    sources:(input.sources||[]).slice(0,50).map(x=>({title:str(x.title),url:url(x.url),note:str(x.note)})),
    metricDefinitions:(input.metricDefinitions||[]).slice(0,40).map(x=>[str(x[0]),str(x[1]),str(x[2])])};
}
export function commercialScenario(budget) {
  const b=normalizeCommercialPlan({...emptyCommercialPlan(),budget}).budget;
  const subsidy=b.unitCost*b.freeTimes*b.trialUsers;
  const needed=Math.ceil(b.paidGoal/(b.paidConversion/100));
  return {subsidy,total:subsidy+b.mediaBudget,expectedPaid:b.trialUsers*b.paidConversion/100,neededTrials:needed,neededSubsidy:needed*b.freeTimes*b.unitCost,markupPrice:b.unitCost*1.15,markupMargin:0.15/1.15,margin15Price:b.unitCost/0.85};
}

// Pure helpers are exported for validation; activation owns all host access.
export function brandCategories() {
  return [
    { id: "texture", title: "产品质感展示", hint: "材质、光影、产品特写" },
    { id: "usage", title: "产品使用场景", hint: "饮用、穿搭、日常使用" },
    { id: "story", title: "品牌故事／工艺", hint: "品牌来历、制作过程、工艺细节" },
    { id: "launch", title: "上新促销", hint: "新品、活动、品牌倒计时" },
    { id: "other", title: "其他／待归类", hint: "保留生日等已有内容" },
  ];
}
export function normalizeLibrary(input) {
  if (!input || !Array.isArray(input.templates) || !Array.isArray(input.screens)) throw Error("文件需要包含 templates 和 screens 数组");
  const categories = brandCategories().map(row => row.id);
  const existing = { washer: "usage", wipe: "texture", car: "usage", cinema: "texture", birthday: "other" };
  const safeURL = (value, media) => {
    if (!value) return "";
    if (typeof value !== "string") throw Error("素材地址格式不正确");
    if (media && value.startsWith("data:" + media + "/") && /^data:(?:image\/(?:png|jpeg|webp)|video\/mp4);base64,[A-Za-z0-9+/=\s]+$/.test(value)) return value;
    const url = new URL(value);
    if (url.protocol === "https:" || (!media && url.protocol === "buzz:")) return value;
    throw Error("仅支持 HTTPS 素材、内嵌图片/MP4 和 Buzz 记录链接");
  };
  const string = value => typeof value === "string" ? value.slice(0, 4000) : "";
  const keys = new Set();
  const templates = input.templates.map((row, i) => {
    if (!row || typeof row !== "object" || !string(row.name).trim()) throw Error("每个模板需要名称");
    const key = string(row.key) || `import-${i}`;
    if (keys.has(key)) throw Error("模板编号重复，请先检查文件");
    keys.add(key);
    return { key, name: string(row.name).trim(), category: categories.includes(row.category) ? row.category : existing[key] || "other",
      status: string(row.status) || "待确认", description: string(row.description), note: string(row.note),
      source: safeURL(row.source), poster: safeURL(row.poster, "image"), video: safeURL(row.video, "video") };
  });
  const screens = input.screens.map(row => ({ title: string(row.title), note: string(row.note), image: safeURL(row.image, "image") }));
  return { schema: 1, templates, screens };
}
export function filterTemplates(library, category) {
  const order = brandCategories().map(row => row.id);
  return library.templates.filter(row => category === "all" || row.category === category)
    .slice().sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
}

