import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {validateRequest} from '../src/knowledge/identity-client.mjs';
import {createGroupUI} from '../src/knowledge/group-ui.mjs';
import {createStructuredData} from '../src/knowledge/structured-data.mjs';
import {createOriginalReferences,originalURL} from '../src/knowledge/original-references.mjs';

test('group browsing accepts bounded filters and refuses source or identity injection',()=>{
 assert.equal(validateRequest({op:'browse',space:'team',space_id:'six-lab',limit:20,offset:0}).space_id,'six-lab');
 for(const patch of [{owner:'admin'},{source:'business'},{kind:'script'},{space:'private-admin'},{limit:21},{offset:true},{category:'finance-secret'},{query:'a'.repeat(101)}])assert.throws(()=>validateRequest({op:'browse',...patch}));
});
test('team directories do not pretend that zero-attribution teams have imported files',()=>{
 const {Collections,Browse}=createGroupUI(React),organization={name:'跑圈集团知识库',teams:[{id:'isense',name:'iSense 团队',documents:0}],projects:[],categories:[],kinds:[],total:1,unassigned:1,shared:0};
 const home=renderToStaticMarkup(React.createElement(Collections,{organization}));
 assert.match(home,/iSense 团队/);assert.match(home,/资料归属待确认/);
 const empty=renderToStaticMarkup(React.createElement(Browse,{state:{organization,browsing:{space:'team',space_id:'isense',title:'iSense 团队',category:'',kind:'',query:'',total:0,offset:0,results:[]}},rows:()=>null}));
 assert.match(empty,/尚无已|资料归属待确认/);
});
test('structured business reading keeps nulls, units and original values rather than inventing metrics',()=>{
 const View=createStructuredData(React);
 const markup=renderToStaticMarkup(React.createElement(View,{value:{金额:123.45,单位:'元',未知:null,明细:[{日期:'2026-11-03',值:0}]}}));
 assert.match(markup,/123.45/);assert.match(markup,/未提供/);assert.match(markup,/2026-11-03/);assert.match(markup,/元/);assert.match(markup,/>0</);
 const hostile=renderToStaticMarkup(React.createElement(View,{value:{text:'<script>evil</script>'}}));assert.doesNotMatch(hostile,/<script>/);
});
test('original references remain explicit external links and reject temporary credentials',()=>{
 for(const url of ['http://example.com','https://u:p@example.com/a','javascript:alert(1)','https://example.com?signature=temporary'])assert.equal(originalURL(url),null);
 const View=createOriginalReferences(React);
 const markup=renderToStaticMarkup(React.createElement(View,{items:[{url:'https://example.com/source',name:'视频原件',kind:'video'}]}));
 assert.match(markup,/来源站验证/);assert.doesNotMatch(markup,/<video|<iframe|<img/);
});
