import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMobileBinding,readMobileMessage,embeddedMobileHTML} from '../src/commercial/mobile-source.mjs';
const binding={schema:1,owner:'owner',revision:1,channel:'mobile',message:'a'.repeat(64),url:'https://example.com/design.html'};
test('mobile source rejects foreign owners, credential URLs and mismatched source messages',async()=>{
 assert.throws(()=>validateMobileBinding(binding,'other'));assert.throws(()=>validateMobileBinding({...binding,url:'https://user:pass@example.com/file.html'},'owner'));
 let disposed=false;const session={viewer:'owner',channels:{list:()=>({status:'ready',channels:[{id:'mobile',members:['owner']}]})},thread:()=>({refresh:async()=>{},snapshot:()=>({targetStatus:'ready',target:{id:binding.message,channelId:'mobile',content:'unrelated'}}),dispose:()=>disposed=true})};await assert.rejects(()=>readMobileMessage(session,binding,()=>{}),/不是/);assert.ok(disposed);
 session.thread=()=>({refresh:async()=>{},snapshot:()=>({targetStatus:'ready',target:{id:binding.message,channelId:'mobile',attachments:[{url:binding.url}]}}),dispose:()=>{}});assert.equal((await readMobileMessage(session,binding,()=>{})).id,binding.message);
 session.channels.list=()=>({status:'ready',channels:[]});await assert.rejects(()=>readMobileMessage(session,binding,()=>{}),/无权/);
});
test('embedded source keeps original script and uses fragment navigation inside the sandbox',()=>{const html=embeddedMobileHTML('<html><head></head><body><script>function openPage(){}</script></body></html>');assert.ok(html.includes('hashchange'));assert.ok(html.includes('function openPage(){}'));assert.ok(html.includes('data-report-embed'));assert.throws(()=>embeddedMobileHTML('bad'));});
import {apply} from '../plugins/opcb.results-report/2.0.0-rc.8/plugin.js';
test('native source tool binds only an authorized original attachment, keeps CAS and closes storage',async()=>{
 const owner='1'.repeat(64),agent='2'.repeat(64),request='b'.repeat(64),source='c'.repeat(64);let pref,tool,closed=0;
 const session={viewer:owner,channels:{list:()=>({status:'ready',channels:[{id:'execution',members:[owner,agent]},{id:'mobile',members:[owner,agent]}]})},thread:(channel,id)=>({refresh:async()=>{},snapshot:()=>({targetStatus:'ready',target:{id,channelId:channel,authorId:id===request?owner:agent,content:id===request?'更新我们的插件':'' ,attachments:id===source?[{url:'https://example.com/latest.html'}]:[]}}),dispose(){}})};
 const connection={status:'ready',session,scope:'scope',generation:1},client={key:'key',owner,pubkey:agent,signal:new AbortController().signal};
 apply({react:{createElement(){}},relay:{snapshot:()=>connection},agents:{relay:()=>({snapshot:()=>connection}),addTool:t=>tool=t},pages:{register(){}},artifactStorage:{open:()=>({preferences:{get:async()=>pref,update:async(_,fn)=>{pref=fn(pref)}},close:()=>closed++})}});
 assert.equal(tool.name,'opcb_commercial_mobile_source');const context={channel:'execution'};
 assert.equal(JSON.parse(await tool.call(client,context,{action:'read'})).revision,0);
 const args={action:'bind',request_id:request,expected_revision:0,source_channel:'mobile',source_message:source,source_url:'https://example.com/latest.html'};
 assert.equal(JSON.parse(await tool.call(client,context,args)).revision,1);assert.equal(pref.owner,owner);await assert.rejects(()=>tool.call(client,context,args),/已变化/);
 await assert.rejects(()=>tool.call({...client,owner:'other'},context,{action:'read'}),/身份/);assert.equal(closed,3);
});
