import test from 'node:test';
import assert from 'node:assert/strict';
import {recordCompanyReports,companyReports} from '../src/tasks/company-reports.mjs';
import {TASK_SOURCE} from '../src/tasks/source.mjs';
const owner='1'.repeat(64),agent='2'.repeat(64),person='3'.repeat(64),request='4'.repeat(64),revision='5'.repeat(64),route='private-solo';
function fixture(){
 let head={id:revision,content:'# 原任务\n不改执行状态'},writes=0,afterRequest=()=>{},disposed=0;
 const channels=[{id:TASK_SOURCE,creator:owner,members:[owner,agent,person]},{id:route,creator:owner,channelType:'solo',private:true,members:[owner,agent]}];
 const session={viewer:owner,channels:{list:()=>({status:'ready',channels})},thread:()=>({refresh:async()=>afterRequest(),snapshot:()=>({targetStatus:'ready',target:{id:request,channelId:route,authorId:owner,createdAt:100,content:'请同步人员状态'}}),dispose:()=>disposed++}),canvas:{available:true,read:async()=>head,save:async(channel,content,expected,options)=>{assert.equal(channel,TASK_SOURCE);assert.equal(expected,head.id);assert.deepEqual(options,{preserveApproval:true});writes++;return head={id:'6'.repeat(64),content};}}};
 const connection={status:'ready',scope:'community',generation:1,session},relay={snapshot:()=>connection};
 return {ctx:{relay,agents:{relay:()=>relay}},client:{key:'local-agent',pubkey:agent,owner,signal:new AbortController().signal,effectiveEdit:async()=>{}},context:{channel:route},args:{action:'update',request_id:request,expected_revision:revision,updates:[{person,status:'休息'}]},get writes(){return writes;},get disposed(){return disposed;},get head(){return head;},set afterRequest(fn){afterRequest=fn;},session,channels};
}
test('people update proves the exact owner request and uses native Canvas compare-and-save',async()=>{
 const f=fixture();const result=await recordCompanyReports(f);assert.equal(result.updated,1);assert.equal(f.writes,1);assert.equal(f.disposed,1);assert(f.head.content.startsWith('# 原任务\n不改执行状态'));
 const report=companyReports(f.head.content)[0];assert.equal(report.person,person);assert.equal(report.setBy,owner);assert.equal(report.recordedBy,agent);
});
test('stale revisions and access revoked during exact-message lookup cannot write',async()=>{
 let f=fixture();f.args.expected_revision='7'.repeat(64);await assert.rejects(recordCompanyReports(f),/来源已变化/);assert.equal(f.writes,0);
 f=fixture();f.afterRequest=()=>{f.channels[0].members=[owner];};await assert.rejects(recordCompanyReports(f),/权限不足/);assert.equal(f.writes,0);assert.equal(f.disposed,1);
});
test('a caller outside the source manager role cannot set another person, and a non-owner request is rejected',async()=>{
 let f=fixture();f.channels[0].creator=person;await assert.rejects(recordCompanyReports(f),/来源负责人/);assert.equal(f.writes,0);
 f=fixture();f.session.thread=()=>({refresh:async()=>{},snapshot:()=>({targetStatus:'ready',target:{id:request,channelId:route,authorId:agent,createdAt:100}}),dispose(){}});await assert.rejects(recordCompanyReports(f),/本人/);assert.equal(f.writes,0);
});
test('same-request retries are idempotent while a changed current thing can still be saved',async()=>{
 const f=fixture();await recordCompanyReports(f);f.args.expected_revision=f.head.id;await recordCompanyReports(f);assert.equal(f.writes,1);
 f.args.updates=[{person,current:'正在接入同步'}];await recordCompanyReports(f);assert.equal(f.writes,2);assert.equal(companyReports(f.head.content).length,2);
 f.args.updates=[{person,current:null}];await recordCompanyReports(f);assert.equal(f.writes,3);assert.equal(companyReports(f.head.content).length,3);
});
