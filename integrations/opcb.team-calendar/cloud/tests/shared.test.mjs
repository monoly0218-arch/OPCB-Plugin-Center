import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {Readable} from 'node:stream';
import {openStore} from '../server/store.mjs';
import {emptyState} from '../server/seed.mjs';
import {startServer} from '../server/main.mjs';
import {connectionUrl,connectionEndpoint,readConnection} from '../server/connection.mjs';

const alice='a'.repeat(64),bob='b'.repeat(64),origin='https://calendar.example.test';
function seed(store,owner) {const s=store.read(owner);store.mutate(owner,{requestId:'team-setup',expectedRevision:0,action:'configure',members:[{id:'alice',name:'Alice',buzzPubkey:alice},{id:'bob',name:'Bob',buzzPubkey:bob},{id:'unbound',name:'Unbound'}],projects:s.projects});}

test('共享地址拒绝明文、用户信息、路径及令牌查询参数，默认仅回环监听',()=>{
  for(const url of ['http://example.test','https://a:b@example.test','https://example.test/other','https://example.test/?token=x','https://example.test/#x'])assert.throws(()=>connectionUrl(url,{shared:true}));
  assert.equal(connectionUrl(origin+'/'),origin);
  assert.equal(connectionUrl('http://127.0.0.1:4177'),'http://127.0.0.1:4177');
  assert.throws(()=>startServer({publicUrl:origin,demo:true}),/示例/);
  assert.throws(()=>startServer({host:'0.0.0.0'}),/HTTPS/);
});

test('共享连接与原本机配置分开，配置损坏或缺失时拒绝回退，固定使用专用Edge路径',()=>{
  const dir=mkdtempSync(join(tmpdir(),'calendar-shared-config-')),path=join(dir,'client.json'),shared=join(dir,'shared.json');
  const local={url:'http://127.0.0.1:4177',token:'local',sharedConfig:'shared.json'};
  writeFileSync(path,JSON.stringify(local));assert.throws(()=>readConnection(path));
  const remote={url:'https://project.example',token:'remote',transport:'supabase'};
  writeFileSync(shared,JSON.stringify(remote));assert.deepEqual(readConnection(path),remote);
  assert.equal(connectionEndpoint(remote,'/api/state'),'https://project.example/functions/v1/opcb-team-calendar/api/state');
  writeFileSync(shared,JSON.stringify({...remote,transport:'unknown'}));assert.throws(()=>readConnection(path),/不会退回/);
  assert.equal(JSON.parse(readFileSync(path)).token,'local');
});

test('已切到共享的工作区再次运行本机启动入口时立即退出，不创建另一份数据库',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'calendar-no-local-fork-'));writeFileSync(join(dir,'client.json'),JSON.stringify({sharedConfig:'../shared/client.json'}));
  const child=spawn(process.execPath,[resolve('server/main.mjs'),'--workspace'],{env:{...process.env,CALENDAR_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',b=>out+=b);const closed=once(child,'close'),timer=setTimeout(()=>child.kill(),5000);const [code]=await closed;clearTimeout(timer);
  assert.equal(code,0);assert.match(out,/不会重新启动/);assert.equal(existsSync(join(dir,'calendar.sqlite')),false);
});

test('设备凭据独立、绑定成员和权限，撤销后重开数据库也无法恢复旧凭据',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'calendar-devices-')),'calendar.sqlite');
  let store=openStore(path,emptyState());
  try {
    seed(store,{actor:'admin',role:'owner'});
    const one=store.issueDevice({deviceId:'alice-mac',memberId:'alice'}),two=store.issueDevice({deviceId:'bob-mac',memberId:'bob',role:'viewer'});
    assert.notEqual(one.token,two.token);
    assert.equal(store.read(store.authorize(one.token)).currentMemberId,'alice');
    assert.equal(store.read(store.authorize(two.token)).currentMemberId,'bob');
    assert.equal(store.authorize(two.token).role,'viewer');
    assert.throws(()=>store.issueDevice({deviceId:'other',memberId:'unbound'}),/关联/);
    assert.throws(()=>store.issueDevice({deviceId:'alice-mac',memberId:'bob'}),/已存在/);
    assert.throws(()=>store.issueDevice({deviceId:'bad-role',memberId:'bob',role:'admin'}),/权限/);
    const records=readFileSync(path);assert.equal(records.includes(Buffer.from(one.token)),false);
    assert.equal(store.revokeDevice('alice-mac'),true);
    store.close();store=openStore(path,emptyState());
    assert.throws(()=>store.authorize(one.token),/未授权/);
    assert.equal(store.authorize(two.token).role,'viewer');
    assert.deepEqual(store.listDevices(),[{deviceId:'bob-mac',role:'viewer',memberId:'bob'}]);
  }finally{store.close();}
});

