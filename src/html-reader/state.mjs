export const COLLECTION = {name:'html-reader-workspace',type:'opcb.html-reader.workspace',version:1,project:()=>[]};
export const PREFERENCE = 'reader-state';
export const MAX_BYTES = 50 * 1024 * 1024;
const hex = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
export function place(channel,root=null){
 if(typeof channel!=='string'||!channel||channel.length>200||root!=null&&!hex(root))throw Error('会话位置无效');
 return {channel,root:root||null};
}
export const placeKey = p => JSON.stringify([p.channel,p.root||null]);
export function canRead(channel,viewer){return !!viewer&&!!channel&&!channel.archived&&!channel.cached&&!channel.pending&&!channel.metadataPending&&!channel.metadataCached&&Array.isArray(channel.members)&&channel.members.includes(viewer);}
export function guardConnection(ctx,connection){const now=ctx.relay.snapshot();if(now.status!=='ready'||now.cached||!now.session?.viewer||now.session!==connection.session||now.scope!==connection.scope||now.generation!==connection.generation)throw Error('身份或社区已变化');}
export function guardPlace(connection,p,agent){const list=connection.session.channels.list(),c=list.channels.find(c=>c.id===p.channel);if(list.status!=='ready'||!canRead(c,connection.session.viewer)||agent&&!c.members.includes(agent))throw Error('当前身份无权读取此会话');return c;}
// Solo composers are flat even when a link opening carries a message root.
export function readingPlace(connection,channel,root){const c=guardPlace(connection,place(channel));return place(channel,c.channelType==='solo'?null:root);}
export function isHtml(file){try{const u=new URL(file?.url);return u.protocol==='https:'&&!u.username&&!u.password&&(/\.html?(?:[?#]|$)/i.test(file.url)||/\.html?$/i.test(file.name||'')||/^text\/html(?:;|$)/i.test(file.mime||''));}catch{return false;}}
export function chooseSource(row,url){
 const candidates=[...(row.attachments||[])].filter(isHtml);
 // The host may retain an HTML link as Markdown instead of an attachment.
 for(const match of String(row.sourceContent||row.content||'').matchAll(/https:\/\/[^\s<>"'()]+\.html?(?:\?[^\s<>"'()]*)?/g))if(!candidates.some(x=>x.url===match[0]))candidates.push({url:match[0],name:'HTML 文档',mime:'text/html'});
 const found=url?candidates.find(x=>x.url===url):candidates.length===1?candidates[0]:null;
 if(!found||found.size>MAX_BYTES)throw Error('原消息中没有此 HTML，或文件超过 50 MB');
 return {message:row.id,channel:row.channelId,root:row.threadRootId||null,url:found.url,name:String(found.name||'HTML 文档').slice(0,160),mime:found.mime||'text/html',version:row.attachmentSourceId||row.id};
}
export function inPlace(row,p){return row.channelId===p.channel&&(p.root?row.id===p.root||row.threadRootId===p.root:!row.threadRootId);}
export async function exactSource(connection,source,check){
 check();guardPlace(connection,place(source.channel,source.root));
 const thread=connection.session.thread(source.channel,source.message,{exact:true});
 try{await thread.refresh();check();guardPlace(connection,place(source.channel,source.root));const s=thread.snapshot(),row=s.target;if(s.targetStatus!=='ready'||row?.id!==source.message||row.channelId!==source.channel||row.delivery&&!['accepted','seen'].includes(row.delivery))throw Error('来源已删除或无权读取');const next=chooseSource(row,source.url);if(source.version!==next.version)throw Error('来源版本已变化，请从消息重新打开');return next;}finally{thread.dispose();}
}
export function emptyState(owner){return {schema:1,owner,revision:0,entries:[],bindings:{},last:null};}
export function validateSource(source){if(!source||!hex(source.message)||!hex(source.version)||!isHtml(source)||source.name?.length>160)throw Error('HTML 来源记录无效');place(source.channel,source.root);return source;}
export function validateState(raw,owner){
 if(raw==null)return emptyState(owner);
 if(raw.schema!==1||raw.owner!==owner||!Number.isSafeInteger(raw.revision)||raw.revision<0||!Array.isArray(raw.entries)||raw.entries.length>100||!raw.bindings||typeof raw.bindings!=='object'||Array.isArray(raw.bindings)||Object.keys(raw.bindings).length>100)throw Error('个人阅读记录无效');
 const ids=new Set();for(const e of raw.entries){if(!hex(e.id)||ids.has(e.id)||typeof e.favorite!=='boolean'||!Number.isFinite(e.openedAt)||e.openedIn&&(!Array.isArray(e.openedIn)||e.openedIn.length>100||e.openedIn.some(k=>typeof k!=='string'||k.length>400)))throw Error('个人阅读记录无效');ids.add(e.id);validateSource(e.source);}
 for(const [k,b] of Object.entries(raw.bindings)){if(placeKey(place(b.channel,b.root))!==k||!ids.has(b.id)||!Number.isSafeInteger(b.revision)||b.revision<1)throw Error('会话绑定记录无效');}
 if(raw.last!==null&&(!raw.last||!ids.has(raw.last.id)||!raw.bindings[placeKey(place(raw.last.channel,raw.last.root))]))throw Error('最近阅读记录无效');
 return raw;
}
export async function sourceId(source){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([source.channel,source.message,source.url,source.version])));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function selected(state,p){const b=state.bindings[placeKey(p)];return b?{...b,entry:state.entries.find(e=>e.id===b.id)}:null;}
export function selectSource(state,p,source,id,now=Date.now(),expected){
 const key=placeKey(p),old=state.bindings[key];
 if(expected!==undefined&&(old?.revision||0)!==expected)throw Error('你已切换阅读内容，本次更新未覆盖当前选择');
 const prior=state.entries.find(e=>e.id===id),entry={...prior,id,source,favorite:prior?.favorite||false,openedAt:now,openedIn:[key,...(prior?.openedIn||[]).filter(k=>k!==key)].slice(0,100)};
 let entries=[entry,...state.entries.filter(e=>e.id!==id)];
 if(entries.filter(e=>e.favorite).length>40)throw Error('收藏已满，请先移除一项收藏');
 entries=entries.filter((e,i)=>e.favorite||i<60).slice(0,100);
 const allowed=new Set(entries.map(e=>e.id));const bindings=Object.fromEntries(Object.entries(state.bindings).filter(([,b])=>allowed.has(b.id)));
 const binding={...p,id,revision:(old?.revision||0)+1,selectedAt:now};bindings[key]=binding;
 // Bound per conversation, independent from the most recently opened page.
 if(Object.keys(bindings).length>100)delete bindings[Object.keys(bindings).find(k=>k!==key)];
 return {...state,revision:state.revision+1,entries,bindings,last:binding};
}
export function toggleFavorite(state,id){const target=state.entries.find(e=>e.id===id);if(!target)throw Error('文档已不在记录中');if(!target.favorite&&state.entries.filter(e=>e.favorite).length>=40)throw Error('收藏已满，请先移除一项收藏');return {...state,revision:state.revision+1,entries:state.entries.map(e=>e.id===id?{...e,favorite:!e.favorite}:e)};}
export function visibleEntries(state,connection,p,filter){return state.entries.filter(e=>{try{guardPlace(connection,place(e.source.channel,e.source.root));return filter==='favorites'?e.favorite:filter==='session'?!!p&&(e.openedIn?e.openedIn.includes(placeKey(p)):e.source.channel===p.channel&&(p.root?e.source.root===p.root||e.source.message===p.root:!e.source.root)):true;}catch{return false;}}).sort((a,b)=>b.openedAt-a.openedAt);}
export async function agentContext(ctx,client,context){
 if(!client.signal||!context.channel)throw Error('需要宿主会话与取消信号');
 const relay=ctx.agents.relay(client.key),connection=relay?.snapshot(),owner=ctx.relay.snapshot();const p=place(context.channel,context.topLevel||context.wholeChannel?null:context.root);
 const check=()=>{client.signal.throwIfAborted();const now=relay?.snapshot();guardConnection(ctx,owner);if(connection?.status!=='ready'||connection.cached||now?.session!==connection.session||now.scope!==connection.scope||now.generation!==connection.generation||owner.session.viewer!==client.owner||connection.session.viewer!==client.owner||owner.scope!==connection.scope)throw Error('Agent 身份或社区已变化');guardPlace(connection,p,client.pubkey);guardPlace(owner,p,client.pubkey);};check();return {connection,owner,p,check};
}
