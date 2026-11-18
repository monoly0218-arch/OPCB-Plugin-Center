import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../server/store.mjs';
import {emptyState,demoState} from '../server/seed.mjs';
import {startServer} from '../server/main.mjs';
import {request} from '../server/client.mjs';

const alice='a'.repeat(64),bob='b'.repeat(64);
const admin={actor:'admin',role:'owner'};
test('成员由已授权连接的公钥映射，未知用户不默认匹配 Moo',()=>{
  const seed=demoState();seed.members=seed.members.map(m=>({...m,...(m.id==='moo'?{buzzPubkey:alice}:m.id==='tao'?{buzzPubkey:bob}:{})}));
  const store=openStore(':memory:',seed,[{token:'one',actor:'one',role:'owner',pubkey:alice},{token:'two',actor:'two',role:'editor',pubkey:bob},{token:'unknown',actor:'unknown',role:'viewer'}]);
  try{assert.equal(store.read(store.authorize('one')).currentMemberId,'moo');assert.equal(store.read(store.authorize('two')).currentMemberId,'tao');assert.equal(store.read(store.authorize('unknown')).currentMemberId,null);assert.equal(store.read(store.authorize('two')).role,'editor');}finally{store.close();}
});
test('管理员可绑定用户；重复绑定、公钥错误和编辑者修改绑定被拒绝',()=>{
  const store=openStore(':memory:',emptyState());
  try{const initial=store.read(admin),payload={action:'configure',requestId:'bind',expectedRevision:0,members:initial.members.map(m=>({...m,buzzPubkey:alice})),projects:initial.projects};store.mutate(admin,payload);assert.equal(store.read({...admin,pubkey:alice}).currentMemberId,'moo');assert.throws(()=>store.mutate(admin,{...payload,requestId:'duplicate',expectedRevision:1,members:[...payload.members,{id:'other',name:'Other',buzzPubkey:alice}]}),/只能关联/);assert.throws(()=>store.mutate(admin,{...payload,requestId:'invalid',expectedRevision:1,members:[{id:'moo',name:'Moo',buzzPubkey:'bad'}]}),/公钥/);assert.throws(()=>store.mutate({actor:'editor',role:'editor'},{...payload,requestId:'editor',expectedRevision:1}),/只有工作区管理员/);}finally{store.close();}
});
test('旧凭据表可升级且原有任务不变，未绑定的旧连接保持未知身份',()=>{
  const dir=mkdtempSync(join(tmpdir(),'calendar-migrate-')),path=join(dir,'state.sqlite');const db=new DatabaseSync(path);db.exec('CREATE TABLE credentials (hash TEXT PRIMARY KEY, actor TEXT NOT NULL, role TEXT NOT NULL); CREATE TABLE state (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)');const original=demoState();db.prepare('INSERT INTO state VALUES (1,7,?)').run(JSON.stringify(original));db.close();const store=openStore(path,emptyState(),[{actor:'owner',role:'owner',token:'legacy'}]);try{const s=store.read(store.authorize('legacy'));assert.equal(s.currentMemberId,null);assert.equal(s.revision,7);assert.deepEqual(s.members,original.members);assert.deepEqual(s.tasks,original.tasks);assert.deepEqual(s.allocations,original.allocations);}finally{store.close();}
});
test('两个宿主用户选择各自凭据；不匹配或未绑定用户不能借用 owner 连接',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'calendar-identity-http-')),port=44281,url=`http://127.0.0.1:${port}`;
  const one={url,token:'one',actor:'one',role:'owner',pubkey:alice},two={url,token:'two',actor:'two',role:'editor',pubkey:bob};
  writeFileSync(join(dir,'client.json'),JSON.stringify({...one,users:[two]}));const app=startServer({port,dir,demo:false});await once(app.server,'listening');
  try{const owner=app.store.authorize(one.token),s=app.store.read(owner);app.store.mutate(owner,{action:'configure',requestId:'setup',expectedRevision:0,projects:s.projects,members:[{id:'alice',name:'Alice',buzzPubkey:alice},{id:'bob',name:'Bob',buzzPubkey:bob}]});assert.equal((await request('read',{},join(dir,'client.json'),alice)).currentMemberId,'alice');assert.equal((await request('read',{},join(dir,'client.json'),bob)).currentMemberId,'bob');await assert.rejects(()=>request('read',{},join(dir,'client.json'),'c'.repeat(64)),/尚未绑定/);const spoof=await fetch(url+'/api/state',{headers:{authorization:'Bearer one','x-calendar-viewer':bob}});assert.equal(spoof.status,403);}finally{await app.close();}
});
