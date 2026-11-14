import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CONTRIBUTIONS,creditPeople,avatarLayout,mergePullContributors,pluginsForFiles,createContributionReader} from '../src/plugin-center/contributors.mjs';
import {createPage} from '../src/plugin-center/page.mjs';

test('creators lead, repeat authors collapse to one person, and historical implementations retain their attribution',()=>{
 const id='opcb.xhs-topic-burst';
 const merged=mergePullContributors(CONTRIBUTIONS,[{number:900,login:'miaopantao',plugins:[id]},{number:901,login:'miaopantao',plugins:[id]}],[{commit:'b'.repeat(40),login:'miaopantao',plugins:[id]}]);
 const credit=creditPeople({id},merged);
 assert.equal(credit.creator.key,'steven');assert.deepEqual(credit.contributors.map(p=>p.key),['pantao']);assert.equal(credit.count,2);
 assert.equal(creditPeople({id:'opcb.higgsfield-mailbox',version:'1.4'}).creator.key,'moo');
 assert.equal(creditPeople({id:'opcb.higgsfield-mailbox',version:'2026-11-13'}).creator.key,'pantao');
 assert.equal(creditPeople({id:'unknown'}).count,0);
 assert.equal(creditPeople({id:'opcb.content-factory'}).creator,null);
});
test('avatar rows reserve space for overflow and never count the same work as more people',()=>{
 for(const width of [96,110,140,190,340])for(const count of [1,2,4,5,20,100]){
  const {visible,hidden}=avatarLayout(width,count);assert.equal(visible+hidden,count);assert(visible<=4);
  assert((hidden?90:36)+(visible-1)*22<=width);
 }
 assert.deepEqual(avatarLayout(200,0),{visible:0,hidden:0});
});
test('only plugin source paths assign PR contributors; registry uploads and unrelated source do not',()=>{
 const ids=Object.keys(CONTRIBUTIONS.plugins);
 assert.deepEqual(pluginsForFiles(['README.md','REGISTRY.json','releases/only.zip'],ids),[]);
 assert.deepEqual(pluginsForFiles(['plugins/higgsfield-pool/1.4/plugin.js','src/plugin-center/page.mjs'],ids),['opcb.higgsfield-mailbox','opcb.plugin-center']);
 assert.deepEqual(pluginsForFiles(['plugins/unrelated/plugin.js'],ids),[]);
});
test('new PR and commit authors gain one shared avatar, author-less commits are not guessed, and unchanged PR files are cached',async()=>{
 let files=0,commitReads=0,round=0;
 const id='opcb.plugin-center',sha='a'.repeat(40),head='c'.repeat(40),author={login:'new-author',avatar_url:'https://avatars.githubusercontent.com/u/123?v=4'};
 const request=async({url})=>{
  let data;
  if(url.includes('/pulls?'))data=[{number:900,head:{sha},user:author,state:'open'}];
  else if(url.includes('/pulls/900/files')){files++;data=[{filename:'src/plugin-center/page.mjs'}];}
  else if(url.includes('/commits?'))data=[{sha:head,author},{sha:'f'.repeat(40),author:null}];
  else if(url.includes('/commits/'+head)){commitReads++;data={files:[{filename:'plugins/opcb.plugin-center/0.2.3/plugin.js'}]};}
  else throw Error(url);
  return {status:200,body:JSON.stringify(data)};
 };
 const read=createContributionReader(request);
 for(;round<2;round++){
  const data=await read([{id}],()=>true,head),credit=creditPeople({id},data);
  assert.equal(credit.contributors.filter(p=>p.github==='new-author').length,1);
 }
 assert.equal(files,1);assert.equal(commitReads,1);
 await assert.rejects(createContributionReader(request)([{id}],()=>false),/关闭/);
 await assert.rejects(createContributionReader(async()=>({status:403,body:'{}'}))([{id}]),/暂未刷新/);
});
test('default cards show contribution avatars and keep install actions without installed/absent status labels',()=>{
 const entry={id:'opcb.xhs-topic-burst',name:'选题灵感',version:'1',summary:'hidden-summary',requirements:'hidden-requirements',category:'内容创作'};
 const snapshot={status:'ready',entries:[entry],commit:'a'.repeat(40),busy:'',notice:'',error:'',contributions:CONTRIBUTIONS};
 const Page=createPage(React,{snapshot:()=>snapshot,subscribe:()=>()=>{}},undefined,{puzzle:'data:image/png;base64,eA=='},'');
 const html=renderToStaticMarkup(React.createElement(Page));
 assert(html.includes('Steven · 创建者'));assert(!html.includes('未安装'));assert(!html.includes('已安装'));assert(!html.includes('安装状态'));assert(!html.includes('<select'));
 assert(html.includes('审阅安装'));assert(!html.includes(entry.summary));
});
