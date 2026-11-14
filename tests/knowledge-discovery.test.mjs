import test from 'node:test';
import assert from 'node:assert/strict';
import {searchLibraries} from '../src/knowledge/discovery.mjs';
const catalog=[{source_id:'recordings',display_name:'工作资料',state:'ready'},{source_id:'research',display_name:'产品研究',state:'ready'}];
test('cross-library results retain their source even when note ids coincide',async()=>{
  const calls=[];const service={read:async(id,request)=>{calls.push(request);return {results:[{id:'same',title:request.source}]};}};
  const result=await searchLibraries(service,{},[...catalog,catalog[0],{source_id:'unknown'}],'计划');
  assert.deepEqual(result.documents.map(doc=>doc.sourceId),['recordings','research']);
  assert.equal(calls.length,2);assert.ok(calls.every(call=>call.op==='search'&&call.limit===10&&call.query==='计划'));
});
test('a denied library fails closed instead of presenting a partially authorized result set',async()=>{
  const denied=Object.assign(Error('revoked'),{denied:true});
  const service={read:async(id,request)=>{if(request.source==='research')throw denied;return {results:[{id:'100'}]};}};
  await assert.rejects(searchLibraries(service,{},catalog,'计划'),error=>error===denied);
});
test('partial network failures are identified, and total unavailability is not reported as no matches',async()=>{
  const service={read:async(id,request)=>{if(request.source==='research')throw Error('offline');return {results:[]};}};
  assert.deepEqual((await searchLibraries(service,{},catalog,'计划')).unavailable,['产品研究']);
  await assert.rejects(searchLibraries({read:async()=>{throw Error('offline');}},{},catalog,'计划'),/暂未返回/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(searchLibraries(service,{},catalog,'计划',{signal:controller.signal}));
});

test('sources awaiting synchronization are reported without making a read that the service must refuse',async()=>{
  const calls=[];const service={read:async(id,request)=>{calls.push(request.source);return {results:[]};}};
  const result=await searchLibraries(service,{},[catalog[0],{...catalog[1],state:'stale'}],'计划');
  assert.deepEqual(calls,['recordings']);assert.deepEqual(result.unavailable,['产品研究']);
});
