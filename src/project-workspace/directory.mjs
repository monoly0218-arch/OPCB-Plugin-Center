import {canRead,canReadCanvas,boardChannel} from './store.mjs';
const MARKER='opcb-project-directory',block=/^```opcb-project-directory\s*\n([\s\S]*?)^```[ \t]*$/gm;
const idValid=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function validateDirectory(value,id){
 if(!value||Object.keys(value).sort().join(',')!=='entries,id,revision,schema'||value.schema!==1||value.id!==id||!idValid(id)||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.entries)||value.entries.length>400)throw Error('共享目录格式无效');
 const seen=new Set();for(const e of value.entries){if(!e||Object.keys(e).sort().join(',')!=='channelId,company,title'||!idValid(e.channelId)||e.channelId===id||seen.has(e.channelId)||!text(e.title,180)||!e.title.trim()||!text(e.company,120))throw Error('共享目录条目无效；仅可包含频道编号、公开名称和品牌');seen.add(e.channelId);}
 return structuredClone(value);
}
export function readDirectory(event,id){
 const matches=[...(event?.content||'').matchAll(new RegExp(block.source,block.flags))];if(!matches.length)return null;if(matches.length!==1)throw Error('频道有重复共享目录，请先核对');
 let data;try{data=JSON.parse(matches[0][1]);}catch{throw Error('共享目录损坏，未覆盖');}return validateDirectory(data,id);
}
export function replaceDirectory(content,directory){
 validateDirectory(directory,directory.id);const matches=[...content.matchAll(new RegExp(block.source,block.flags))];if(matches.length>1)throw Error('频道有重复共享目录');if(matches.length)readDirectory({content},directory.id);
 const next='```'+MARKER+'\n'+JSON.stringify(directory,null,2)+'\n```',result=matches.length?content.slice(0,matches[0].index)+next+content.slice(matches[0].index+matches[0][0].length):content+(content?'\n\n':'')+next+'\n';
 if(new TextEncoder().encode(result).length>256000)throw Error('共享目录超过保存上限');return result;
}
const channelAdmin=(c,viewer)=>!!(c?.creator===viewer||c?.owners?.includes(viewer)||['owner','admin'].includes(c?.viewerRole));
export function canManageDirectory(connection,id){const c=boardChannel(connection,id),s=connection?.session;return !!(canReadCanvas(connection,id)&&c.visibility==='public'&&!c.private&&c.viewerRole!=='guest'&&!c.readOnly&&channelAdmin(c,s.viewer)&&s.canvas?.available&&typeof s.canvas.save==='function');}
export function canPublishPrivate(connection,id){const c=boardChannel(connection,id),s=connection?.session;return !!(canReadCanvas(connection,id)&&(c.visibility==='private'||c.private)&&c.viewerRole!=='guest'&&!c.readOnly&&channelAdmin(c,s.viewer));}
export function lockedDirectoryEntries(catalogs,connection){
 const entries=new Map();for(const catalog of [...catalogs].sort((a,b)=>a.id.localeCompare(b.id))){const c=boardChannel(connection,catalog.id);if(!canReadCanvas(connection,catalog.id)||c.visibility!=='public'||c.private)continue;
  for(const e of catalog.entries)if(!canRead(connection,e.channelId)&&!entries.has(e.channelId))entries.set(e.channelId,{...e,directoryId:catalog.id});
 }return [...entries.values()];
}
export async function saveDirectoryEntry({connection,current,directoryId,headId,revision,entry,removeId}){
 const check=()=>{const now=current();if(now.session!==connection.session||now.scope!==connection.scope||now.generation!==connection.generation||!canManageDirectory(now,directoryId))throw Error('共享目录权限或身份已变化，请刷新');return now;};
 check();if(!!entry===!!removeId)throw Error('请选择登记或撤回其中一种操作');
 const s=connection.session,head=await s.canvas.read(directoryId);check();if((head?.id||null)!==(headId||null))throw Error('共享目录已变化，请刷新后重试；未覆盖其他人的修改');
 const prior=readDirectory(head,directoryId);if(!prior||prior.revision!==revision)throw Error('共享目录版本已变化，请刷新');
 if(entry&&!canPublishPrivate(check(),entry.channelId))throw Error('仅私密频道管理员可以主动公开该频道名称');
 const next=validateDirectory({...prior,revision:prior.revision+1,entries:entry?[...prior.entries.filter(e=>e.channelId!==entry.channelId),entry]:prior.entries.filter(e=>e.channelId!==removeId)},directoryId);
 const content=replaceDirectory(head.content,next);check();if(entry&&!canPublishPrivate(current(),entry.channelId))throw Error('私密频道管理权限已变化');
 const saved=await s.canvas.save(directoryId,content,head.id,{preserveApproval:true});check();if(!saved?.id||saved.content!==content)throw Error('共享目录保存未确认，请刷新核对，勿重复提交');
 return {directory:readDirectory(saved,directoryId),headId:saved.id};
}
