import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDetails} from '../src/knowledge/audit.mjs';
test('historical audit exposes real actor and target, but never fabricates a before value',()=>{
 const row={actor:'actor-key',action:'grant',payload:JSON.stringify({owner:'person-key',library:'work',allow:true})};
 const detail=auditDetails(row,key=>({'actor-key':'管理员','person-key':'甲'})[key]||key,[{id:'work',name:'工作资料'}]);
 assert.equal(detail.actor,'管理员');assert.equal(detail.target,'甲');assert.equal(detail.library,'工作资料');assert.equal(detail.before,'历史未记录');assert.equal(detail.after,'允许读取');
});
test('new transactional values distinguish an absent record from unknown history',()=>{
 const detail=auditDetails({actor:'key',action:'library',payload:'{"id":"work"}',before_value:'null',after_value:'{"name":"新名称"}'},x=>x,[]);
 assert.equal(detail.before,'无显式记录');assert.equal(detail.after,'新名称');
});

test('audit page renders actor, target, directory and expandable before/after details', async()=>{
 const React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server'),{createAdminWorkspace}=await import('../src/knowledge/admin-ui.mjs');
 const policy={revision:2,libraries:[{id:'work',name:'工作资料',parent:null}],grants:[],disabled:[],audit:[{revision:2,actor:'admin-key',action:'grant',payload:JSON.stringify({owner:'person-key',library:'work',allow:true}),before_value:'{"rule":"deny"}',after_value:'{"rule":"allow"}',at:1}]};
 const markup=renderToStaticMarkup(React.createElement(createAdminWorkspace(React),{policy,bound:true,pending:false,online:true,root:{current:null},scroller:{current:null},tab:'audit',detailMode:'',libraryName:'',newName:'',newId:'',manual:'',owner:'person-key',library:'work',query:'',owners:['person-key'],configured:new Set(),name:key=>({'admin-key':'管理员','person-key':'测试成员'})[key]||key,libraries:policy.libraries,privateChannels:[]}));
 assert.match(markup,/管理员/);assert.match(markup,/测试成员/);assert.match(markup,/工作资料/);assert.match(markup,/关闭读取 → 允许读取/);assert.match(markup,/查看身份与变更详情/);
});
