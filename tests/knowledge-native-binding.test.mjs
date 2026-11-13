import test from 'node:test';
import assert from 'node:assert/strict';
import {publishPersonalBinding} from '../src/knowledge/identity-client.mjs';

function fixture(delivery){
  let listener,record,reads=0;
  const event={id:'e'.repeat(64),kind:45010,content:'fixture',sig:'s'};
  return {event,get reads(){return reads;},session:{
    channels:{get:()=>({visibility:'private'})},
    outbox:{supports:k=>k===45010,ready:async()=>{},subscribe:fn=>{listener=fn;return()=>listener=null;},snapshot:()=>record?[record]:[],
      send:()=>{record=delivery==='retired'?null:{event,signed:event,delivery};queueMicrotask(()=>listener?.());return event.id;}},
    read:async()=>{reads++;return [event];},
  }};
}
test('personal binding uses accepted native events and survives immediate receipt retirement',async()=>{
  for(const delivery of ['accepted','retired']){
    const f=fixture(delivery);assert.equal(await publishPersonalBinding(f.session,'private','fixture'),f.event);
    assert.equal(f.reads,delivery==='retired'?1:0);
  }
});
test('refused native signature, public channel and aborted intent cannot establish a binding',async()=>{
  const f=fixture('failed');await assert.rejects(publishPersonalBinding(f.session,'private','fixture'),/拒绝/);assert.equal(f.reads,0);
  const publicSession=fixture('accepted').session;publicSession.channels.get=()=>({visibility:'open'});
  await assert.rejects(publishPersonalBinding(publicSession,'open','fixture'),/私人对话/);
  const controller=new AbortController();controller.abort();await assert.rejects(publishPersonalBinding(fixture('accepted').session,'private','fixture',{signal:controller.signal}));
});