test('共享服务不下发 owner cookie，拒绝本机管理员令牌和伪造身份，双用户共享版本及实时事件',async()=>{
  const port=44283,dir=mkdtempSync(join(tmpdir(),'calendar-shared-http-'));
  const app=startServer({port,dir,demo:false,publicUrl:origin});
  await once(app.server,'listening');let events,revokedEvents;
  // Use the same Host-preserving transport as an HTTPS reverse proxy. Native
  // fetch does not override Host on all supported Node versions.
  const api=(path,token,options={})=>new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:'127.0.0.1',port,path,method:options.method||'GET',headers:{host:'calendar.example.test',authorization:'Bearer '+token,'content-type':'application/json',...options.headers}},res=>resolve(new Response(Readable.toWeb(res),{status:res.statusCode,headers:res.headers})));
    req.on('error',reject);req.end(options.body);
  });
  try {
    const owner=app.store.authorize(app.config.token);seed(app.store,owner);
    const one=app.store.issueDevice({deviceId:'one',memberId:'alice',role:'owner'}),two=app.store.issueDevice({deviceId:'two',memberId:'bob',role:'editor'}),view=app.store.issueDevice({deviceId:'view',memberId:'bob',role:'viewer'});
    const page=await api('/',one.token);assert.equal(page.status,403);assert.equal(page.headers.get('set-cookie'),null);
    assert.equal((await api('/api/state',app.config.token)).status,403);
    assert.equal((await api('/api/state','invalid')).status,401);
    assert.equal((await api('/api/state',one.token,{headers:{'x-calendar-viewer':bob}})).status,403);
    assert.equal((await api('/api/state',one.token,{headers:{host:'untrusted.example'}})).status,403);
    assert.equal((await api('/api/state',one.token,{headers:{origin:'https://untrusted.example'}})).status,403);
    assert.equal((await api('/api/mutate',view.token,{method:'POST',body:'{}'})).status,403);
    const stream=await api('/api/events',two.token);events=stream.body.getReader();
    assert.equal(stream.headers.get('x-accel-buffering'),'no');
    assert.match(new TextDecoder().decode((await events.read()).value),/"revision":1/);
    const pending=events.read();
    const payload={requestId:'alice-create',expectedRevision:1,action:'upsert',sourceKey:'shared-test',tasks:[{sourceId:'one',title:'Shared task',assigneeId:'alice',projectId:'general',dates:['2026-11-16']}]};
    assert.equal((await api('/api/mutate',one.token,{method:'POST',body:JSON.stringify(payload)})).status,200);
    assert.match(new TextDecoder().decode((await pending).value),/"revision":2/);
    const s=await (await api('/api/state',two.token)).json();assert.equal(s.currentMemberId,'bob');assert.equal(s.tasks.length,1);
    const task=s.tasks[0],slot=s.allocations[0];
    assert.equal((await api('/api/mutate',two.token,{method:'POST',body:JSON.stringify({requestId:'stale-change',expectedRevision:1,action:'update',taskId:task.id,changes:{status:'doing'}})})).status,409);
    const updated=await api('/api/mutate',two.token,{method:'POST',body:JSON.stringify({requestId:'bob-change',expectedRevision:2,action:'update',taskId:task.id,changes:{status:'doing'},allocations:[{...slot,date:'2026-11-17'}]})});assert.equal(updated.status,200);
    const final=await (await api('/api/state',one.token)).json();assert.equal(final.currentMemberId,'alice');assert.equal(final.tasks[0].id,task.id);assert.equal(final.tasks[0].status,'doing');assert.equal(final.allocations[0].date,'2026-11-17');
    const replay=await (await api('/api/mutate',one.token,{method:'POST',body:JSON.stringify(payload)})).json();assert.equal(replay.replayed,true);assert.equal((await (await api('/api/state',two.token)).json()).revision,3);
    assert.equal((await api('/api/operations/alice-create',two.token)).status,403);
    // A revoked stream is closed before the next notification, not merely denied on its next GET.
    revokedEvents=(await api('/api/events',view.token)).body.getReader();await revokedEvents.read();
    const closed=revokedEvents.read();app.store.revokeDevice('view');
    assert.equal((await api('/api/state',view.token)).status,401);
    await api('/api/mutate',two.token,{method:'POST',body:JSON.stringify({requestId:'after-revoke',expectedRevision:3,action:'update',taskId:task.id,changes:{status:'done'}})});
    assert.equal((await closed).done,true);
    // A fresh subscription starts at the current version, including changes made while disconnected.
    await events.cancel();events=(await api('/api/events',two.token)).body.getReader();assert.match(new TextDecoder().decode((await events.read()).value),/"revision":4/);
    const now=app.store.read(owner);app.store.mutate(owner,{requestId:'unbind',expectedRevision:4,action:'configure',projects:now.projects,members:now.members.map(m=>({...m,buzzPubkey:undefined}))});
    assert.equal((await api('/api/state',two.token)).status,403);
  }finally{await events?.cancel();await revokedEvents?.cancel();await app.close();}
});

