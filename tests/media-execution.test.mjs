import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {canExecuteInChannel, executionPreference, readExecutionPreference, openExecutionSolo, createExecutionPanel} from '../src/media-workspace/execution.mjs';
import {clampSplit} from '../src/media-workspace/split-pane.mjs';
import {execFileSync} from 'node:child_process';
const channel={id:'existing',name:'执行样本',channelType:'solo',private:true,creator:'owner',members:['owner'],archived:false};
const session=()=>({viewer:'owner',channels:{list:()=>({status:'ready',channels:[channel]}),subscribeList:()=>()=>{},ensureList(){}}});
test('execution route filters stale access and keeps identity and community preferences separate',()=>{
  for(const key of ['archived','readOnly','cached','pending','metadataPending','metadataCached'])assert.equal(canExecuteInChannel({...channel,[key]:true},'owner'),false);
  assert.equal(canExecuteInChannel(channel,'other'),false);
  assert.equal(canExecuteInChannel({...channel,channelType:'stream'},'owner'),true);
  assert.notEqual(executionPreference('factory',{scope:'a',session:{viewer:'one'}}),executionPreference('factory',{scope:'a',session:{viewer:'two'}}));
  assert.deepEqual(readExecutionPreference('x',{getItem:()=>'{bad'}),{channel:''});
  assert.ok(clampSplit(.999,1200)<.9);
});
test('execution panel delegates the full conversation to native Workspace, never hand renders messages',()=>{
  const s=session(),connection={status:'ready',scope:'test',generation:1,session:s};
  const saved=globalThis.localStorage;globalThis.localStorage={getItem:()=>JSON.stringify({channel:'existing'})};
  let received,registered=0;
  try{
    const Panel=createExecutionPanel({react:React,relay:{snapshot:()=>connection},conversation:{registerTool(){registered++;},ui:{Workspace:props=>{received=props;return React.createElement('main',null,'native-workspace');}}}},{pluginId:'test.factory',title:'内容工厂'});
    const html=renderToStaticMarkup(React.createElement(Panel,{connection}));
    assert.match(html,/native-workspace/);assert.match(html,/执行会话/);assert.equal(registered,1);
    assert.equal(received.session,s);assert.deepEqual(received.target,{channelId:'existing'});assert.equal(received.scope,'test');
  }finally{globalThis.localStorage=saved;}
});
test('New Solo reserves before creation, reopens the same ID, and never sends a message',async()=>{
  const s=session();let saved={channel:''},startCount=0,createdId;
  const channels=[channel];s.channels.list=()=>({status:'ready',channels});
  s.channelWrites={available:true,start(id,title,members){assert.equal(saved.solo,id);assert.deepEqual(members,[]);startCount++;createdId=id;channels.push({...channel,id});return {create:'operation',ready:Promise.resolve()};},refresh:async()=>{}};
  const args={session:s,check(){},save:r=>saved=r,title:'工厂 · 执行'};
  const id=await openExecutionSolo({...args,record:saved});assert.equal(id,createdId);assert.equal(saved.channel,id);
  assert.equal(await openExecutionSolo({...args,record:saved}),id);assert.equal(startCount,1);
});
test('uncertain Solo creation keeps reservation; retry only refreshes, and revoked access stops writes',async()=>{
  const s=session();let saved={},starts=0,revoked=false;
  s.channelWrites={available:true,start(){starts++;return {create:'op',ready:Promise.reject(Error('uncertain'))};},refresh:async()=>{}};
  const args={session:s,check(){if(revoked)throw Error('revoked');},save:r=>saved=r,title:'工厂'};
  await assert.rejects(openExecutionSolo({...args,record:saved}),/uncertain/);const id=saved.solo;
  await assert.rejects(openExecutionSolo({...args,record:saved}),/不重复创建/);assert.equal(saved.solo,id);assert.equal(starts,1);
  revoked=true;await assert.rejects(openExecutionSolo({...args,record:{}}),/revoked/);assert.equal(starts,1);
});
test('media bridge validates source, token boundary, GET, HEAD and range in a real loopback process',()=>{
  const output=execFileSync('python3',['tests/media_stream_test.py'],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000});
  assert.match(output,/MEDIA_STREAM_OK/);
});
test('closing execution cancels an in-flight Solo wait without replaying creation',async()=>{
  const s=session();let saved={},created=0;const controller=new AbortController();
  s.channelWrites={available:true,start(){created++;return {create:'op',ready:new Promise(()=>{})};}};
  const request=openExecutionSolo({session:s,record:{},check(){},save:r=>saved=r,title:'工厂',signal:controller.signal});
  controller.abort();await assert.rejects(request,/执行栏已关闭/);assert.equal(created,1);assert.equal(saved.phase,'submitted');assert.ok(saved.solo);
});
