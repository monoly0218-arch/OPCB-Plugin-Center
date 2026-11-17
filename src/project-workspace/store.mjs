import {readProject,replaceProject,validateProject} from './model.mjs';
export function boardChannel(connection,id){return connection?.session?.channels.list()?.channels.find(c=>c.id===id)||connection?.session?.channels.get?.(id);}
export function canRead(connection,id){
 const s=connection?.session,list=s?.channels.list(),c=boardChannel(connection,id);
 return !!(connection?.status==='ready'&&!connection.cached&&list?.status==='ready'&&c&&!c.archived&&!c.cached&&!c.pending&&!c.metadataPending&&!c.metadataCached&&['stream','forum',undefined].includes(c.channelType)&&(c.members?.includes(s.viewer)||c.visibility==='public'&&!c.private));
}
export function canWrite(connection,id,project){const s=connection?.session,c=boardChannel(connection,id);return canRead(connection,id)&&c.members?.includes(s.viewer)&&!c.readOnly&&s.canvas?.available&&typeof s.canvas.save==='function'&&(c.creator===s.viewer||project?.ownerId===s.viewer);}
export async function discoverBoardChannels(connection,{signal,valid=()=>true}={}){
 const channels=connection.session.channels;if(!channels.readDirectory||!channels.resolve||!channels.get)return [];
 const directory=await channels.readDirectory({signal});if(signal?.aborted||!valid())return [];if(directory?.partial)throw Error('公开频道目录尚未完整，请刷新后重试');
 const queue=[...(channels.openDirectory?.()||channels.browseDirectory?.()||[])].filter(c=>!c.archived&&['stream','forum',undefined].includes(c.channelType)),ids=[];
 await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length&&!signal?.aborted&&valid()){
  const entry=queue.shift();await channels.resolve([entry.id],{signal});if(signal?.aborted||!valid())return;
  if(canRead(connection,entry.id))ids.push(entry.id);
 }}));return ids;
}
export async function joinBoardChannel({connection,current,id}){
 const valid=()=>{const c=current();return c.session===connection.session&&c.scope===connection.scope&&c.generation===connection.generation&&canRead(c,id);};
 if(!valid())throw Error('身份、连接或频道权限已变化，请刷新');
 const s=connection.session,c=boardChannel(connection,id);if(c.members?.includes(s.viewer))return;
 if(c.visibility!=='public'||c.private)throw Error('私密频道需要管理员邀请后才能进入');
 if(!s.channelLifecycle?.available)throw Error('当前宿主暂不能直接加入频道，请从 Buzz 频道入口加入');
 await s.channelLifecycle.run('join',id,undefined,valid);
 if(!valid()||!boardChannel(current(),id)?.members?.includes(s.viewer))throw Error('频道加入尚未确认，请刷新核对后再进入');
}
export async function saveProject({connection,current,project,headId}){
 const check=()=>{const now=current();if(now.session!==connection.session||now.scope!==connection.scope||now.generation!==connection.generation||!canRead(now,project.id))throw Error('身份、连接或频道权限已变化，请重新读取');return now;};
 check();const session=connection.session,head=await session.canvas.read(project.id);check();
 if((head?.id||null)!==(headId||null))throw Error('频道资料已变化，请刷新后重新编辑；未覆盖其他人的修改');
 const prior=readProject(head,project.id);
 if(!canWrite(check(),project.id,prior))throw Error('仅频道创建者或当前总负责人可修改项目');
 if(prior&&prior.revision!==project.revision)throw Error('项目版本已变化，请重新读取');
 if(project.ownerId!==session.viewer&&!session.channels.list().channels.find(c=>c.id===project.id)?.members.includes(project.ownerId))throw Error('总负责人必须是频道成员');
 const next=validateProject({...project,revision:(prior?.revision??-1)+1},project.id),content=replaceProject(head?.content||'',next);
 check();const saved=await session.canvas.save(project.id,content,head?.id,{preserveApproval:true});check();
 if(!saved?.id||saved.content!==content)throw Error('保存结果未确认，请刷新核对，勿重复提交');
 return {project:readProject(saved,project.id),headId:saved.id};
}
