import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createUI} from '../design-system/v1/react.mjs';

const base = new URL('../design-system/v1/', import.meta.url);
const tokens = JSON.parse(await readFile(new URL('tokens.json', base), 'utf8'));
const css = await readFile(new URL('tokens.css', base), 'utf8') + '\n' + await readFile(new URL('components.css', base), 'utf8');
const source = await readFile(new URL('react.mjs', base), 'utf8');
const UI = createUI(React), h = React.createElement;
const render = node => renderToStaticMarkup(node);

function luminance(hex) {
  const rgb = hex.replace('#','').match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
  return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
}
function contrast(a,b) {
  const v=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (v[0]+.05)/(v[1]+.05);
}

test('CSS rules cannot target a host node outside .opcb-ui', () => {
  const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
  const headers=[...clean.matchAll(/([^{}]+)\{/g)].map(m=>m[1].trim());
  const selectors=headers.filter(s=>!s.startsWith('@'));
  assert.ok(selectors.length>40);
  for(const group of selectors) {
    // Split commas only outside :where/:is and their argument lists.
    let depth=0,start=0;
    const parts=[];
    for(let i=0;i<group.length;i++) {
      if(group[i]==='(')depth++;
      if(group[i]===')')depth--;
      if(group[i]===','&&depth===0){parts.push(group.slice(start,i));start=i+1;}
    }
    parts.push(group.slice(start));
    for(const selector of parts) assert.match(selector.trim(),/^\.opcb-ui(?=[\s\[.:#>+~]|$)/,selector);
  }
  assert.doesNotMatch(clean,/(?:^|[{}])\s*(?:body|html|:root)\s*[{,]/);
  assert.doesNotMatch(clean,/(?:^|[;{])\s*--(?!opcb-)[\w-]+\s*:/);
});

test('all design token references resolve and all explicit themes are complete', () => {
  const defined=new Set([...css.matchAll(/(--opcb-[\w-]+)\s*:/g)].map(m=>m[1]));
  for(const [,name]of css.matchAll(/var\((--opcb-[\w-]+)/g))assert.ok(defined.has(name),`Undefined ${name}`);
  for(const [name,value]of Object.entries(tokens.common)) {
    assert.ok(css.includes(`${name}: ${value};`),`CSS differs from manifest: ${name}`);
  }
  const themes=Object.keys(tokens.themes.host).sort();
  for(const [theme,values]of Object.entries(tokens.themes)) {
    assert.deepEqual(Object.keys(values).sort(),themes,`${theme} missing semantic roles`);
    const block=css.match(new RegExp(`\\.opcb-ui\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`))?.[1];
    assert.ok(block,`${theme} selector missing`);
    const declarations=Object.fromEntries([...block.matchAll(/(--opcb-[\w-]+)\s*:\s*([^;]+);/g)].map(([,k,v])=>[k,v.trim()]));
    assert.deepEqual(declarations,values,`${theme} CSS differs from token manifest`);
  }
  assert.match(css,/@container opcb \(width < 1100px\)/);
  assert.match(css,/@container opcb \(width < 780px\)/);
});

test('primary and status text meet 4.5:1 in explicit light/dark themes', () => {
  for(const token of ['--opcb-accent-strong','--opcb-danger-strong'])assert.ok(contrast(tokens.common[token],tokens.common['--opcb-on-accent'])>=4.5,token);
  for(const theme of ['light','dark']) {
    const t=tokens.themes[theme];
    for(const [fg,bg]of [['--opcb-text','--opcb-surface'],['--opcb-muted','--opcb-surface'],['--opcb-nav-text','--opcb-frame'],['--opcb-info-text','--opcb-info-bg'],['--opcb-success-text','--opcb-success-bg'],['--opcb-warning-text','--opcb-warning-bg'],['--opcb-danger-text','--opcb-danger-bg']]) {
      assert.ok(contrast(t[fg],t[bg])>=4.5,`${theme} ${fg}/${bg}: ${contrast(t[fg],t[bg])}`);
    }
  }
  assert.notEqual(tokens.themes.light['--opcb-success-text'],tokens.themes.light['--opcb-info-text']);
  assert.notEqual(tokens.themes.light['--opcb-warning-text'],tokens.themes.light['--opcb-danger-text']);
});

test('factory only uses supplied React and never loads another runtime or URL', () => {
  assert.doesNotMatch(source,/\b(?:import|require|fetch)\s*\(/);
  assert.doesNotMatch(source,/\bimport\s+[^\n]+from\s/);
  assert.doesNotMatch(source,/https?:\/\//);
  assert.throws(()=>createUI({}),/host React/);
  const fake={createElement:(type,props,...children)=>({type,props,children})};
  assert.equal(createUI(fake).Button({children:'保存'}).type,'button');
});

test('buttons preserve semantics and row action buttons are not nested', () => {
  const markup=render(h(UI.ObjectRow,{title:'研究资料',meta:'来源：演示',selected:true,onOpen:()=>{},actions:h(UI.Button,{variant:'quiet'},'收藏')}));
  const tags=[...markup.matchAll(/<\/?button\b[^>]*>/g)].map(m=>m[0]);
  let depth=0,count=0;
  for(const tag of tags){if(tag.startsWith('</'))depth--;else{depth++;count++;}assert.ok(depth>=0&&depth<=1,'nested or invalid button structure');}
  assert.equal(depth,0);assert.equal(count,2);
  assert.match(markup,/type="button"/);
  assert.match(markup,/data-selected="true"/);
  assert.match(markup,/aria-current="true"/);
  assert.match(markup,/aria-label="打开 研究资料"/);
  assert.match(render(h(UI.Button,{type:'submit',disabled:true,variant:'danger'},'删除')),/type="submit"[^>]*disabled=""|disabled=""[^>]*type="submit"/);
  assert.throws(()=>render(h(UI.IconButton,null,'×')),/readable label/);
  const quiet=render(h(UI.Button,{variant:'quiet',disabled:true},'暂不可用'));
  assert.match(quiet,/disabled=""/);assert.match(quiet,/data-variant="quiet"/);
  assert.match(css,/\.opcb-button\[data-variant="quiet"\]:not\(:disabled\):hover/);
  assert.match(css,/:focus-visible\s*\{\s*outline: 2px solid var\(--opcb-focus\)/);
  assert.match(css,/\.opcb-nav :where\(a, button\):focus-visible\s*\{ outline-color: var\(--opcb-nav-active\)/);
});

test('field connects label, control, help and visible error', () => {
  const markup=render(h(UI.Field,{id:'folder-name',label:'集合名称',help:'显示在导航里',error:'名称不能为空'},p=>h(UI.Input,{...p,value:'',readOnly:true})));
  assert.match(markup,/for="folder-name"/);
  assert.match(markup,/id="folder-name"/);
  assert.match(markup,/aria-describedby="folder-name-help folder-name-error"/);
  assert.match(markup,/aria-invalid="true"/);
  assert.match(markup,/role="alert"[^>]*>名称不能为空/);
});

test('states remain readable without relying on color', () => {
  for(const [tone,text]of [['neutral','尚未同步'],['success','已连接'],['warning','资料过期'],['danger','无权限'],['info','正在加载']]) {
    const markup=render(h(UI.Chip,{tone},text));assert.match(markup,new RegExp(`>${text}</span>`));assert.ok(markup.includes(`data-tone="${tone}"`));
  }
  const empty=render(h(UI.EmptyState,{title:'没有资料',description:'换一个集合或刷新',action:h(UI.Button,null,'刷新')}));
  assert.match(empty,/role="status"/);assert.match(empty,/>没有资料<\/h2>/);assert.match(empty,/>刷新<\/button>/);
});

test('workspace publishes controllable theme/navigation/detail state', () => {
  const markup=render(h(UI.Workspace,{nav:'目录',inspector:'详情',inspectorOpen:true,navOpen:true},'主内容'));
  assert.match(markup,/class="opcb-ui"/);assert.match(markup,/data-theme="host"/);assert.match(markup,/data-nav="open"/);assert.match(markup,/data-inspector="open"/);
  const fallback=render(h(UI.Workspace,{theme:'unknown',inspectorOpen:true},'主内容'));
  assert.match(fallback,/data-theme="host"/);assert.match(fallback,/data-inspector="closed"/);
  const sheet=render(h(UI.StyleSheet,{css:'.opcb-ui{color:red}',nonce:'sample'}));
  assert.match(sheet,/nonce="sample"/);assert.match(sheet,/\.opcb-ui\{color:red\}/);
  assert.match(css,/\.opcb-ui\[data-inspector="open"\] \.opcb-inspector\s*\{\s*position: absolute/);
  assert.match(css,/prefers-reduced-motion: reduce/);
});

test('icons have no runtime dependency and expose accessible labels only when requested', async () => {
  const { createIcons, ICON_NAMES } = await import('../design-system/v1/icons.mjs');
  const Icon = createIcons(React);
  assert.ok(ICON_NAMES.includes('document') && ICON_NAMES.includes('shield'));
  const decorative = renderToStaticMarkup(React.createElement(Icon, { name: 'document' }));
  assert.match(decorative, /aria-hidden="true"/);
  const named = renderToStaticMarkup(React.createElement(Icon, { name: 'shield', label: '访问受限' }));
  assert.match(named, /role="img"/);
  assert.match(named, /aria-label="访问受限"/);
  assert.doesNotMatch(named, /aria-hidden/);
  assert.throws(() => Icon({ name: 'missing' }), /Unknown OPCB icon/);
});
