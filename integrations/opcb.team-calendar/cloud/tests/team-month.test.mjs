import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDays,monthSchedule} from '../src/team-month.mjs';

test('团队月历只列当月真实日期，覆盖闰年和跨年',()=>{
  assert.equal(monthDays('2026-02-16').length,28);
  assert.equal(monthDays('2028-02-29').at(-1),'2028-02-29');
  assert.equal(monthDays('2026-11-16').length,30);
  assert.equal(monthDays('2026-12-31').at(-1),'2026-12-31');
});
test('跨月任务截取当月，间断日期不连接，重复日期不增加任务',()=>{
  const tasks=[{id:'a',assigneeId:'tao'}];
  const allocations=['2026-10-31','2026-11-01','2026-11-02','2026-11-02','2026-11-04','2026-12-01'].map(date=>({taskId:'a',date}));
  const {rows}=monthSchedule('2026-11-16',[{id:'tao'},{id:'zhou'}],tasks,allocations);
  assert.deepEqual(rows[0].segments.map(({start,end,lane})=>({start,end,lane})),[{start:0,end:1,lane:0},{start:3,end:3,lane:0}]);
  assert.equal(rows[0].taskCount,1);
  assert.equal(rows[1].taskCount,0);
});
test('同一成员多项目并行不遮挡，筛选后只用传入任务计算',()=>{
  const tasks=[{id:'a',assigneeId:'tao',projectId:'one'},{id:'b',assigneeId:'tao',projectId:'two'},{id:'c',assigneeId:'zhou'}];
  const allocations=[{taskId:'a',date:'2026-11-02'},{taskId:'b',date:'2026-11-02'},{taskId:'b',date:'2026-11-03'},{taskId:'c',date:'2026-11-02'}];
  const {rows}=monthSchedule('2026-11-01',[{id:'tao'}],tasks,allocations);
  assert.equal(rows[0].laneCount,2);assert.equal(rows[0].taskCount,2);
  const filtered=monthSchedule('2026-11-01',[{id:'tao'}],tasks.filter(t=>t.projectId==='one'),allocations);
  assert.equal(filtered.rows[0].taskCount,1);assert.equal(filtered.rows[0].laneCount,1);
});
test('同一会议展示在负责人及参会成员行，始终关联同一个任务 ID',()=>{
  const tasks=[{id:'meeting',assigneeId:'tao',kind:'meeting',meeting:{participantIds:['zhou']}}];
  const {rows}=monthSchedule('2026-11-01',[{id:'tao'},{id:'zhou'},{id:'lin'}],tasks,[{taskId:'meeting',date:'2026-11-18'}]);
  assert.deepEqual(rows.map(r=>r.taskCount),[1,1,0]);
  assert.equal(rows[0].segments[0].task.id,rows[1].segments[0].task.id);
});
