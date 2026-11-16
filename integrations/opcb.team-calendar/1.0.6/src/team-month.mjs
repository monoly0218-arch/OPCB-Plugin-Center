import {addDays} from './dates.mjs';

export function monthDays(day) {
  const first=day.slice(0,8)+'01';
  const count=new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7)),0)).getUTCDate();
  return Array.from({length:count},(_,i)=>addDays(first,i));
}

// Only actual consecutive dates join. Gaps, month boundaries and task IDs stay distinct.
export function monthSchedule(day,members,tasks,allocations) {
  const days=monthDays(day),indexes=new Map(days.map((d,i)=>[d,i]));
  const datesByTask=new Map();
  for(const a of allocations) {
    if(!indexes.has(a.date))continue;
    if(!datesByTask.has(a.taskId))datesByTask.set(a.taskId,new Set());
    datesByTask.get(a.taskId).add(indexes.get(a.date));
  }
  const rows=members.map(member=>{
    const segments=[];
    for(const task of tasks.filter(t=>t.assigneeId===member.id||(t.kind==='meeting'&&t.meeting?.participantIds.includes(member.id)))) {
      const dates=[...(datesByTask.get(task.id)||[])].sort((a,b)=>a-b);
      let segment;
      for(const index of dates) {
        if(segment&&index===segment.end+1)segment.end=index;
        else {segment={task,start:index,end:index};segments.push(segment);}
      }
    }
    segments.sort((a,b)=>a.start-b.start||b.end-a.end||a.task.id.localeCompare(b.task.id));
    const laneEnds=[];
    for(const segment of segments) {
      let lane=laneEnds.findIndex(end=>end<segment.start);
      if(lane===-1)lane=laneEnds.length;
      segment.lane=lane;laneEnds[lane]=segment.end;
    }
    return {member,segments,laneCount:Math.max(1,laneEnds.length),taskCount:new Set(segments.map(s=>s.task.id)).size};
  });
  return {days,rows};
}
