import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeOptions} from '../server/runtime.mjs';

test('工作区与旧示例默认隔离，CLI 配置可被所有入口一致解析',()=>{
  const workspace=runtimeOptions({args:[],env:{},base:'/calendar'});
  const demo=runtimeOptions({args:['--demo'],env:{},base:'/calendar'});
  assert.equal(workspace.port,4177);assert.equal(workspace.demo,false);
  assert.equal(workspace.dir,'/calendar/.runtime/workspace');
  assert.equal(workspace.configPath,'/calendar/.runtime/workspace/client.json');
  assert.equal(demo.port,4176);assert.equal(demo.dir,'/calendar/.runtime');
  assert.notEqual(workspace.configPath,demo.configPath);
  const custom=runtimeOptions({args:['--workspace','--config','/custom/client.json'],env:{CALENDAR_PROFILE:'demo',CALENDAR_PORT:'45000',CALENDAR_DATA_DIR:'/data/calendar',CALENDAR_CONFIG:'/ignored.json'}});
  assert.equal(custom.profile,'workspace');assert.equal(custom.port,45000);
  assert.equal(custom.dir,'/data/calendar');assert.equal(custom.configPath,'/custom/client.json');
  assert.throws(()=>runtimeOptions({args:['--demo','--workspace'],env:{}}),/不能同时/);
  assert.throws(()=>runtimeOptions({args:[],env:{CALENDAR_PROFILE:'other'}}),/只能/);
  assert.throws(()=>runtimeOptions({args:[],env:{CALENDAR_PORT:'oops'}}),/整数/);
  assert.throws(()=>runtimeOptions({args:['--config'],env:{}}),/路径/);
});
