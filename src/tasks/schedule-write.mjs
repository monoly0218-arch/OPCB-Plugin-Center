import {saveFlow} from './lifecycle.mjs';
import {TASK_SOURCE} from './source.mjs';
export async function saveTaskSchedule({session,check,data,id,date,times,expectedRevision}){
 check();const list=session.channels.list(),channel=list.channels.find(c=>c.id===TASK_SOURCE),task=data.tasks.find(t=>t.id===id);
 if(!task||task.removed)throw Error('任务已移除或不存在');
 if((task.revision||0)!==expectedRevision)throw Error('任务轮次已变化，请刷新核对');
 if(session.viewer!==(task.reviewer||channel?.creator))throw Error('仅本人或指定验收人可调整排期');
 const event={event_id:crypto.randomUUID(),task_id:id,revision:expectedRevision,action:'reschedule',actor:session.viewer,at:new Date().toISOString(),payload:{date,times,source:'本人在任务中心拖动调整排期'}};
 return saveFlow({session,check,data,events:[event]});
}
