// Isolated host-contract fixture. Never connects a relay or sends a real message.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {apply} from '../src/tasks/task-center.mjs';
const h=React.createElement,viewer='a'.repeat(64),agent='b'.repeat(64),source='7dc199bc-755b-47bb-8f71-fe311b1f1ab1';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let event={id:'c'.repeat(64),created_at:Math.floor(Date.now()/1000),content:`# 隔离任务接口测试\n## 人员分工\n|人员|主要负责|日期|状态|\n|---|---|---|---|\n|测试成员|验证独立勾选|${today}|待开始|\n## 全部任务时间表（目标节点）\n| 编号/人员 | 日期 | 时间/持续安排 | 团队 |\n|---|---|---|---|\n|测试成员|${today}|10:00|OPCB 团队|\n## 每日执行与验收\n`};
const channels=[{id:source,name:'任务来源',channelType:'stream',members:[viewer,agent],creator:viewer},{id:'test-solo',name:'OPCB 任务协作 · 演示',channelType:'solo',private:true,members:[viewer,agent],creator:viewer},{id:'test-channel',name:'隔离频道',channelType:'stream',members:[viewer,agent],creator:viewer},{id:'not-joined',name:'不可访问频道',channelType:'stream',members:[agent]}];
const roster={status:'ready',channels},choices={selectable:[{pubkey:agent,name:'任务 Agent'}],pending:false};
const windowState={status:'ready',rows:[{id:'demo-user',author:'你 · 演示',text:'把这一轮的交付链接找出来，帮我核对一下版本。'},{id:'demo-agent',author:'任务 Agent · 演示',text:'先读取当前任务和轮次，再核对原对话里的交付记录。确认后补齐链接并更新为待验收。'}],hasMore:false};
const messageRows=new Map();let messageNumber=200;
const trace=window.__taskFixture={writes:[],composers:[],sent:[],events:[],failSave:false};
const session={viewer,channels:{list:()=>roster,subscribeList:()=>()=>{},ensureList(){},window:()=>windowState,subscribeWindow:()=>()=>{},ensure(id){trace.events.push({ensure:id});}},agentChoices:{snapshot:()=>choices,subscribe:()=>()=>{},ensure(){}},canvas:{available:true,read:async()=>event,save:async(channel,content,expected,options)=>{if(trace.failSave)throw Error('模拟版本冲突');if(expected!==event.id)throw Error('CAS冲突');trace.writes.push({channel,content,expected,options});event={id:(trace.writes.length+10).toString(16).padStart(64,'0'),created_at:event.created_at+1,content};return event;}},messages:{retry(){},async send(channel,content,mentions){const id=(messageNumber++).toString(16).padStart(64,'0');messageRows.set(id,{id,channelId:channel,authorId:viewer,content,createdAt:Math.floor(Date.now()/1000),attachments:[]});trace.sent.push({channel,text:content,mentions,id});return {id};}},thread:(channel,id)=>({refresh:async()=>{},snapshot:()=>({targetStatus:messageRows.has(id)?'ready':'error',target:messageRows.get(id)}),dispose(){}}),media:()=>''};
const connection={status:'ready',scope:'fixture-scope',generation:1,session};
let Page;const composerTools=[];const fixtureDrafts=new Map();window.__taskFixtureTools={};
function FixtureComposer(props){
 const [text,setText]=React.useState(()=>fixtureDrafts.get(props.channelId)||''),ref=React.useRef(null);
 const change=value=>{fixtureDrafts.set(props.channelId,value);setText(value);};
 const insertText=React.useCallback(value=>{if(trace.rejectInsert)return false;const field=ref.current,start=field?.selectionStart??text.length,end=field?.selectionEnd??start;change(text.slice(0,start)+value+text.slice(end));trace.events.push({insert:props.channelId});return true;},[text,props.channelId]);
 return h('form',{className:'fixture-composer',onSubmit:e=>{e.preventDefault();trace.sent.push({channel:props.channelId,text});change('');}},
 h('textarea',{ref,'aria-label':'执行指令',placeholder:'说说要做什么…',value:text,onChange:e=>change(e.target.value)}),
 h('div',{className:'fixture-toolbar'},h('span',null,'任务 Agent'),...composerTools.map(tool=>h(tool.component,{key:tool.id,session,scope:props.scope,channelId:props.channelId,disabled:props.disabled,recipients:[{pubkey:agent,name:'任务 Agent'}],insertText,focus:()=>ref.current?.focus()})),h('button',{type:'submit',disabled:!text.trim(),'aria-label':'发送执行指令'},'↑')));
}

window.__taskFlowTest={
  read:()=>event,
  revoke:()=>{channels.find(c=>c.id===source).members=[];},
  message:(content,authorId=viewer,channelId='test-solo')=>{const id=(messageNumber++).toString(16).padStart(64,'0');messageRows.set(id,{id,channelId,authorId,content,createdAt:Math.floor(Date.now()/1000),attachments:[]});return id;},
  call:async(args,channel='test-solo')=>JSON.parse(await window.__taskFixtureTools.opcb_task_flow.call({key:'test',owner:viewer,pubkey:agent,signal:new AbortController().signal,effectiveEdit:async id=>{if(!messageRows.has(id))throw Error('不可读');}}, {channel},args))
};
apply({react:React,relay:{snapshot:()=>connection,subscribe:()=>()=>{}},pages:{register:p=>{Page=p.component;}},panels:{register(){}},agents:{addInstructions(value){trace.instructions=value;},addTool(tool){window.__taskFixtureTools[tool.name]=tool;},relay:()=>({snapshot:()=>connection})},conversation:{registerTool:tool=>composerTools.push(tool),ui:{Conversation:({children})=>children({onOpenLink(){}}),Message:({row})=>h('article',{className:'fixture-message'},h('small',null,row.author),h('p',null,row.text)),Composer:props=>{trace.composers.push({channel:props.channelId,sessionSame:props.session===session,scope:props.scope,solo:props.soloConversation,own:props.ownSoloConversation,requireMention:props.requireMention});return h(FixtureComposer,props);}}}});
createRoot(document.getElementById('app')).render(h(React.Fragment,null,h('div',{className:'fixture-notice'},'隔离预览 · 演示数据与输入框，仅验证插件接口，不发送真实消息'),h(Page)));
