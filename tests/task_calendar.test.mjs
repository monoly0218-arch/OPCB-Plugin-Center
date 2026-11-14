import test from 'node:test';
import assert from 'node:assert/strict';
import {monthCells,shiftMonth} from '../src/tasks/calendar.mjs';
test('month grid includes every real date with Monday first and complete weeks',()=>{
 for(const [month,count] of [['2026-11',30],['2026-12',31],['2024-02',29],['2027-02',28]]){
  const cells=monthCells(month),current=cells.filter(c=>c.current);
  assert.equal(current.length,count);assert.equal(cells.length%7,0);
  assert.equal(new Date(cells[0].date+'T12:00:00Z').getUTCDay(),1);
  assert.equal(new Set(cells.map(c=>c.date)).size,cells.length);
  assert.equal(current[0].day,1);assert.equal(current.at(-1).day,count);
 }
});
test('month navigation crosses year boundaries without retaining an invalid day',()=>{
 assert.equal(shiftMonth('2026-12',1),'2027-01');
 assert.equal(shiftMonth('2027-01',-1),'2026-12');
 assert.equal(shiftMonth('2026-11',3),'2027-02');
});
