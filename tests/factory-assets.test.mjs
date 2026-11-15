import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {materialRows, resultVersions} from '../src/content-factory/model.mjs';
import {createFactoryWorkspace, factoryMediaUrl} from '../src/content-factory/plugin.mjs';
import {apply as assets} from '../src/shangliangshan-assets/plugin.mjs';

const card = (id,status='pending',extra={}) => ({id,title:id,note:'',status,version:1,media_status:'ready',created_at:'2026-11-01',...extra});
const data = {current_member:{id:'me',name:'本人'},members:[{id:'mo',name:'mo'},{id:'me',name:'本人'}],cards:[card('seen'),card('unseen'),card('approved','approved'),card('finished','done'),card('collected','pending',{created_by:'mo'})],reviews:[{card_id:'seen',member_id:'me',verdict:'no'},{card_id:'approved',member_id:'mo',verdict:'yes'}]};
test('native stages match deployed site: approved is ranking only, done is review, personal vote excludes already reviewed cards',()=>{
  assert.deepEqual(materialRows(data,{stage:'inbox',filter:'unseen'}).map(c=>c.id),['unseen','collected']);
  assert.deepEqual(materialRows(data,{stage:'rank'}).map(c=>c.id),['approved']);
  assert.deepEqual(materialRows(data,{stage:'review'}).map(c=>c.id),['finished']);
  assert.deepEqual(materialRows(data,{query:' MO ',collector:'mo'}).map(c=>c.id),['collected']);
});
test('single ranking includes every positively reviewed card, keeps stable ties and never mutates server rows',()=>{
  const d={...data,cards:[card('new','approved',{created_at:'2026-11-10'}),card('old','pending'),card('single','pending')],reviews:[{card_id:'single',member_id:'me',verdict:'yes'},...['new','old'].flatMap(id=>Array.from({length:4},(_,i)=>({card_id:id,member_id:String(i),verdict:'yes'})))]};
  assert.deepEqual(materialRows(d,{stage:'rank'}).map(c=>c.id),['old','new','single']);
  assert.equal(d.cards[0].id,'new');
});
test('history filters invalid/other-card revisions and does not turn unsigned URLs into authorized media',()=>{
  const c=card('a','review',{result_revision:3});
  assert.deepEqual(resultVersions({result_versions:[{card_id:'a',revision:1},{card_id:'other',revision:2},{card_id:'a',revision:4},{card_id:'a',revision:3},{card_id:'a',revision:-1}]},c).map(x=>x.revision),[3,1]);
  assert.equal(factoryMediaUrl('https://staging.paolab.cn/ins/results/a.mp4'),undefined);
  assert.equal(factoryMediaUrl('https://evil.test/ins/results/a.mp4?opcb_media=x'),undefined);
});
test('switching to website discards native selection and rejects stale agent context before any service call',async()=>{
  const connection={status:'ready',cached:false,scope:'scope',generation:1,session:{viewer:'owner'}};
  const w=createFactoryWorkspace({relay:{snapshot:()=>connection},host:{request(){throw Error('must not request')}}});w.bind(connection);w.website(true);
  assert.equal(w.snapshot().selected,'');
  assert.equal(w.snapshot().proposal,null);
  await assert.rejects(w.tool({},{},{action:'read'}),/原站操作中的选择/);
  w.dispose();
});
test('assets defaults to the native member entry instead of embedding the old website',()=>{
  let page;const connection={status:'ready',cached:false,generation:1,scope:'scope',session:{viewer:'owner'}};
  const ctx={effect(){},conversation:{registerTool(){}},react:React,relay:{subscribe:()=>()=>{},snapshot:()=>connection},pages:{register:p=>page=p},browser:{available:true,View:()=>React.createElement('iframe',{title:'website'})},host:{}};
  assets(ctx);const html=renderToStaticMarkup(React.createElement(page.component));
  assert.match(html,/进入上粮山资产库/);assert.match(html,/资产库原站成员/);assert.doesNotMatch(html,/<iframe/);
});
