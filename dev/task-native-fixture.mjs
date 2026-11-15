// Isolated host-contract fixture. Never connects a relay or sends a real message.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {apply} from '../src/tasks/task-center.mjs';
const h=React.createElement,viewer='a'.repeat(64),agent='b'.repeat(64),source='7dc199bc-755b-47bb-8f71-fe311b1f1ab1';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let event={id:'c'.repeat(64),created_at:Math.floor(Date.now()/1000),content:`# 隔离任务接口测试\n## 人员分工\n|人员|主要负责|日期|状态|\n|---|---|---|---|\n|测试成员|验证独立勾选|${today}|待开始|\n## 全部任务时间表（目标节点）\n| 编号/人员 | 日期 | 时间/持续安排 | 团队 |\n|---|---|---|---|\n|测试成员|${today}|10:00|OPCB 团队|\n## 每日执行与验收\n`};
const channels=[{id:source,name:'任务来源',channelType:'stream',members:[viewer,agent],creator:viewer},{id:'test-solo',name:'隔离 Solo',channelType:'solo',private:true,members:[viewer,agent],creator:viewer},{id:'test-channel',name:'隔离频道',channelType:'stream',members:[viewer,agent],creator:viewer},{id:'not-joined',name:'不可访问频道',channelType:'stream',members:[agent]}];
const roster={status:'ready',channels},choices={selectable:[{pubkey:agent}],pending:false};
const windowState={status:'ready',rows:[],hasMore:false};
const messageRows=new Map();let messageNumber=200;
const trace=window.__taskFixture={writes:[],composers:[],sent:[],events:[],failSave:false};
const session={viewer,channels:{list:()=>roster,subscribeList:()=>()=>{},ensureList(){},window:()=>windowState,subscribeWindow:()=>()=>{},ensure(id){trace.events.push({ensure:id});}},agentChoices:{snapshot:()=>choices,subscribe:()=>()=>{},ensure(){}},canvas:{available:true,read:async()=>event,save:async(channel,content,expected,options)=>{if(trace.failSave)throw Error('模拟版本冲突');if(expected!==event.id)throw Error('CAS冲突');trace.writes.push({channel,content,expected,options});event={id:(trace.writes.length+10).toString(16).padStart(64,'0'),created_at:event.created_at+1,content};return event;}},messages:{retry(){},async send(channel,content,mentions){const id=(messageNumber++).toString(16).padStart(64,'0');messageRows.set(id,{id,channelId:channel,authorId:viewer,content,createdAt:Math.floor(Date.now()/1000),attachments:[]});trace.sent.push({channel,text:content,mentions,id});return {id};}},thread:(channel,id)=>({refresh:async()=>{},snapshot:()=>({targetStatus:messageRows.has(id)?'ready':'error',target:messageRows.get(id)}),dispose(){}}),media:()=>''};
const connection={status:'ready',scope:'fixture-scope',generation:1,session};
let Page;window.__taskFixtureTools={};
window.__taskFlowTest={
  read:()=>event,
  revoke:()=>{channels.find(c=>c.id===source).members=[];},
  message:(content,authorId=viewer,channelId='test-solo')=>{const id=(messageNumber++).toString(16).padStart(64,'0');messageRows.set(id,{id,channelId,authorId,content,createdAt:Math.floor(Date.now()/1000),attachments:[]});return id;},
  call:async(args,channel='test-solo')=>JSON.parse(await window.__taskFixtureTools.opcb_task_flow.call({key:'test',owner:viewer,pubkey:agent,signal:new AbortController().signal,effectiveEdit:async id=>{if(!messageRows.has(id))throw Error('不可读');}}, {channel},args))
};
apply({react:React,relay:{snapshot:()=>connection,subscribe:()=>()=>{}},pages:{register:p=>{Page=p.component;}},panels:{register(){}},agents:{addInstructions(value){trace.instructions=value;},addTool(tool){window.__taskFixtureTools[tool.name]=tool;},relay:()=>({snapshot:()=>connection})},conversation:{ui:{Conversation:({children})=>children({onOpenLink(){}}),Message:()=>null,Composer:props=>{trace.composers.push({channel:props.channelId,sessionSame:props.session===session,scope:props.scope,solo:props.soloConversation,own:props.ownSoloConversation});return h('form',{className:'fixture-composer',onSubmit:e=>{e.preventDefault();trace.sent.push({channel:props.channelId,text:new FormData(e.currentTarget).get('instruction')});}},h('p',null,'隔离原生 Composer 接口 · 不发送真实消息'),h('textarea',{name:'instruction','aria-label':'执行指令'}),h('button',{type:'submit'},'隔离发送'));}}}});
createRoot(document.getElementById('app')).render(h(Page));
