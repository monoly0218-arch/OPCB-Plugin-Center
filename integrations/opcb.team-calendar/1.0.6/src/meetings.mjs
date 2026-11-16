export function meetingUrl(value) {
  if(typeof value!=='string'||value.length>2000)return false;
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}

export function dueMeetingReminders(tasks,allocations,now) {
  const due=[];
  for(const task of tasks) {
    if(task.kind!=='meeting'||!task.meeting||task.status==='done')continue;
    const meeting=task.meeting;
    for(const slot of allocations.filter(a=>a.taskId===task.id&&a.start)) {
      const start=Date.parse(`${slot.date}T${slot.start}:00+08:00`);
      const events=new Map([[meeting.reminderMinutes,'会议提醒'],[meeting.joinBeforeMinutes,meeting.provider==='offline'?'会议准备':'进会提醒']]);
      for(const [minutes,title] of events) {
        const at=start-minutes*60000;
        if(now<at||now>=at+60000)continue;
        due.push({key:`${task.id}:${slot.date}:${slot.start}:${minutes}`,taskId:task.id,title,
          message:`${task.title} · ${slot.start} 开始${meeting.location?' · '+meeting.location:''}${minutes?' · 提前 '+minutes+' 分钟':' · 现在开始'}`,url:meeting.provider==='offline'?'':meeting.url||''});
      }
    }
  }
  return due;
}
