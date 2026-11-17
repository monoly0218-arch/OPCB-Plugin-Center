// Actual plugin.apply under an isolated Buzz 1.0.4 public-API contract fixture.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {apply} from './plugin.mjs';
import {demoBoardData} from './demo.mjs';
import {replaceProject} from './model.mjs';
const boardDemo=OPCB_PROJECT_PREVIEW_DATA||demoBoardData();
window.__previewErrors=[];
window.addEventListener('error',e=>window.__previewErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.__previewErrors.push(String(e.reason)));
const fixture=new URL(location.href).searchParams.has('fixture'),panelMode=new URL(location.href).searchParams.has('panel');
const outsider=new URL(location.href).searchParams.has('outsider'),previewViewer=outsider?'isolated-manager':boardDemo.viewer||'demo-a';
const publicPreviews=new Map();
const nop=()=>()=>{},listeners=new Set(),rosterListeners=new Set(),profiles=new Map(boardDemo.profiles||[['demo-a',{displayName:'潘涛'}],['demo-b',{displayName:'角色 B'}],['demo-c',{displayName:'角色 C'}]]),pages=[],panels=[];
let roster={status:'ready',channels:fixture||panelMode?boardDemo.channels.map(c=>({...c,visibility:outsider?'public':c.visibility})):[]};
const heads=new Map(boardDemo.projects.map(p=>[p.id,{id:'fixture-head-'+p.id,content:replaceProject('# 隔离测试资料\n保留原文',p)}]));
window.__projectPreview={registrations:null,hostVersion:'Buzz 1.0.4 / API 1 contract fixture',writes:0,navigation:[],joins:[],conflict:false,conversations:[],fixtures:fixture||panelMode};
let visibleRosterSource,visibleRoster;const rosterSnapshot=()=>{if(visibleRosterSource!==roster){visibleRosterSource=roster;visibleRoster={...roster,channels:roster.channels.filter(c=>c.members?.includes(previewViewer))};}return visibleRoster;};
const session={viewer:previewViewer,attend:()=>()=>{},channelLifecycle:{available:true,async run(action,id){if(action!=='join')throw Error('Only join is allowed');window.__projectPreview.joins.push(id);const channel=roster.channels.find(c=>c.id===id);if(channel?.visibility!=='public')throw Error('Private');roster={...roster,channels:roster.channels.map(c=>c.id===id?{...c,members:[...(c.members||[]),previewViewer],readOnly:false}:c)};rosterListeners.forEach(fn=>fn());}},channels:{get:id=>publicPreviews.get(id),async readDirectory(){return{partial:false};},openDirectory:()=>roster.channels.filter(c=>c.visibility==='public').map(({id,name,channelType})=>({id,name,channelType})),async resolve(ids){ids.forEach(id=>{const c=roster.channels.find(c=>c.id===id);if(c?.visibility==='public')publicPreviews.set(id,{...c,readOnly:true});});},subscribeList:fn=>{rosterListeners.add(fn);return()=>rosterListeners.delete(fn);},list:rosterSnapshot,ensureList(){},window:id=>({channelId:id,status:'ready',freshness:'verified',rows:[],hasMore:false}),subscribeWindow:nop,ensure(){},loadOlder(){}},profiles:{subscribe:nop,snapshot:()=>profiles},canvas:{available:true,async read(id){return heads.get(id);},async save(id,content,expected,options){
 if(!(fixture||panelMode))throw Error('Preview must never write');
 if(window.__projectPreview.conflict||heads.get(id)?.id!==expected)throw Error('频道资料已变化，请刷新后重新编辑');
 if(!options.preserveApproval)throw Error('Partial editor cannot grant approval');
 window.__projectPreview.writes++;const saved={id:'fixture-save-'+window.__projectPreview.writes,content};heads.set(id,saved);return saved;
 }},subscribeLive:fn=>{window.__projectPreview.live=fn;return()=>{delete window.__projectPreview.live;};}};
