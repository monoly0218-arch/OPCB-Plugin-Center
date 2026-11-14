import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {createUI} from '../design-system/v2/react.mjs';
const h=React.createElement,UI=createUI(React);
test('calibration styles remain within plugin scope',async()=>{
 const css=(await Promise.all(['tokens.css','components.css'].map(p=>readFile(new URL('../design-system/v2/'+p,import.meta.url),'utf8')))).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
 for(const [,header]of css.matchAll(/([^{}]+)\{/g)){if(header.trim().startsWith('@'))continue;for(const selector of header.split(','))assert.match(selector.trim(),/^\.opcb-v2(?:[\s[.:]|$)/);}
 assert.doesNotMatch(css,/(?:^|[{}])\s*(?:body|html|:root)\s*[{,]/);
 const defined=new Set([...css.matchAll(/(--v2-[\w-]+)\s*:/g)].map(m=>m[1]));for(const [,ref]of css.matchAll(/var\((--v2-[\w-]+)/g))assert.ok(defined.has(ref),ref);
});
test('item preserves distinct complete/open actions and escapes untrusted titles',()=>{
 const markup=render(h(UI.Item,{title:'<img src=x onerror=alert(1)>',done:true,selected:true,onToggle:()=>{},onOpen:()=>{}}));
 assert.ok(markup.includes('&lt;img'));assert.ok(!markup.includes('<img'));
 let depth=0;for(const tag of markup.match(/<\/?button\b[^>]*>/g)){depth+=tag.startsWith('</')?-1:1;assert.ok(depth>=0&&depth<=1);}assert.equal(depth,0);
 assert.equal((markup.match(/type="button"/g)||[]).length,2);assert.ok(markup.includes('aria-pressed="true"'));assert.ok(markup.includes('aria-current="true"'));
});
test('dual workspace uses full content region rather than nested padded main panel',()=>{
 const markup=render(h(UI.Workspace,{layout:'dual',nav:'navigation'},h(UI.Dual,{collections:'collections',current:'current'})));
 assert.ok(markup.includes('data-layout="dual"'));assert.ok(markup.includes('class="v2-dual"'));assert.ok(!markup.includes('class="v2-panel v2-main"'));
 assert.throws(()=>createUI({}),/host React/);assert.throws(()=>render(h(UI.Tool,null,'×')),/label/);
});
