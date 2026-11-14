import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {collectionGroups,createKnowledgeWorkspace} from '../src/knowledge/reader-ui.mjs';
const catalog=[{source_id:'recordings',library:'work-records',documents:5,state:'ready'},{source_id:'business',library:'operations',documents:1000,state:'ready'},{source_id:'haowangshui',library:'project-archive',documents:0,state:'stale'}];
const libraries=[{id:'company'},{id:'shangliangshan',parent:'company',name:'上粮山业务'},{id:'operations',parent:'shangliangshan'},{id:'work-records',parent:'company'},{id:'project-archive',parent:'company'}];
test('knowledge sources follow authorized business hierarchy without inventing collections',()=>{
 const grouped=collectionGroups(catalog,libraries);
 assert.deepEqual(grouped.map(g=>[g.name,g.sources.map(s=>s.source_id)]),[['知识集合',['recordings','haowangshui']],['上粮山业务',['business']]]);
 assert.deepEqual(collectionGroups([],libraries),[]);
});
test('search preview identifies objects by source and id, and remains distinct from full reading',()=>{
 const Workspace=createKnowledgeWorkspace(React),docs=[{sourceId:'recordings',id:'same',title:'会议资料'},{sourceId:'business',id:'same',title:'经营资料'}];
 const state={connected:true,catalog,libraries,source:'business',detail:{note:docs[1],cache:{cached:true}},latest:[],recent:[],search:{query:'资料',documents:docs},pending:false};
 const props={state,view:'search',root:{current:null},scroller:{current:null},getName:s=>s,sourceName:'经营数据',searchForm:()=>null,Reader:({preview})=>React.createElement('p',null,preview?'正文节选':'完整正文')};
 const markup=renderToStaticMarkup(React.createElement(Workspace,props));
 assert.equal((markup.match(/data-selected="true"/g)||[]).length,1);
 assert.match(markup,/aria-label="打开完整正文"/);
 assert.match(markup,/可能不是最新版本/);
 assert.match(markup,/正文节选/);
 const reading=renderToStaticMarkup(React.createElement(Workspace,{...props,view:'reading'}));
 assert.doesNotMatch(reading,/aria-label="资料预览"/);
 assert.match(reading,/完整正文/);
});
