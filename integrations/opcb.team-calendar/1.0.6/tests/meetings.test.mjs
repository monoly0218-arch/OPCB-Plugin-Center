import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {demoState} from '../server/seed.mjs';
import {meetingUrl,dueMeetingReminders} from '../src/meetings.mjs';
const owner={actor:'owner',role:'owner'};
const meeting={provider:'tencent',url:'https://meeting.tencent.com/dm/example',location:'线上',participantIds:['tao','zhou'],joinBeforeMinutes:5,reminderMinutes:10};
const task={sourceId:'meeting-1',title:'周三项目会议',projectId:'brand',assigneeId:'moo',status:'todo',kind:'meeting',meeting,dates:[{date:'2026-11-18',start:'17:00',end:'18:00'}]};
const input=tasks=>({requestId:'meeting',expectedRevision:0,action:'upsert',sourceKey:'meeting-plan',tasks});
test('会议与普通任务使用同一写入口，更新与重试保留唯一身份和会议字段',()=>{
  const store=openStore(':memory:',demoState());
  try {
    store.mutate(owner,input([task]));const first=store.read(owner),saved=first.tasks.find(t=>t.sourceId===task.sourceId);
    assert.deepEqual(saved.meeting,meeting);
    assert.equal(store.mutate(owner,input([task])).replayed,true);
    store.mutate(owner,{action:'update',taskId:saved.id,changes:{meeting:{...meeting,location:'二楼会议室',provider:'offline',url:''}},requestId:'edit-meeting',expectedRevision:1});
    const next=store.read(owner);assert.equal(next.tasks.filter(t=>t.sourceId===task.sourceId).length,1);
    assert.equal(next.tasks.find(t=>t.id===saved.id).meeting.provider,'offline');
  }finally{store.close();}
});
test('拒绝无时间会议、不安全链接、未知参会人和无地点线下会议，事务不落库',()=>{
  for(const bad of [{...task,dates:['2026-11-18']},{...task,meeting:{...meeting,url:'javascript:alert(1)'}},{...task,meeting:{...meeting,participantIds:['missing']}},{...task,meeting:{...meeting,provider:'offline',location:''}}]) {
    const store=openStore(':memory:',demoState());try{assert.throws(()=>store.mutate(owner,input([bad])));assert.equal(store.read(owner).revision,0);}finally{store.close();}
  }
  assert.equal(meetingUrl('https://example.com'),true);assert.equal(meetingUrl('https://user:pass@example.com'),false);
});
test('按上海时区触发提前提醒和进会，改期后旧时间不再触发，完成会议不提醒',()=>{
  const tasks=[{...task,id:'m'}],slots=[{taskId:'m',date:'2026-11-18',start:'17:00',end:'18:00'}];
  assert.equal(dueMeetingReminders(tasks,slots,Date.parse('2026-11-18T16:49:59+08:00')).length,0);
  assert.equal(dueMeetingReminders(tasks,slots,Date.parse('2026-11-18T16:50:15+08:00'))[0].title,'会议提醒');
  assert.equal(dueMeetingReminders(tasks,slots,Date.parse('2026-11-18T16:55:00+08:00'))[0].title,'进会提醒');
  assert.equal(dueMeetingReminders(tasks,[{...slots[0],start:'18:00'}],Date.parse('2026-11-18T16:55:00+08:00')).length,0);
  assert.equal(dueMeetingReminders([{...tasks[0],status:'done'}],slots,Date.parse('2026-11-18T16:55:00+08:00')).length,0);
  assert.equal(dueMeetingReminders([{...tasks[0],meeting:{...meeting,joinBeforeMinutes:10}}],slots,Date.parse('2026-11-18T16:50:00+08:00')).length,1);
});
test('线上会议改为线下后清除旧链接，旧数据的线下提醒也不携带链接',()=>{
  const store=openStore(':memory:',demoState());
  try{store.mutate(owner,input([task]));const saved=store.read(owner).tasks.find(t=>t.sourceId===task.sourceId);store.mutate(owner,{action:'update',taskId:saved.id,changes:{meeting:{...meeting,provider:'offline',location:'一楼会议室'}},requestId:'offline',expectedRevision:1});assert.equal(store.read(owner).tasks.find(t=>t.id===saved.id).meeting.url,'');}finally{store.close();}
  const reminders=dueMeetingReminders([{...task,id:'m',meeting:{...meeting,provider:'offline',location:'一楼'}}],[{taskId:'m',date:'2026-11-18',start:'17:00',end:'18:00'}],Date.parse('2026-11-18T16:50:15+08:00'));assert.equal(reminders[0].url,'');
});
