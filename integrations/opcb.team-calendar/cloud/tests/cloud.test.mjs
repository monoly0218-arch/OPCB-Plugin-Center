import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../cloud/handler.mjs';
import {emptyState} from '../server/seed.mjs';
import {hash,canonical,applyMutation} from '../server/state.mjs';

const tokens={alice:'a'.repeat(64),bob:'b'.repeat(64),view:'c'.repeat(64)};
const pubkeys={alice:'1'.repeat(64),bob:'2'.repeat(64)};
async function fixture() {
  const db=new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA higgsfield; CREATE TABLE higgsfield.untouched(value integer); INSERT INTO higgsfield.untouched VALUES(42);');
  await db.exec(readFileSync(new URL('../cloud/001_CALENDAR_SCHEMA.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../cloud/003_DEVICE_INVITES.sql',import.meta.url),'utf8'));
  const state=emptyState();state.members=[{id:'alice',name:'Alice',buzzPubkey:pubkeys.alice},{id:'bob',name:'Bob',buzzPubkey:pubkeys.bob}];
  await db.query('INSERT INTO opcb_calendar.workspace VALUES(1,0,$1::jsonb)',[JSON.stringify(state)]);
  for(const [name,role] of [['alice','owner'],['bob','editor'],['view','viewer']])await db.query('INSERT INTO opcb_calendar.devices(token_hash,actor,role,pubkey) VALUES($1,$2,$3,$4)',[hash(tokens[name]),'device:'+name,role,pubkeys[name==='view'?'bob':name]]);
  async function rpc(args) {
    const fields=['p_action','p_token_hash','p_viewer','p_request_id','p_fingerprint','p_expected_revision','p_state'];
    const params=fields.map(name=>args[name]===undefined?null:name==='p_state'?JSON.stringify(args[name]):args[name]);
    return (await db.query('SELECT public.opcb_calendar_gateway($1,$2,$3,$4,$5,$6,$7::jsonb) AS data',params)).rows[0].data;
  }
  const handler=createHandler({url:'https://project.example',serviceKey:'test-service-key',fetchImpl:async(url,options)=>{
    assert.equal(options.headers.authorization,'Bearer test-service-key');
    const args=JSON.parse(options.body);
    const data=url==='https://project.example/rest/v1/rpc/opcb_calendar_redeem_invite'?(await db.query('SELECT public.opcb_calendar_redeem_invite($1,$2,$3) AS data',[args.p_invite_hash,args.p_pubkey,args.p_token_hash])).rows[0].data:await rpc(args);
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  }});
  const api=async(path,name='alice',payload,headers={})=>{
    const response=await handler(new Request('https://project.example/functions/v1/opcb-team-calendar'+path,{method:payload===undefined?'GET':'POST',headers:{authorization:'Bearer '+(tokens[name]||name),'content-type':'application/json',...headers},...(payload===undefined?{}:{body:JSON.stringify(payload)})}));
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  return {db,rpc,api,handler};
}
const create={action:'upsert',requestId:'alice-create',expectedRevision:0,sourceKey:'cloud',tasks:[{sourceId:'one',title:'One shared task',projectId:'general',assigneeId:'alice',dates:['2026-11-16']}]};

test('Edge处理器与真实PostgreSQL SQL共用任务身份、改期、版本和回执，号池对象不变',async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.api('/api/state')).body.currentMemberId,'alice');
    assert.equal((await f.api('/api/state','bob')).body.currentMemberId,'bob');
    const native=await f.handler(new Request('http://edge-runtime/opcb-team-calendar/api/state',{headers:{authorization:'Bearer '+tokens.alice}}));assert.equal(native.status,200);assert.equal((await native.json()).currentMemberId,'alice');
    assert.equal((await f.api('/api/mutate','alice',create)).body.revision,1);
    const peer=(await f.api('/api/state','bob')).body,task=peer.tasks[0],slot=peer.allocations[0];
    const update={action:'update',requestId:'bob-change',expectedRevision:1,taskId:task.id,changes:{status:'doing'},allocations:[{...slot,date:'2026-11-17'}]};
    assert.equal((await f.api('/api/mutate','bob',update)).body.revision,2);
    const owner=(await f.api('/api/state')).body;assert.equal(owner.tasks[0].id,task.id);assert.equal(owner.tasks[0].status,'doing');assert.equal(owner.allocations[0].date,'2026-11-17');
    assert.equal((await f.api('/api/mutate','alice',create)).body.replayed,true);
    assert.equal((await f.api('/api/revision')).body.revision,2);
    assert.equal((await f.api('/api/operations/alice-create')).body.saved,true);
    assert.equal((await f.api('/api/operations/alice-create','bob')).status,403);
    assert.equal((await f.api('/api/mutate','alice',{...create,tasks:[{...create.tasks[0],title:'different'}]})).status,409);
    assert.deepEqual((await f.db.query('SELECT * FROM higgsfield.untouched')).rows,[{value:42}]);
  }finally{await f.db.close();}
});

