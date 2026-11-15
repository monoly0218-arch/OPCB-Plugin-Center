import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMUNITY,roleBinding} from '../src/media-workspace/role-binding.mjs';
import {createFactoryWorkspace} from '../src/content-factory/plugin.mjs';
const owner='96ddfaedaca50c0248576563df8dff9f08ed8abd5ddead823b44635b181fb24d';
const connection=(viewer=owner,relayAuthor=COMMUNITY)=>({status:'ready',cached:false,generation:1,scope:'scope',session:{viewer,relayAuthor}});
test('personal key and community select the existing role; nicknames and agents cannot choose a person',()=>{
 assert.equal(roleBinding(connection(),'assets').member,'pantao');
 assert.equal(roleBinding(connection('5be409cbf6fd2933fa7cdee1beebfb1ccc6ecebdc60c086c989510dcc0d0c6af'),'assets').member,'xiaopao');
 assert.throws(()=>roleBinding(connection('unknown'),'assets'),/尚未分配/);
 assert.throws(()=>roleBinding(connection('9903103630d49a6693cbc4ddc65c94dcdf12a3bfebef42c8bd46340b8b602608'),'factory'),/尚未分配/);
 assert.throws(()=>roleBinding(connection(owner,'another-community'),'factory'),/跑圈集团/);
 assert.throws(()=>roleBinding({...connection(),cached:true},'factory'),/当前 Buzz/);
 assert.throws(()=>roleBinding(connection('f890a61d715d51467def06d8ee1d8e66bf0bcb8acb0b743121bc91c698421e0d'),'assets'),/尚未分配/);
});
test('unmapped identities never contact the legacy login route; mapped roles verify the authoritative response',async()=>{
 let current=connection('unknown'),calls=0;
 const workspace=createFactoryWorkspace({relay:{snapshot:()=>current},host:{request:async request=>{
  calls++;
  if(request.url.endsWith('/opcb/login')){assert.equal(JSON.parse(request.body).name,'潘涛');return {status:200,body:'{"token":"fixture"}'};}
  return {status:200,body:JSON.stringify({current_member:{id:'wrong'},members:[{id:'pantao',name:'潘涛'},{id:'wrong',name:'他人'}],cards:[],reviews:[],comments:[],source_images:[]})};
 }}});
 workspace.bind(current);await assert.rejects(workspace.connect(),/尚未分配/);assert.equal(calls,0);
 current=connection();workspace.bind(current);await assert.rejects(workspace.connect(),/不一致/);assert.equal(workspace.snapshot().data,null);workspace.dispose();
});
test('a late connection result is discarded after owner or community switch',async()=>{
 let current=connection(),resolve;
 const workspace=createFactoryWorkspace({relay:{snapshot:()=>current},host:{request:()=>new Promise(done=>{resolve=done;})}});
 workspace.bind(current);const pending=workspace.connect();
 current=connection('unknown');workspace.bind(current);resolve({status:200,body:'{"token":"old"}'});
 await assert.rejects(pending,/账号或社区/);assert.equal(workspace.snapshot().data,null);workspace.dispose();
});

test('assets do not start a process for unassigned roles, even if the display name matches an administrator',async()=>{
 const {createAssetWorkspace}=await import('../src/shangliangshan-assets/native-workspace.mjs');
 const current=connection('unknown');current.session.profiles={snapshot:()=>new Map([['unknown',{name:'潘涛'}]])};
 let started=0;const workspace=createAssetWorkspace({relay:{snapshot:()=>current},host:{spawn:()=>{started++;}}});
 workspace.bind(current);await assert.rejects(workspace.connect(),/尚未分配/);assert.equal(started,0);assert.equal(workspace.snapshot().data,null);workspace.dispose();
});
