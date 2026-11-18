import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import * as source from '../src/muse-link/plugin.js';
import * as packaged from '../plugins/opcb.muse-link/0.2.0/plugin.js';

const owner='1'.repeat(64),agent='2'.repeat(64),eventId='3'.repeat(64),root='4'.repeat(64);
function harness(plugin,{type='stream',response,channel='current-chat',config={channel:'old-bound-chat'}}={}) {
  let registration,stdout,cleanup,killed=0;
  const writes=[],publishes=[],roster={id:channel,channelType:type,members:[owner,agent]};
  const list={status:'ready',channels:[roster]};
  const snapshot={status:'ready',viewer:owner,session:{channels:{list:()=>list,get:id=>list.channels.find(c=>c.id===id)}}};
  let sentResolve;const sent=new Promise(resolve=>sentResolve=resolve);
  const child={exited:new Promise(()=>{}),kill(){killed++;},async write(text){
    const value=JSON.parse(text);if(typeof value==='string')return;
    writes.push(value);sentResolve(value);
    if(response)queueMicrotask(()=>stdout(JSON.stringify(typeof response==='function'?response(value):response)+'\n'));
  }};
  const ctx={react:{createElement,useState:v=>[v,()=>{}],useEffect(){}},
    agents:{register:r=>registration=r,relay(key){assert.equal(key,'native-key');return {snapshot:()=>snapshot};}},
    host:{async spawn(id,opts){assert.equal(id,'bridge');stdout=opts.onStdout;return child;}},effect(fn){cleanup=fn();}};
  plugin.apply(ctx);
  const abort=new AbortController();
  const delivery={trigger:{type:'mention',event:{kind:9,id:eventId,pubkey:owner,content:'只回复收到',tags:[['h',channel],['p',agent],['e',root,'','reply']]}},
    channelId:channel,config,current:()=>true,signal:abort.signal,
    agent:{key:'native-key',pubkey:agent,owner,async publish(event,check){check?.();publishes.push(event);}}};
  return {ctx,delivery,registration,writes,publishes,sent,abort,roster,list,snapshot,
    respond(value){stdout(JSON.stringify(value)+'\n');},cleanup:()=>cleanup(),get killed(){return killed;}};
}
const reply=request=>({ok:true,request_id:request.request_id,message:'收到'});
for(const [name,plugin] of [['source',source],['package',packaged]]) {
  test(`${name}: owner can use every channel with stale or absent legacy binding`,async()=>{
    for(const config of [{channel:'different-chat'},{}]){
      const h=harness(plugin,{config,response:reply});
      await h.registration.run(h.delivery);
      assert.equal(h.writes.length,1);assert.equal(h.writes[0].message,'只回复收到');
      assert.deepEqual(h.publishes[0].tags,[['h','current-chat'],['p',owner],['e',root,'','reply']]);
      await h.registration.run(h.delivery);assert.equal(h.writes.length,1);h.cleanup();
    }
  });
  test(`${name}: Solo and DM always publish at top level, including a threaded incoming message`,async()=>{
    for(const type of ['solo','dm']){
      const h=harness(plugin,{type,response:reply});await h.registration.run(h.delivery);
      assert.deepEqual(h.publishes[0].tags,[['h','current-chat'],['p',owner]]);h.cleanup();
    }
  });
  test(`${name}: forum and new channel messages retain the correct thread`,async()=>{
    const h=harness(plugin,{type:'forum',response:reply});h.delivery.trigger.event.tags=[['h','current-chat'],['p',agent]];
    await h.registration.run(h.delivery);assert.deepEqual(h.publishes[0].tags.at(-1),['e',eventId,'','reply']);h.cleanup();
  });
  test(`${name}: non-owner, indirect wakes and ambiguous event routes send nothing`,async()=>{
    const cases=[d=>d.trigger.event.pubkey=agent,d=>d.trigger.type='watch',d=>d.trigger.event.tags.push(['h','other']),
      d=>d.trigger.event.tags=[['h','other']],d=>delete d.channelId,d=>d.trigger.event.kind=1,d=>d.trigger.event.id='invalid'];
    for(const mutate of cases){const h=harness(plugin);mutate(h.delivery);await h.registration.run(h.delivery);assert.equal(h.writes.length,0);h.cleanup();}
  });
  test(`${name}: current host identity and both members are required before sending`,async()=>{
    const cases=[h=>h.snapshot.viewer=agent,h=>h.snapshot.status='disconnected',h=>h.list.status='loading',
      h=>h.roster.members=[owner],h=>h.roster.members=[agent],h=>delete h.roster.members,
      h=>h.list.channels=[],h=>h.roster.channelType='system',
      ...['archived','readOnly','cached','pending','metadataPending','metadataCached'].map(flag=>h=>h.roster[flag]=true)];
    for(const mutate of cases){const h=harness(plugin);mutate(h);await assert.rejects(h.registration.run(h.delivery),/权限/);assert.equal(h.writes.length,0);h.cleanup();}
  });
  test(`${name}: owner removal or conversation reclassification during Muse work blocks publication`,async()=>{
    for(const mutate of [h=>h.roster.members=[agent],h=>h.roster.channelType='solo']){
      const h=harness(plugin),promise=h.registration.run(h.delivery),request=await h.sent;mutate(h);h.respond(reply(request));
      await assert.rejects(promise);assert.equal(h.publishes.length,0);h.cleanup();
    }
  });
  test(`${name}: native before-signing callback rechecks membership`,async()=>{
    const h=harness(plugin,{response:reply});h.delivery.agent.publish=async(_event,check)=>{h.roster.members=[owner];check();};
    await assert.rejects(h.registration.run(h.delivery),/权限/);assert.equal(h.publishes.length,0);h.cleanup();
  });
  test(`${name}: losing membership while the bridge starts prevents forwarding the message`,async()=>{
    const h=harness(plugin),spawn=h.ctx.host.spawn;
    h.ctx.host.spawn=async(...args)=>{const child=await spawn(...args);h.roster.members=[owner];return child;};
    await assert.rejects(h.registration.run(h.delivery),/权限/);
    assert.equal(h.writes.length,0);assert.equal(h.publishes.length,0);h.cleanup();
  });
  test(`${name}: cancelling a pending request prevents a late reply`,async()=>{
    const h=harness(plugin),promise=h.registration.run(h.delivery);await h.sent;h.abort.abort();
    await assert.rejects(promise);assert(h.killed>0);assert.equal(h.publishes.length,0);h.cleanup();
  });
  test(`${name}: uncorrelated acknowledgements and failures cannot appear as replies`,async()=>{
    for(const response of [{ok:true,published:false},{ok:true,request_id:'wrong',message:'stale'},{ok:false,error:'reply_timeout'}]){
      const h=harness(plugin,{response});await assert.rejects(h.registration.run(h.delivery));assert.equal(h.publishes.length,0);h.cleanup();
    }
  });
  test(`${name}: another conversation cannot take over an in-flight request`,async()=>{
    const h=harness(plugin),promise=h.registration.run(h.delivery),request=await h.sent;
    const second={...h.delivery,trigger:{...h.delivery.trigger,event:{...h.delivery.trigger.event,id:'5'.repeat(64)}}};
    await assert.rejects(h.registration.run(second),/另一条请求/);assert.equal(h.writes.length,1);
    h.respond(reply(request));await promise;assert.equal(h.publishes.length,1);h.cleanup();
  });
}
