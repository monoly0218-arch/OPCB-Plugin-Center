import {growthCategories} from './growth-categories.mjs';
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s||'').replace(/｜周洋起草/g,'');
export function reviewState(records=[],hasData=false){
 const statuses=records.map(r=>String(r?.status||''));
 if(statuses.some(s=>/^(needs_changes|needsChanges|changes|blocked|待修改|需修改|返修|受阻)$/.test(s)))return {key:'changes',label:'需修改'};
 if(statuses.length&&statuses.every(s=>/^(accepted|done|approved|已通过|已验收)$/.test(s)))return {key:'approved',label:'已通过'};
 return hasData?{key:'data',label:'有资料'}:{key:'empty',label:'待补'};
}
export function categoryState(D,c){const posts=(D.content||[]).filter(p=>c.posts.includes(p.id));return reviewState(posts,!!(c.templates.length||posts.length));}
const badge=s=>`<span class="review-state status-${s.key}">${s.label}</span>`;
const heading=(name,subtitle='')=>`<div class="growth-section-head"><div><h2>${e(name)}</h2>${subtitle?`<p class="review-subtitle">${e(subtitle)}</p>`:''}</div></div>`;
const task=(D,pattern)=>(D.tasks||[]).find(t=>pattern.test(t.title));
const node=t=>t?[t.date,t.time].filter(Boolean).join(' · ')||'待排期':'待排期';
const block=(name,body)=>`<section class="review-block"><h3>${name}</h3>${body}</section>`;
const safeLink=url=>{try{const u=new URL(url);return ['https:','buzz:'].includes(u.protocol)&&!u.username&&!u.password?e(url):'';}catch{return '';}};
const matches=(name,c)=>{const patterns={countdown:/倒计时|报时|逐日/,launch:/新品|产品|穿越|包装/,holiday:/节日|季节|礼物/};return (patterns[c.id]||new RegExp(c.name)).test(name);};
function references(D,c){
 const videos=(D.videos||[]).filter(v=>matches(v.name,c));
 const playable=videos.filter(v=>safeLink(v.video));
 const notes=(D.plan?.references||[]).filter(v=>matches(v.name,c)&&safeLink(v.url));
 return `<div class="review-video-list">${playable.length?playable.map(v=>`<figure><video controls playsinline preload="metadata" src="${safeLink(v.video)}"${safeLink(v.poster)?` poster="${safeLink(v.poster)}"`:''}></video><figcaption>${e(v.name)}</figcaption></figure>`).join(''):`<div class="review-video-empty"><span>▶</span><strong>${e(c.name)}参考视频</strong><p>待补原片或可播放链接</p></div>`}</div>${notes.length?`<details><summary>已有参考笔记 · 原片仍待核</summary>${notes.map(n=>`<p><a href="${safeLink(n.url)}" target="_blank" rel="noopener noreferrer">${e(n.name)} ↗</a></p>`).join('')}</details>`:''}`;
}
function results(D,c){
 const entries=(D.videos||[]).filter(v=>matches(v.name,c)&&safeLink(v.video||v.source));
 return entries.length?entries.map(v=>`<p><a href="${safeLink(v.video||v.source)}" target="_blank" rel="noopener noreferrer">${e(v.name)} ↗</a> ${badge(reviewState([v],true))}</p>`).join(''):'<p class="review-missing">待交付成片与模板入口</p>';
}
function fourBlocks(D,c,post=null){
 const t=task(D,post?/社群与10篇|内容排期就绪/:/品牌模板定稿/);
 const owners=post?post.owner||'待指定':c.posts.length?'内容：'+[...new Set((D.content||[]).filter(p=>c.posts.includes(p.id)).map(p=>p.owner).filter(Boolean))].join('、'):'待指定';
 return `<div class="review-four">${block('参考视频',references(D,c))}${block('负责人',`<p class="review-main-value">${e(owners||'待指定')}</p>${!post&&t?`<p class="review-subtitle">制作总任务：${e(t.owner)}</p>`:''}`)}${block('时间节点',`<p class="review-main-value">${e(post?[post.date,post.time].filter(Boolean).join(' · ')||'待排期':c.templates.length?node(t):'待排期')}</p><p class="review-subtitle">${post?'笔记计划发布时间':c.templates.length?'模板定稿计划节点':'该类尚未安排'}</p>`)}${block('成果',post?`${post.url&&safeLink(post.url)?`<a href="${safeLink(post.url)}" target="_blank" rel="noopener noreferrer">已登记笔记 ↗</a>`:'<p class="review-missing">待交付笔记与对应成片</p>'}<p class="review-subtitle">${e(post.status||'未登记发布结果')}</p>`:results(D,c))}</div>`;
}
export function reviewDemands(D,state,all=false){
 if(all)return heading('需求池 · 全部12类','点品类查看对应执行内容')+`<div class="review-demand-grid">${growthCategories.map(c=>{const s=categoryState(D,c);return `<button data-growth-demand="${c.id}" class="status-${s.key}"><strong>${e(c.name)}</strong>${badge(s)}<span>${e(c.output)}</span></button>`;}).join('')}</div>`;
 const c=growthCategories.find(c=>c.id===state.growthDemand)||growthCategories[0];
 return heading(c.name,`${c.output} · ${c.templates.length}个模板方案`)+fourBlocks(D,c)+`<details><summary>素材要求与关联笔记</summary><p>替换：${e(c.variables)}</p><p>${e(c.boundary)}</p><div class="review-inline-links">${(D.content||[]).filter(p=>c.posts.includes(p.id)).map(p=>`<button class="pill" data-growth-content="${D.content.indexOf(p)}">${e(p.id)} ${e(clean(p.title))}</button>`).join('')||'该类笔记待安排'}</div></details>`;
}
export function reviewNotes(D,state,all=false){
 const list=D.content||[];
 if(all)return heading('小红书笔记 · 10篇总览','点编号查看单篇；标题可直接修改')+`<div class="restore-title-editor review-note-overview">${list.map((p,i)=>{const s=reviewState([p],true);return `<label><button data-growth-content="${i}" class="status-${s.key}">${e(p.id)}</button><input data-growth-title="${e(p.id)}" aria-label="${e(p.id)}标题草稿" maxlength="160" value="${e(state.growthTitles?.[p.id]??D.growthDraft?.titles?.[p.id]??clean(p.title))}"><span>${e(p.owner||'待指定')} · ${s.label}<br>${e(p.date||'待排期')} ${e(p.time||'')}</span></label>`;}).join('')}</div>`+saveRow(state,D.previewSnapshot);
 const i=Math.min(state.growthContent||0,Math.max(0,list.length-1)),p=list[i];if(!p)return heading('小红书笔记')+'<p>笔记尚未登记</p>';
 const c=growthCategories.find(c=>c.posts.includes(p.id))||{id:'routine',name:'日常栏目',posts:[],templates:[]};
 return heading(`${p.id} · ${c.name}`,p.format||'笔记执行细节')+`<label class="review-title-input">笔记标题<input data-growth-title="${e(p.id)}" aria-label="${e(p.id)}标题草稿" maxlength="160" value="${e(state.growthTitles?.[p.id]??D.growthDraft?.titles?.[p.id]??clean(p.title))}"></label>`+saveRow(state,D.previewSnapshot)+fourBlocks(D,c,p);
}
function saveRow(state,shared=false){return `<div class="restore-save"><button class="pill" data-growth-save>保存标题草稿</button><span class="growth-save-note" role="status">${e(state.growthDraftStatus||(shared?'保存后共享 · 正式排期不变':'本机草稿，原排期不改'))}</span></div>`;}
export function reviewExperience(D,state,key){
 const c=growthCategories.find(c=>c.id===state.growthDemand)||growthCategories[0];
 if(key==='gate'||key==='result')return heading(`${c.name} · 视频领取`,'两种承接方案，待确认入口')+`<div class="review-receive"><section><h3>入群领取视频</h3><ol><li>视频生成后点击「入群领取」</li><li>进入对应群，自动关联本次任务</li><li>成员与任务核验后，系统自动发视频</li></ol><button class="pill" disabled>群入口与自动发送待接</button></section><section><h3>企业微信客服领取</h3><ol><li>视频生成后点击「联系客服领取」</li><li>一键进入企业微信客服会话</li><li>自动带入任务号，交付对应视频</li></ol><button class="pill" disabled>客服入口待配置</button></section></div><details><summary>需要接通的内容</summary><p>群／客服真实入口、任务与用户对应关系、视频链接权限、发送结果与失败重发。自动发送尚未接通。</p><p>本次补充下载领取方案；生成前关注与入群的现行规则是否调整，仍待本人定选。</p></details>`;
 return heading(`体验${c.name}`,c.output)+`<div class="review-product-steps"><span>选择${e(c.name)}模板</span><span>替换${e(c.variables.split(' / ').slice(0,2).join('、'))}</span><span>生成${e(c.output.split('秒')[0])}秒视频</span></div>`+fourBlocks(D,c)+`<button class="pill" data-growth-select="result">查看视频领取方案 →</button>`;
}
