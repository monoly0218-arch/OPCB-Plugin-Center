import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ICONS,iconName,pluginIcon,versionLabel} from '../src/plugin-center/visuals.mjs';
import {pluginCenterDesign} from '../scripts/build_plugin_center.mjs';
import {createPage,VERSION} from '../src/plugin-center/page.mjs';
import {validateRegistry} from '../src/plugin-center/directory.mjs';
const registry=JSON.parse(await readFile(new URL('../REGISTRY.json',import.meta.url)));
const entries=validateRegistry(registry),assets=Object.fromEntries(Object.values(ICONS).map(name=>[name,`data:image/png;base64,${name}`]));

test('all catalog versions keep their source identity, icon mapping and real version',()=>{
 for(const entry of entries){assert(ICONS[entry.id],entry.id);assert(versionLabel(entry.version));}
 assert.equal(new Set(Object.values(ICONS)).size,16);
 assert.equal(iconName('new.vendor-plugin'),'puzzle');
 assert.equal(versionLabel('2026-11-13'),'2026.11.13');
 assert.equal(versionLabel('2026-11-13-password'),'2026.11.13-password');
 assert.equal(versionLabel('2.0.0-rc.7'),'v2.0.0-rc.7');
 assert.equal(versionLabel('1.4'),'v1.4');
});
test('default screen renders an icon and catalog version per active entry without summary or dependency prose',()=>{
 const snapshot={status:'ready',entries,commit:'a'.repeat(40),busy:'',notice:'',error:''};
 const store={snapshot:()=>snapshot,subscribe:()=>()=>{}};
 const Page=createPage(React,store,undefined,assets,'');
 const html=renderToStaticMarkup(React.createElement(Page));
 assert.equal((html.match(/data-entry=/g)||[]).length,entries.filter(e=>!e.legacy).length);
 assert.equal((html.match(/class="pc-icon"/g)||[]).length,entries.filter(e=>!e.legacy).length);
 for(const entry of entries.filter(e=>!e.legacy)){assert(html.includes(versionLabel(entry.version)));assert(!html.includes(entry.requirements));assert(!html.includes(entry.summary));}
 assert(html.includes(`v${VERSION}`));assert(!html.includes('<small'));
});
test('all icons are pinned licensed PNG files with verifiable content',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../src/plugin-center/assets/MANIFEST.json',import.meta.url)));
 assert.equal(manifest.length,16);
 for(const item of manifest){
  assert.equal(item.license,'MIT');assert(item.source.includes(item.commit));
  const bytes=await readFile(new URL('../src/plugin-center/assets/'+item.file,import.meta.url));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
 }
});
test('new UI bundle preserves optional native installer and original narrow permissions',async()=>{
 const file=JSON.parse(await readFile(new URL('../plugins/opcb.plugin-center/0.2.1/manifest.json',import.meta.url)));
 assert.equal(file.id,'opcb.plugin-center');assert.deepEqual(file.host,{networkOrigins:['https://api.github.com']});
 const code=await readFile(new URL('../plugins/opcb.plugin-center/0.2.1/plugin.js',import.meta.url),'utf8');
 assert(code.includes('pluginInstaller'));assert(code.includes('data:font/woff2;base64,'));assert(code.includes('data:image/png;base64,'));
});
test('built entry registers a supported Buzz 1.0.2 workspace page and disposes its store',async()=>{
 const {apply}=await import('../plugins/opcb.plugin-center/0.2.1/plugin.js');
 let page,cleanup;
 apply({react:{createElement(){}},reflect:{get:()=>undefined},host:{request:()=>{throw Error('unexpected network');}},effect:fn=>{cleanup=fn();},pages:{register:value=>{page=value;}}});
 assert.equal(page.id,'catalog');assert.equal(page.layout,'workspace');assert.equal(page.primary,true);assert.equal(page.placement,'dock');
 assert.equal(typeof page.component,'function');assert.equal(typeof cleanup,'function');cleanup();
 assert.equal(page.icon,JSON.parse((await pluginCenterDesign()).OPCB_PLUGIN_CENTER_ASSETS).puzzle);
 const packageIcon=await readFile(new URL('../plugins/opcb.plugin-center/0.2.1/icon.png',import.meta.url));
 assert.equal(page.icon,'data:image/png;base64,'+packageIcon.toString('base64'));
});

test('catalog reuses exact package/page artwork and accepts future directory icons before fallbacks',async()=>{
 const native=JSON.parse(await readFile(new URL('../src/plugin-center/assets/NATIVE_ICONS.json',import.meta.url)));
 const assets=JSON.parse((await pluginCenterDesign()).OPCB_PLUGIN_CENTER_ASSETS);
 assert.equal(native.length,8);
 for(const item of native){
  const bytes=await readFile(new URL('../src/plugin-center/assets/'+item.file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  const source=await readFile(new URL('../'+item.sourcePath,import.meta.url));
  const payload=`data:${item.mime};base64,${bytes.toString('base64')}`;
  if(item.surface==='package-icon')assert.deepEqual(bytes,source);
  else assert(source.toString().includes(payload));
  assert.equal(pluginIcon({id:item.id},assets),payload);
 }
 const custom='data:image/png;base64,aGVsbG8=';
 const row=registry.entries[0];
 const parsed=validateRegistry({...registry,entries:[{...row,icon:custom} ]})[0];
 assert.equal(pluginIcon(parsed,assets),custom);
 for(const icon of ['https://example.com/icon.png','javascript:alert(1)',{url:custom}]){
  assert.throws(()=>validateRegistry({...registry,entries:[{...row,icon}]}));
 }
 assert.equal(pluginIcon({id:'opcb.plugin-center'},assets),assets.puzzle);
 assert.equal(pluginIcon({id:'unknown'},assets),assets.puzzle);
});