test('一次性邀请固定到成员和角色，同一设备可恢复回包，不同设备不能抢占或复活已撤销连接',async()=>{
  const f=await fixture(),invite='d'.repeat(64),device='e'.repeat(64),payload={pubkey:pubkeys.bob,deviceHash:hash(device)};
  try {
    await f.db.query("INSERT INTO opcb_calendar.invites(invite_hash,actor,pubkey,role,expires_at) VALUES($1,'device:joined-bob',$2,'editor',now()+interval '1 hour')",[hash(invite),pubkeys.bob]);
    assert.equal((await f.api('/api/bind',invite,{...payload,pubkey:pubkeys.alice})).status,403);
    const bound=await f.api('/api/bind',invite,{...payload,role:'owner'});assert.equal(bound.status,200);assert.equal(bound.body.role,'editor');
    assert.equal((await f.api('/api/bind',invite,payload)).status,200);
    assert.equal((await f.api('/api/state',device)).body.currentMemberId,'bob');
    assert.equal((await f.api('/api/bind',invite,{...payload,deviceHash:hash('different')})).status,409);
    assert.equal((await f.db.query("SELECT count(*)::int AS n FROM opcb_calendar.devices WHERE actor='device:joined-bob'")).rows[0].n,1);
    await f.db.query("UPDATE opcb_calendar.devices SET disabled=true WHERE actor='device:joined-bob'");
    assert.equal((await f.api('/api/bind',invite,payload)).status,403);
    assert.equal((await f.api('/api/state',device)).status,401);
    await f.db.exec('SET ROLE anon');
    await assert.rejects(()=>f.db.query('SELECT public.opcb_calendar_redeem_invite($1,$2,$3)',[hash(invite),pubkeys.bob,hash(device)]),/permission denied/);
  }finally{await f.db.exec('RESET ROLE');await f.db.close();}
});

test('云端拒绝匿名、伪造身份、只读写入、编辑者改成员、非法会议和已撤销设备',async()=>{
  const f=await fixture();
  try {
    assert.equal((await f.api('/api/state','invalid')).status,401);
    assert.equal((await f.api('/api/state','alice',undefined,{'x-calendar-viewer':pubkeys.bob})).status,403);
    assert.equal((await f.api('/api/state','alice',undefined,{origin:'https://evil.example'})).status,403);
    assert.equal((await f.api('/api/mutate','view',create)).status,403);
    const state=(await f.api('/api/state')).body;
    assert.equal((await f.api('/api/mutate','bob',{action:'configure',requestId:'bad-configure',expectedRevision:0,members:state.members,projects:state.projects})).status,403);
    assert.equal((await f.api('/api/mutate','alice',{...create,tasks:[{...create.tasks[0],kind:'meeting'}]})).status,400);
    assert.equal((await f.api('/api/revision')).body.revision,0);
    assert.equal((await f.api('/api/operations/alice-create')).status,404);
    await f.db.query("UPDATE opcb_calendar.devices SET disabled=true WHERE actor='device:alice'");
    assert.equal((await f.api('/api/state')).status,401);
    assert.equal((await f.api('/api/state','bob')).status,200);
  }finally{await f.db.close();}
});

test('PostgreSQL提交再次检查版本与设备授权，禁止读取后覆盖他人的修改',async()=>{
  const f=await fixture();
  try {
    const args={p_token_hash:hash(tokens.alice),p_request_id:create.requestId,p_fingerprint:hash(canonical(create)),p_expected_revision:0};
    const prepared=await f.rpc({...args,p_action:'prepare'});
    const candidate=applyMutation(prepared.state,prepared.principal,create).state;
    const peerCreate={...create,requestId:'bob-first',tasks:[{...create.tasks[0],sourceId:'other'}]};
    assert.equal((await f.api('/api/mutate','bob',peerCreate)).status,200);
    assert.equal((await f.rpc({...args,p_action:'commit',p_state:candidate})).status,409);
    assert.equal((await f.api('/api/state')).body.tasks.length,1);
    await f.db.query("UPDATE opcb_calendar.devices SET disabled=true WHERE actor='device:alice'");
    assert.equal((await f.rpc({...args,p_expected_revision:1,p_action:'commit',p_state:candidate})).status,401);
  }finally{await f.db.close();}
});

test('云端数据库直接调用受限，匿名角色不能读表或绕过Edge调用RPC',async()=>{
  const f=await fixture();
  try {
    await f.db.exec('SET ROLE anon');
    await assert.rejects(()=>f.db.query('SELECT * FROM opcb_calendar.workspace'),/permission denied/);
    await assert.rejects(()=>f.rpc({p_action:'read',p_token_hash:hash(tokens.alice)}),/permission denied/);
    await f.db.exec('RESET ROLE; SET ROLE service_role');
    assert.equal((await f.rpc({p_action:'read',p_token_hash:hash(tokens.alice)})).currentMemberId,'alice');
  }finally{await f.db.exec('RESET ROLE');await f.db.close();}
});