test('设备管理 CLI 的凭据只写入新建的私有文件，独立进程可撤销正在使用的连接',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'calendar-device-cli-')),out=join(dir,'bob-device.json');
  const store=openStore(join(dir,'calendar.sqlite'),emptyState());seed(store,{actor:'admin',role:'owner'});
  const command=async args=>{
    const child=spawn(process.execPath,[resolve('scripts/devices.mjs'),...args],{env:{...process.env,CALENDAR_DATA_DIR:dir,CALENDAR_PUBLIC_URL:origin},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const [code]=await once(child,'close');return {code,stdout,stderr};
  };
  try {
    const issued=await command(['issue','--id','bob-mac','--member','bob','--out',out]);assert.equal(issued.code,0,issued.stderr);
    const c=JSON.parse(readFileSync(out));assert.equal(c.url,origin);assert.equal(c.role,'editor');assert.equal(statSync(out).mode&0o777,0o600);assert.equal(issued.stdout.includes(c.token),false);
    assert.equal(store.authorize(c.token).pubkey,bob);
    const before=readFileSync(out,'utf8');assert.equal((await command(['issue','--id','second','--member','alice','--out',out])).code,1);assert.equal(readFileSync(out,'utf8'),before);
    const invalid=join(dir,'invalid.json');assert.equal((await command(['issue','--id','unknown','--member','unbound','--out',invalid])).code,1);assert.equal(existsSync(invalid),false);
    assert.equal((await command(['revoke','--id','bob-mac'])).code,0);assert.throws(()=>store.authorize(c.token),/未授权/);
  }finally{store.close();}
});

test('运行中 WAL 工作区可导出一致状态和历史回执，保留任务 ID 且不携带任何旧凭据',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'calendar-export-')),path=join(dir,'calendar.sqlite'),out=join(dir,'migration.sqlite');
  const owner={actor:'admin',role:'owner'},store=openStore(path,emptyState(),[{...owner,token:'old-local-secret'}]);let copy;
  try {
    seed(store,owner);const c=store.issueDevice({deviceId:'old-device',memberId:'alice'});
    store.mutate(owner,{requestId:'before-export',expectedRevision:1,action:'upsert',sourceKey:'migration',tasks:[{sourceId:'one',title:'Keep identity',assigneeId:'alice',projectId:'general',dates:['2026-11-16']}]});
    const original=store.read(owner);
    const run=async()=>{
      const child=spawn(process.execPath,[resolve('scripts/export-workspace.mjs'),'--workspace','--out',out],{env:{...process.env,CALENDAR_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const [code]=await once(child,'close');return {code,stdout,stderr};
    };
    const exported=await run();assert.equal(exported.code,0,exported.stderr);assert.equal(JSON.parse(exported.stdout).credentialsIncluded,false);assert.equal(statSync(out).mode&0o777,0o600);
    copy=openStore(out,emptyState());assert.deepEqual(copy.read(owner),original);assert.equal(copy.operation(owner,'before-export').revision,2);
    assert.throws(()=>copy.authorize(c.token),/未授权/);assert.throws(()=>copy.authorize('old-local-secret'),/未授权/);assert.deepEqual(copy.listDevices(),[]);
    copy.close();copy=undefined;
    const bytes=readFileSync(out);assert.equal((await run()).code,1);assert.deepEqual(readFileSync(out),bytes);assert.deepEqual(store.read(owner),original);
  }finally{copy?.close();store.close();}
});