const connection={status:'ready',scope:'https://isolated.example:'+session.viewer,generation:1,session};
const relay={snapshot:()=>connection,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
const reportListeners=new Set();let reportEntries=[];
const pageService={register:p=>pages.push(p),snapshot:()=>reportEntries,subscribe:fn=>{reportListeners.add(fn);return()=>reportListeners.delete(fn);}};
window.__projectPreview.report=enabled=>{reportEntries=enabled?[{pluginId:'opcb.results-report',id:'report',key:'isolated-report',revision:'fixture',component:()=>React.createElement('p',{'data-original-report':true,style:{padding:24}},'原报告组件挂载验证 · 隔离夹具，不读取真实业务')}]:[];reportListeners.forEach(fn=>fn());};
function NativeConversation({target}){
 React.useEffect(()=>{window.__projectPreview.conversations.push(target.channelId);},[target.channelId]);
 return React.createElement('div',{'data-native-channel':target.channelId,style:{display:'flex',flexDirection:'column',height:'100%',minHeight:0}},
  React.createElement('div',{'data-fixture-history':true,style:{flex:1,minHeight:0,overflow:'auto',padding:16}},React.createElement('p',null,'原生会话挂载位置 · 隔离预览不发送消息'),...Array.from({length:24},(_,i)=>React.createElement('p',{key:i,style:{paddingBlock:12}},'布局验证消息 '+(i+1)))),
  React.createElement('div',{style:{flex:'none',padding:12}},React.createElement('textarea',{'aria-label':'隔离会话草稿',placeholder:'隔离会话草稿',style:{width:'100%',height:72,resize:'none',boxSizing:'border-box'}})));
}
apply({react:React,pages:pageService,panels:{register:p=>panels.push(p)},relay,conversation:{ui:{Workspace:NativeConversation}},navigation:{open:target=>{window.__projectPreview.navigation.push(target);return Promise.resolve({status:'opened'});}}});
window.__projectPreview.registrations={pages:pages.map(p=>p.id),panels:panels.map(p=>p.id)};
window.__projectPreview.read=id=>heads.get(id);
window.__projectPreview.channelMetadata=(id,patch)=>{roster={...roster,channels:roster.channels.map(c=>c.id===id?{...c,...patch}:c)};rosterListeners.forEach(fn=>fn());};
window.__projectPreview.revoke=()=>{roster={...roster,channels:roster.channels.map(c=>({...c,members:[]}))};rosterListeners.forEach(fn=>fn());};
window.__projectPreview.revokeChannel=id=>{roster={...roster,channels:roster.channels.map(c=>c.id===id?{...c,members:[]}:c)};rosterListeners.forEach(fn=>fn());};
const h=React.createElement;
function PanelFixture(){const [active,setActive]=React.useState('');const context={scope:connection.scope,viewer:session.viewer,channelId:'demo-commercial',channelName:'OPCB 平台商业化',relayUrl:'wss://isolated.example'};const panel=panels.find(p=>p.matches(active));return h('div',{style:{height:'100%',display:'flex',flexDirection:'column',fontFamily:'system-ui'}},h('header',{style:{padding:'16px 24px',color:'#eee',display:'flex',gap:16,alignItems:'center'}},h('strong',null,'OPCB 平台商业化'),h('span',{style:{fontSize:12,color:'#aaa',marginRight:'auto'}},'频道面板隔离预览 · 演示数据'),...panels.map(p=>h(p.channelLauncher,{key:p.id,context,available:()=>true,pressed:active.startsWith('opcb-project-space:'+p.id),toggle:t=>setActive(t)}))),panel?h('div',{style:{flex:1,minHeight:0}},h(panel.component,{target:active,channelContext:context,context:{channelId:context.channelId,canOpen:()=>true,open:()=>true},close:()=>setActive('')})):h('p',{style:{color:'#aaa',padding:24}},'点击频道右上角「空间」或「产物」打开插件面板'));}
createRoot(document.getElementById('app')).render(panelMode?h(PanelFixture):h(pages[0].component));
