import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {startServer} from '../server/main.mjs';

test('空白工作区经配置、真实 MCP 写入及重新打开后保留同一任务，示例库不变',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'team-calendar-workspace-')),port=44277;
  let app=startServer({port,dir:join(dir,'workspace'),demo:false});
  const demo=startServer({port:44278,dir:join(dir,'demo'),demo:true});
  await Promise.all([once(app.server,'listening'),once(demo.server,'listening')]);
  const api=async(path,body)=>{
    const response=await fetch(`http://127.0.0.1:${port}`+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+app.config.token,'content-type':'application/json',connection:'close'},...(body?{body:JSON.stringify(body)}:{})});
    assert.equal(response.status,200);return response.json();
  };
  try{
    const initial=await api('/api/state');assert.equal(initial.demo,false);assert.deepEqual(initial.tasks,[]);
    const demoPrincipal=demo.store.authorize(demo.config.token),demoBefore=demo.store.read(demoPrincipal);
    await api('/api/mutate',{requestId:'setup-team',expectedRevision:0,action:'configure',members:[{id:'tao',name:'涛子'}],projects:[{id:'brand',name:'品牌短片',color:'blue'},{id:'web',name:'团队官网',color:'purple'}]});
    const payload={requestId:'week-one',expectedRevision:1,action:'upsert',sourceKey:'team-plan',plan:{sourceId:'week-one',title:'首周计划',weekStart:'2026-11-16'},tasks:[{sourceId:'cut',title:'一版剪辑',projectId:'brand',assigneeId:'tao',dates:['2026-11-16','2026-11-17']},{sourceId:'design',title:'方案确认',projectId:'web',assigneeId:'tao',dates:['2026-11-18']}]};
    const child=spawn(process.execPath,[resolve('server/mcp.mjs'),'--workspace','--config',join(dir,'workspace/client.json')],{env:{...process.env,CALENDAR_CONFIG:join(dir,'wrong.json')},stdio:['pipe','pipe','pipe']});
    let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
    const closed=once(child,'close'),timer=setTimeout(()=>child.kill(),10000);
    child.stdin.end([1,2].map(id=>JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name:'team_calendar_write',arguments:payload}})).join('\n')+'\n');
    const [code]=await closed;clearTimeout(timer);assert.equal(code,0,err);
    const replies=out.trim().split('\n').map(JSON.parse);
    assert.equal(JSON.parse(replies[0].result.content[0].text).saved,true);
    assert.equal(JSON.parse(replies[1].result.content[0].text).replayed,true);
    const saved=await api('/api/state');assert.equal(saved.tasks.length,2);assert.equal(saved.allocations.length,3);assert.equal(saved.plans.length,1);
    assert.equal(saved.tasks.filter(t=>t.sourceId==='cut').length,1);
    const taskId=saved.tasks.find(t=>t.sourceId==='cut').id;
    assert.equal(saved.allocations.filter(a=>a.taskId===taskId).length,2);
    assert.deepEqual(demo.store.read(demoPrincipal),demoBefore);
    await app.close();app=startServer({port,dir:join(dir,'workspace'),demo:true});
    await once(app.server,'listening');
    const reopened=await api('/api/state');assert.equal(reopened.demo,false);
    assert.deepEqual(reopened.tasks,saved.tasks);assert.deepEqual(reopened.allocations,saved.allocations);
  }finally{await app.close();await demo.close();}
});
