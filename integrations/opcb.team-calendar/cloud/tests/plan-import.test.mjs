import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlan} from '../src/plan-import.mjs';
import {demoState} from '../server/seed.mjs';
test('以姓名和项目名导入日计划，相同编号保留稳定来源',()=>{
  const p=parsePlan('W001 | 分镜 | 品牌短片 | 涛子 | 2026-11-16,2026-11-17 | 分镜稿',demoState(),'2026-11-16');
  assert.equal(p.tasks[0].sourceId,'W001');assert.equal(p.tasks[0].assigneeId,'tao');assert.equal(p.tasks[0].dates.length,2);
  assert.throws(()=>parsePlan('W002 | 测试 | 未知项目 | 涛子 | 2026-11-16',demoState(),'2026-11-16'),/找不到项目/);
});
