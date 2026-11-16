import test from 'node:test';
import assert from 'node:assert/strict';
import {monday,addDays,shiftMonth} from '../src/dates.mjs';
test('周一边界、跨年与真正的月份切换',()=>{
  assert.equal(monday('2026-11-22'),'2026-11-16');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.equal(shiftMonth('2026-11-01',1),'2026-12-01');
  assert.equal(shiftMonth('2026-01-31',1),'2026-02-28');
  assert.equal(shiftMonth('2026-01-01',-1),'2025-12-01');
});
