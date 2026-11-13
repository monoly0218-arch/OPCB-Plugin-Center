import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import * as reader from '../src/knowledge/reader.mjs';
import * as admin from '../src/knowledge/admin.mjs';

test('both page entrypoints render before a device is bound, including the no-session case',()=>{
  for(const module of [reader,admin])for(const session of [undefined,{viewer:'a'.repeat(64),relayAuthor:'b'.repeat(64)}]){
    let markup='';
    module.apply({react:React,relay:{snapshot:()=>({status:session?'ready':'connecting',generation:1,session}),subscribe:()=>()=>{}},host:{},agents:{addTool:()=>{},addInstructions:()=>{}},effect:()=>{},pages:{register:page=>{markup=renderToString(React.createElement(page.component));}}});
    assert.match(markup,/绑定当前/);assert.doesNotMatch(markup,/undefined/);
  }
});
