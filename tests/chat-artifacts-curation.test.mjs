import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCuration, curate, curationValue, groupedArtifacts, createCurationStore, registerArtifactTools, artifactsFrom } from '../plugins/opcb.chat-artifacts/2.0.0/plugin.js';
const id = n => n.toString(16).padStart(64, '0');
const aid = n => `${id(n)}:https://example.com/${n}.png`;
const human = { actor: id(99), actorKind: 'human' }, agent = { actor: id(88), actorKind: 'agent' };
function database() {
  const values = new Map(), listeners = new Set(); let fail = false;
  return { values, fail(value) { fail = value; }, open() { return { scope: { viewer: id(99), relay: 'https://relay.example' }, subscribe(f) { listeners.add(f); return () => listeners.delete(f); }, close() {}, preferences: { async get(key) { return structuredClone(values.get(key)); }, async update(key, change) { if(fail) throw Error('disk full'); values.set(key, structuredClone(change(structuredClone(values.get(key))))); for(const f of listeners) f(); } } }; } };
}
test('favorite means recognition by the actual operator, remains version-specific and checks revision', () => {
  const initial = emptyCuration();
  const one = curate(initial, {type:'favorite', ids:[aid(1)], value:true, ...human});
  const two = curate(one, {type:'favorite', ids:[aid(2)], value:true, expected:1, ...agent});
  assert.equal(two.favorites[aid(1)].actorKind,'human'); assert.equal(two.favorites[aid(2)].actorKind,'agent');
  assert.deepEqual(initial.favorites,{});
  assert.throws(()=>curate(two,{type:'favorite',ids:[aid(1)],value:false,expected:1,...human}),/变化/);
});
test('corrupt recognition or overlapping groups are rejected without resetting stored data', () => {
  assert.throws(()=>curationValue({...emptyCuration(),favorites:{bad:{actor:id(99),actorKind:'human'}}}),/损坏/);
  const one=curate(undefined,{type:'group',ids:[aid(1),aid(2)],groupId:'g-one',title:'图',...human});
  const broken=structuredClone(one);broken.groups['g-duplicate']=structuredClone(one.groups['g-one']);
  assert.throws(()=>curationValue(broken),/重复/);assert.equal(broken.groups['g-one'].versions.length,2);
});
test('recognized-only group view selects an approved version even when the current version is unapproved', () => {
  const entries=artifactsFrom([1,2].map(n=>({id:id(n),createdAt:n,content:`https://example.com/${n}.png`})));
  const grouped=curate(undefined,{type:'group',ids:[aid(1),aid(2)],groupId:'g-one',title:'图',...human});
  const marked=curate(grouped,{type:'favorite',ids:[aid(1)],value:true,...human});
  assert.equal(groupedArtifacts(entries,marked,true)[0].version,1);
  assert.equal(groupedArtifacts(entries,marked,false)[0].version,2);
});
test('grouping collapses cards while keeping every source, versions can switch and ungroup without deleting files', () => {
  const entries=artifactsFrom([1,2,3].map(n=>({id:id(n),channelId:'chat',createdAt:n,authorId:id(99),content:`https://example.com/${n}.png`,attachments:[]})));
  const one=curate(undefined,{type:'group',ids:[aid(1),aid(2),aid(3)],groupId:'g-one',title:'方案图',...human});
  const cards=groupedArtifacts(entries,one);
  assert.equal(cards.length,1); assert.equal(cards[0].versions.length,3); assert.equal(cards[0].version,3); assert.equal(entries.length,3);
  const two=curate(one,{type:'current',ids:[aid(1)],groupId:'g-one',...agent});
  assert.equal(groupedArtifacts(entries,two)[0].version,1);
  const three=curate(two,{type:'ungroup',ids:[aid(1)],...human}); assert.equal(groupedArtifacts(entries,three).length,2); assert.equal(entries.length,3);
  assert.throws(()=>curate(two,{type:'current',ids:[aid(4)],groupId:'g-one',...human}),/不属于/);
});
test('joining an existing version group retains hidden older versions and does not infer groups from filenames', () => {
  const one=curate(undefined,{type:'group',ids:[aid(1),aid(2)],groupId:'g-old',title:'图',...human});
  const two=curate(one,{type:'group',ids:[aid(2),aid(3)],groupId:'g-new',title:'图',...human});
  assert.deepEqual(two.groups['g-old'].versions,[aid(1),aid(2),aid(3)]); assert.equal(Object.keys(two.groups).length,1);
  const entries=artifactsFrom([1,2].map(n=>({id:id(n),createdAt:n,content:'[same](https://example.com/a.png)'})));
  assert.equal(groupedArtifacts(entries,emptyCuration()).length,2);
});
test('native storage migrates old favorites once, shares UI/Agent changes and leaves confirmed state intact on failure', async () => {
  const db=database(), a=createCurationStore(db.open(),'chat',()=>{},[aid(1)],id(99));
  await a.start(); assert.equal(a.snapshot().value.favorites[aid(1)].actorKind,'legacy');
  await a.mutate({type:'favorite',ids:[aid(1)],value:false,...agent}); a.dispose();
  const b=createCurationStore(db.open(),'chat',()=>{},[aid(1)],id(99)); await b.start(); assert(!b.snapshot().value.favorites[aid(1)]);
  db.fail(true); await assert.rejects(b.mutate({type:'favorite',ids:[aid(2)],value:true,...human}),/disk full/);
  assert(!b.snapshot().value.favorites[aid(2)]); assert.match(b.snapshot().error,/disk full/); b.dispose();
});
function toolFixture() {
  const db=database(), tools=new Map(), listeners=new Set(), rows=[1,2].map(n=>({id:id(n),channelId:'chat',createdAt:100-n,authorId:id(88),content:`[方案${n}](https://example.com/${n}.png)`,attachments:[],agentEnvelope:true}));
  const session={ viewer:id(99), channels:{get:()=>({visibility:'private',members:[id(99)]}),subscribeList:()=>()=>{}},profiles:{snapshot:()=>new Map()},subscribeLive:()=>()=>{},readRemote:async()=>rows.map(row=>({id:row.id,kind:9,created_at:row.createdAt,tags:[['h','chat']]})),thread:(channel, message)=>{let target;return{subscribe:()=>()=>{},snapshot:()=>target,async refresh(){target={targetStatus:'ready',target:rows.find(row=>row.id===message)}},dispose(){}}}};
  const connection={status:'ready',scope:'https://relay.example:'+id(99),generation:1,session};
  const relay={snapshot:()=>connection,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)}};
  const ctx={relay,agents:{relay:()=>relay,addTool:tool=>tools.set(tool.name,tool),addInstructions(){}},artifactStorage:{open:()=>db.open()}};
  const cache={load:async()=>undefined,commit:async()=>{},text:async()=>undefined,clear:async()=>{}};
  const controller=new AbortController(), checked=[];
  const client={signal:controller.signal,key:id(88),pubkey:id(88),owner:id(99),effectiveEdit:async message=>{checked.push(message);return{id:message}}};
  registerArtifactTools(ctx,cache);
  return{tools,client,controller,checked,db,connection};
}
test('Agent search checks source access, defaults to recognized results, and mutates with the Agent identity', async()=>{
  const f=toolFixture(), call=(name,args)=>f.tools.get(name).call(f.client,{channel:'chat'},args);
  const empty=JSON.parse(await call('opcb_artifact_search',{})); assert.equal(empty.results.length,0);
  const all=JSON.parse(await call('opcb_artifact_search',{favorites_only:false})); assert.equal(all.results.length,2); assert.equal(f.checked.length,2);
  const mark=JSON.parse(await call('opcb_artifact_favorite',{ids:[all.results[0].id],expected_revision:0,value:true})); assert.equal(mark.operatorKind,'agent');
  const approved=JSON.parse(await call('opcb_artifact_search',{})); assert.equal(approved.results.length,1); assert.equal(approved.results[0].recognition.actor,id(88));
});
test('an unreadable source, foreign owner, absent cancellation or stopped call cannot mutate recognition',async()=>{
  const f=toolFixture(); const favorite=()=>f.tools.get('opcb_artifact_favorite').call(f.client,{channel:'chat'},{ids:[aid(1)],value:true,expected_revision:0});
  f.client.effectiveEdit=async()=>{throw Error('denied')}; await assert.rejects(favorite(),/denied/); assert.deepEqual(f.db.values.get('chat').favorites,{});
  const search=()=>f.tools.get('opcb_artifact_search').call(f.client,{channel:'chat'},{favorites_only:false});
  assert.equal(JSON.parse(await search()).results.length,0);
  f.client.owner=id(3);await assert.rejects(search(),/权限|有权/);
  f.client.owner=id(99);f.controller.abort();await assert.rejects(favorite(),/abort/i);
  delete f.client.signal;await assert.rejects(search(),/取消信号/);
});
