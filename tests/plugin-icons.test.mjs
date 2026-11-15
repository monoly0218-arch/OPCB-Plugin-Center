import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import React from 'react';
import {withPluginIcon} from '../src/plugin-icons/context.mjs';
import {pluginCenterDesign} from '../scripts/build_plugin_center.mjs';
import {pluginIcon} from '../src/plugin-center/visuals.mjs';
const releases=JSON.parse(await readFile(new URL('../src/plugin-icons/RELEASES.json',import.meta.url)));

test('identity registration preserves context ownership, methods, page behavior and non-launcher panels',()=>{
 let page,panel,owner;const icon='data:image/png;base64,eA==',component=()=>null;
 const pages={register(value){assert.equal(this,pages);page=value;return 'registered';}};
 const panels={register(value){assert.equal(this,panels);panel=value;}};
 const context={pages,panels,effect(){owner=this;},reflect:{get:()=>null}};
 const wrapped=withPluginIcon(context,icon);
 assert.equal(wrapped.pages.register({id:'one',component,primary:true,icon:'old'}),'registered');
 assert.equal(page.icon,icon);assert.equal(page.component,component);assert.equal(page.primary,true);
 wrapped.panels.register({id:'panel',launcher:{target:'existing',icon:'old'},component});
 assert.deepEqual(panel.launcher,{target:'existing',icon});
 const plain={id:'no-launcher',component};wrapped.panels.register(plain);assert.equal(panel,plain);
 wrapped.effect();assert.equal(owner,context);assert.equal(wrapped.reflect,context.reflect);
});

test('each icon release retains its exact baseline, exports, grants and primary registration contract',async()=>{
 const assets=JSON.parse((await pluginCenterDesign()).OPCB_PLUGIN_CENTER_ASSETS);
 for(const row of releases){
  const root=new URL('../'+row.sourcePath+'/',import.meta.url),base=new URL('../'+row.basePath+'/',import.meta.url);
  const before=await readFile(new URL('plugin.js',base));assert.equal(createHash('sha256').update(before).digest('hex'),row.codeSha256,row.id);
  assert.deepEqual(JSON.parse(await readFile(new URL('manifest.json',root))),JSON.parse(await readFile(new URL('manifest.json',base))),row.id);
  const original=await import(new URL('plugin.js',base)),updated=await import(new URL('plugin.js',root));
  assert.deepEqual(Object.keys(updated).sort(),Object.keys(original).sort(),row.id);
  assert.deepEqual(updated.inject,original.inject,row.id);
  assert.equal((await readFile(new URL('icon.png',root))).subarray(0,8).toString('hex'),'89504e470d0a1a0a',row.id);
  const observed=[];
  function context(){
   const ctx={react:React,effect:()=>{},reflect:{get:()=>undefined}};
   const recorder=(name,value)=>{observed.push([name,value]);};
   for(const service of ['pages','panels','agents','settingsCards','conversation','accountActions','shortcuts'])ctx[service]=new Proxy({}, {get:(_,name)=>(value)=>recorder(service+'.'+String(name),value)});
   ctx.relay={snapshot:()=>({status:'disconnected',session:{}}),subscribe:()=>()=>{}};
   ctx.browser={available:false};ctx.host={request:()=>{throw Error('unexpected host request');}};
   return ctx;
  }
  original.apply(context());const old=observed.splice(0);updated.apply(context());
  assert.deepEqual(observed.map(([name,value])=>[name,value?.id||value?.name]),old.map(([name,value])=>[name,value?.id||value?.name]),row.id);
  for(const [name,value] of observed){
   if(name==='pages.register')assert.equal(value.icon,pluginIcon({id:row.id},assets),row.id);
   if(name==='panels.register'&&value.launcher)assert.equal(value.launcher.icon,pluginIcon({id:row.id},assets),row.id);
  }
 }
});
