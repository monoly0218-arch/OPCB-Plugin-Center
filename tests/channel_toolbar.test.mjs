import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {withChannelToolbar,channelControl} from '../src/channel-toolbar/context.mjs';
const root=new URL('../',import.meta.url);
const rows=JSON.parse(await readFile(new URL('src/channel-toolbar/RELEASES.json',root)));
function capture(){
 const seen=[];
 const ctx={react:React,effect:()=>{},reflect:{get:()=>undefined},browser:{available:false},host:{request(){throw Error('Unexpected network');}},relay:{snapshot:()=>({status:'disconnected',session:{}}),subscribe:()=>()=>{}}};
 for(const service of ['pages','panels','agents','settingsCards','conversation','accountActions','shortcuts'])ctx[service]=new Proxy({}, {get:(_,name)=>value=>seen.push([`${service}.${String(name)}`,value])});
 return {ctx,seen};
}
test('installed package upgrades preserve registrations, grants, tools and panel routes; combined header has exactly two launchers',async()=>{
 const launchers=[];
 for(const row of rows){
  const before=capture(),after=capture();
  (await import(new URL(row.basePath+'/plugin.js',root))).apply(before.ctx);
  (await import(new URL(row.sourcePath+'/plugin.js',root))).apply(after.ctx);
  assert.deepEqual(after.seen.map(([name,v])=>[name,v?.id||v?.name]),before.seen.map(([name,v])=>[name,v?.id||v?.name]));
  assert.deepEqual(JSON.parse(await readFile(new URL(row.basePath+'/manifest.json',root))),JSON.parse(await readFile(new URL(row.sourcePath+'/manifest.json',root))));
  for(let i=0;i<after.seen.length;i++){
   const [name,next]=after.seen[i],previous=before.seen[i][1];
   if(name==='panels.register'){
    assert.equal(next.title,previous.title);
    assert.equal(next.channelPlacement,previous.channelPlacement);
    for(const route of ['opcb:chat-artifacts:channel-a','opcb-task-progress:channel-a','higgsfield-mailbox:pool','opcb-project-space:space:channel-a','opcb-project-space:artifacts:channel-a','https://example.com'])assert.equal(next.matches(route),previous.matches(route));
    if(next.channelLauncher)launchers.push([row.id,next]);
   }else if(name==='pages.register'){
    for(const key of ['id','title','primary','placement','layout','icon'])assert.equal(next[key],previous[key]);
   }else if(name==='agents.addTool'){
    for(const key of ['name','description','inputSchema'])assert.deepEqual(next[key],previous[key]);
   }else if(name==='agents.addInstructions')assert.equal(next.text,previous.text);
  }
 }
 assert.deepEqual(launchers.map(([id])=>id),['opcb.chat-artifacts','opcb.task-center']);
 for(const [id,panel] of launchers){
  const calls=[],target=(id==='opcb.chat-artifacts'?'opcb:chat-artifacts:':'opcb-task-progress:')+'channel-a';let available=true,focused=0;
  const props={context:{channelId:'channel-a'},pressed:true,available:()=>available,toggle:value=>calls.push(value)};
  const control=panel.channelLauncher(props);
  assert.equal(control.props['aria-label'],id==='opcb.chat-artifacts'?'产物':'任务');
  assert.equal(control.props['data-icon-size'],'toolbar');
  assert.equal(control.props['aria-expanded'],true);
  control.props.onClick({currentTarget:{focus(){focused++;}}});
  assert.deepEqual(calls,[target]);assert(panel.matches(target));assert.equal(focused,1);
  // The availability check must use live access even if this event raced a rerender.
  available=false;control.props.onClick({currentTarget:{focus(){focused++;}}});
  assert.deepEqual(calls,[target]);assert.equal(focused,1);
  assert.equal(panel.channelLauncher(props).props.disabled,true);
 }
});
test('toolbar proxy retains service receivers and leaves unrelated panels unchanged',()=>{
 let result;const panels={register(value){assert.equal(this,panels);result=value;return 'registered';}},ctx={react:React,panels,effect(){assert.equal(this,ctx);}};
 const proxy=withChannelToolbar(ctx,'opcb.project-workspace'),plain={id:'unrelated',channelLauncher:()=>null};
 assert.equal(proxy.panels.register(plain),'registered');assert.equal(result,plain);proxy.effect();
 const control=channelControl(React,'tasks',{context:{channelId:'x'},available:()=>true,toggle(){}});
 assert.equal(control.props.children.props.children.props.width,16);
});
