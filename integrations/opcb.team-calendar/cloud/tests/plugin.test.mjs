import test from 'node:test';
import assert from 'node:assert/strict';
import {apply,inject} from '../plugin/plugin.js';
test('插件激活注册页面和三工具，限制会话和 Agent，卸载后不再调用',async()=>{
  const tools=[],pages=[],cleanups=[],calls=[];
  apply({relay:{snapshot:()=>({viewer:'a'.repeat(64)})},react:{},pages:{register:p=>pages.push(p)},agents:{addTool:t=>tools.push(t)},effect:fn=>cleanups.push(fn()),host:{runCommand:async(name,input)=>{calls.push({name,input:JSON.parse(input)});return JSON.stringify({ok:true,data:{revision:7}});}}});
  assert.ok(inject.includes('host'));assert.equal(pages[0].title,'团队日历');assert.equal(tools.length,3);
  const client={key:'936956c409fe0cc10f18ab8363b479b1f9c1bb6a9c6d8f0595f1b42cfce07003'};
  const context={channel:'b7491401-2c3f-4d20-8295-e5cda3c19661'};
  await assert.rejects(()=>tools[0].call(client,{channel:'other'},{}),/仅授权/);
  await assert.rejects(()=>tools[0].call({key:'other'},context,{}),/尚未获得/);
  assert.equal(calls.length,0);
  assert.equal(JSON.parse(await tools[0].call(client,context,{})).revision,7);assert.equal(calls[0].input.action,'read');assert.equal(calls[0].input.viewer,'a'.repeat(64));
  cleanups.forEach(f=>f?.());await assert.rejects(()=>tools[0].call(client,context,{}),/已停止/);
});
test('宿主退出登录或请求过程中切换身份时，不接受原身份结果',async()=>{
  const tools=[],cleanups=[];let viewer='a'.repeat(64),resolveCall;
  apply({relay:{snapshot:()=>({viewer})},react:{},pages:{register(){}},agents:{addTool:t=>tools.push(t)},effect:fn=>cleanups.push(fn()),host:{runCommand:()=>new Promise(resolve=>{resolveCall=resolve;})}});
  const client={key:'936956c409fe0cc10f18ab8363b479b1f9c1bb6a9c6d8f0595f1b42cfce07003'},context={channel:'b7491401-2c3f-4d20-8295-e5cda3c19661'};
  const pending=tools[0].call(client,context,{});viewer='b'.repeat(64);resolveCall(JSON.stringify({ok:true,data:{revision:0}}));await assert.rejects(()=>pending,/已切换/);viewer=undefined;await assert.rejects(()=>tools[0].call(client,context,{}),/先登录/);cleanups.forEach(fn=>fn?.());
});
test('只在日历页面订阅时启动同步，关页和卸载会停止，晚到的进程不会留在后台',async()=>{
  const pages=[],effects=[],cleanups=[],processes=[];let killed=0;
  const react={createElement:(type,props)=>({type,props}),useSyncExternalStore:()=>({viewer:'a'.repeat(64)}),useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect:fn=>effects.push(fn),useLayoutEffect:()=>{}};
  apply({relay:{snapshot:()=>({viewer:'a'.repeat(64)}),subscribe:()=>()=>{}},react,pages:{register:p=>pages.push(p)},agents:{addTool(){}},effect:fn=>cleanups.push(fn()),host:{spawn:()=>new Promise(resolve=>processes.push(resolve)),runCommand:async()=>JSON.stringify({ok:true,data:{revision:0}})}});
  assert.equal(processes.length,0);
  const App=pages[0].component().type;
  App();const first=effects[1]();effects.length=0;
  App();const second=effects[1]();
  assert.equal(processes.length,1);first();second();
  processes[0]({kill:()=>killed++});await Promise.resolve();assert.equal(killed,1);
  effects.length=0;App();const third=effects[1]();assert.equal(processes.length,2);
  processes[1]({kill:()=>killed++});await Promise.resolve();
  cleanups.forEach(fn=>fn?.());assert.equal(killed,2);third();assert.equal(killed,2);
});
