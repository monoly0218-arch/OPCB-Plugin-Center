import {readProject,replaceProject,validateProject} from './model.mjs';
export function canRead(connection,id){
 const s=connection?.session,list=s?.channels.list(),c=list?.channels.find(c=>c.id===id);
 return !!(connection?.status==='ready'&&!connection.cached&&list?.status==='ready'&&c&&!c.archived&&!c.cached&&!c.pending&&!c.metadataPending&&!c.metadataCached&&c.channelType!=='solo'&&c.members?.includes(s.viewer));
}
export function canWrite(connection,id,project){const s=connection?.session,c=s?.channels.list().channels.find(c=>c.id===id);return canRead(connection,id)&&!c.readOnly&&s.canvas?.available&&typeof s.canvas.save==='function'&&(c.creator===s.viewer||project?.ownerId===s.viewer);}
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
