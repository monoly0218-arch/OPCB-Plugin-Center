import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {startServer} from '../server/main.mjs';

test('同一浏览器打开工作区和示例库，登录会话按端口隔离',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'team-calendar-cookies-'));
  const workspace=startServer({port:44279,dir:join(dir,'workspace'),demo:false});
  const demo=startServer({port:44280,dir:join(dir,'demo'),demo:true});
  try{
    await Promise.all([once(workspace.server,'listening'),once(demo.server,'listening')]);
    const pages=await Promise.all([44279,44280].map(port=>fetch(`http://127.0.0.1:${port}/`)));
    const cookies=pages.map(page=>page.headers.get('set-cookie').split(';')[0]);
    assert.notEqual(cookies[0].split('=')[0],cookies[1].split('=')[0]);
    for(const [port,isDemo] of [[44279,false],[44280,true]]){
      const response=await fetch(`http://127.0.0.1:${port}/api/state`,{headers:{cookie:cookies.join('; ')}});
      assert.equal(response.status,200);assert.equal((await response.json()).demo,isDemo);
    }
  }finally{await workspace.close();await demo.close();}
});

test('HTTP 与真实 MCP stdio 共用存储，重复提交、权限和跨站拒绝',async()=>{
  const port=44276,dir=mkdtempSync(join(tmpdir(),'team-calendar-http-'));
  const app=startServer({port,dir});await once(app.server,'listening');
  const base=`http://127.0.0.1:${port}`;
  const api=async(path,token=app.config.token,options={})=>{const r=await fetch(base+path,{...options,headers:{authorization:'Bearer '+token,'content-type':'application/json',...options.headers}});return {status:r.status,body:await r.json()};};
  let events;
  try {
    assert.equal((await api('/api/state','invalid')).status,401);
    assert.equal((await api('/api/mutate',app.viewer.token,{method:'POST',body:JSON.stringify({})})).status,403);
    assert.equal((await api('/api/mutate',app.config.token,{method:'POST',headers:{origin:'https://untrusted.example'},body:'{}'})).status,403);
    const stream=await fetch(base+'/api/events',{headers:{authorization:'Bearer '+app.config.token}});
    events=stream.body.getReader();assert.match(new TextDecoder().decode((await events.read()).value),/"revision":0/);
    const changed=events.read();
    const args={requestId:'mcp-import',expectedRevision:0,action:'upsert',sourceKey:'mcp-test',tasks:[{sourceId:'unique',title:'MCP 写入浏览器可见',projectId:'brand',assigneeId:'tao',status:'todo',dates:['2026-11-16','2026-11-17']},{sourceId:'meeting-via-mcp',title:'MCP meeting',projectId:'brand',assigneeId:'tao',status:'todo',kind:'meeting',meeting:{provider:'tencent',url:'',location:'online',participantIds:['moo'],joinBeforeMinutes:5,reminderMinutes:10},dates:[{date:'2026-11-18',start:'17:00',end:'18:00'}]}]};
    const lines=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26'}},{jsonrpc:'2.0',id:2,method:'tools/list'},{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'team_calendar_write',arguments:args}},{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'team_calendar_write',arguments:args}},{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'team_calendar_read'}}];
    const child=spawn(process.execPath,[resolve('server/mcp.mjs')],{env:{...process.env,CALENDAR_CONFIG:join(dir,'client.json')},stdio:['pipe','pipe','pipe']});
    let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
    const closed=once(child,'close');child.stdin.end(lines.map(x=>JSON.stringify(x)).join('\n')+'\n');
    const timer=setTimeout(()=>child.kill(),10000);
    const [code]=await closed;clearTimeout(timer);assert.equal(code,0,err);
    const replies=out.trim().split('\n').map(JSON.parse);assert.equal(replies.length,5);
    assert.equal(replies[1].result.tools.length,3);
    assert.equal(JSON.parse(replies[2].result.content[0].text).saved,true);
    assert.equal(JSON.parse(replies[3].result.content[0].text).replayed,true);
    assert.match(new TextDecoder().decode((await changed).value),/"revision":1/);
    const mcpState=JSON.parse(replies[4].result.content[0].text);
    const viewer=(await api('/api/state',app.viewer.token)).body;
    assert.equal(viewer.revision,mcpState.revision);
    assert.equal(viewer.tasks.filter(t=>t.title==='MCP 写入浏览器可见').length,1);
    const meeting=viewer.tasks.find(t=>t.sourceId==='meeting-via-mcp');assert.equal(meeting.meeting.joinBeforeMinutes,5);assert.deepEqual(meeting.meeting.participantIds,['moo']);assert.equal(viewer.allocations.find(a=>a.taskId===meeting.id).start,'17:00');
    assert.equal((await api('/api/operations/mcp-import')).body.saved,true);
  }finally{await events?.cancel();await app.close();}
});
