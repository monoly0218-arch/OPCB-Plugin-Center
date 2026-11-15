import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import React from 'react';
import {IDENTITY_ICONS} from '../src/identity-icons/icons.mjs';
import {withPluginIcon} from '../src/plugin-icons/context.mjs';
import {pluginIcon} from '../src/plugin-center/visuals.mjs';
import {loadDirectory,CATALOG_REFERENCE,installSource} from '../src/plugin-center/directory.mjs';
const root=new URL('../',import.meta.url),rows=JSON.parse(await readFile(new URL('src/identity-icons/RELEASES.json',root)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('identity wrapper preserves service receivers, cleanup ownership and contributions',()=>{
 let page,panel,owner;const pages={register(value){assert.equal(this,pages);page=value;return 'ok';}},panels={register(value){assert.equal(this,panels);panel=value;}},ctx={pages,panels,effect(){owner=this;},reflect:{get:()=>null}},wrapped=withPluginIcon(ctx,'new'),component=()=>null;
 assert.equal(wrapped.pages.register({id:'same',primary:true,component}),'ok');assert.equal(page.component,component);assert.equal(page.icon,'new');
 wrapped.panels.register({launcher:{target:'same',icon:'old'},component});assert.deepEqual(panel.launcher,{target:'same',icon:'new'});
 const plain={id:'no-launcher',component};wrapped.panels.register(plain);assert.equal(panel,plain);wrapped.effect();assert.equal(owner,ctx);assert.equal(wrapped.reflect,ctx.reflect);
});
for(const row of rows.filter(r=>r.id!=='opcb.plugin-center'))test(`packaged ${row.id} ${row.baseVersion} retains all business registrations and grants`,async()=>{
 const base=new URL(row.basePath+'/',root),folder=new URL(row.sourcePath+'/',root);
 assert.equal(hash(await readFile(new URL('plugin.js',base))),row.codeSha256);
 const currentManifest=JSON.parse(await readFile(new URL('manifest.json',folder))),baseManifest=JSON.parse(await readFile(new URL('manifest.json',base)));
 // Maintained business releases can describe their new behavior; grants and identity remain exact.
 if(row.buildScript){assert.equal(typeof currentManifest.description,'string');assert(currentManifest.description.includes(row.version));delete currentManifest.description;delete baseManifest.description;}
 assert.deepEqual(currentManifest,baseManifest);
 const original=await import(new URL('plugin.js',base)),updated=await import(new URL('plugin.js',folder));
 assert.deepEqual(Object.keys(updated).sort(),Object.keys(original).sort());assert.deepEqual(updated.inject,original.inject);
 const seen=[];function context(){const ctx={react:React,effect:()=>{},reflect:{get:()=>undefined},browser:{available:false},host:{request(){throw Error('Unexpected network');}},relay:{snapshot:()=>({status:'disconnected',session:{}}),subscribe:()=>()=>{}}};
  for(const service of ['pages','panels','agents','settingsCards','conversation','accountActions','shortcuts'])ctx[service]=new Proxy({}, {get:(_,name)=>value=>seen.push([`${service}.${String(name)}`,value])});return ctx;}
 original.apply(context());const before=seen.splice(0);updated.apply(context());
 assert.deepEqual(seen.map(([name,v])=>[name,v?.id||v?.name]),before.map(([name,v])=>[name,v?.id||v?.name]));
 for(let i=0;i<seen.length;i++){const [name,value]=seen[i],previous=before[i][1];
  if(name==='pages.register'){assert.equal(value.icon,IDENTITY_ICONS[row.id]);assert.equal(value.primary,previous.primary);assert.equal(value.placement,previous.placement);assert.equal(value.layout,previous.layout);}
  if(name==='panels.register'&&value.launcher){assert.equal(value.launcher.icon,IDENTITY_ICONS[row.id]);assert.equal(value.launcher.target,previous.launcher.target);}
  if(name==='agents.addTool'){assert.equal(value.description,previous.description);assert.deepEqual(value.inputSchema,previous.inputSchema);}
  if(name==='agents.addInstructions')assert.equal(value.text,previous.text);
 }
 assert.equal('data:image/png;base64,'+(await readFile(new URL('icon.png',folder))).toString('base64'),IDENTITY_ICONS[row.id]);
 const info=JSON.parse(await readFile(new URL('IDENTITY.json',folder)));assert.equal(info.sha256,hash(await readFile(new URL('icon.png',folder))));
});
test('all 17 OPCB IDs and both pool lines share canonical directory/package identities',()=>{
 assert.equal(Object.keys(IDENTITY_ICONS).length,17);assert.equal(rows.length,18);assert.equal(rows.filter(r=>r.id==='opcb.higgsfield-mailbox').length,2);
 for(const row of rows)assert.equal(pluginIcon({id:row.id,icon:'old'},{[row.id]:'stale'}),IDENTITY_ICONS[row.id]);
});
test('released catalog pins registry reading and native installation to exact commits',async()=>{
 const sha='a'.repeat(40),pin='b'.repeat(40),calls=[];
 const row={id:'opcb.example',name:'测试插件',version:'0.1.0',category:'工具',summary:'公开目录',requirements:'本人审核',sourcePath:'plugins/opcb.example/0.1.0',downloadPath:'releases/example.zip',reviewSource:{repository:'monoly0218-arch/OPCB-Plugin-Center',reference:'distribution/example',commit:pin,path:'.'}};
 const loaded=await loadDirectory(async request=>{calls.push(request);return {status:200,body:JSON.stringify(calls.length===1?{sha}:{encoding:'base64',content:Buffer.from(JSON.stringify({schema:1,repository:'monoly0218-arch/OPCB-Plugin-Center',entries:[row]})).toString('base64')})};});
 assert(calls[0].url.endsWith('/commits/'+encodeURIComponent(CATALOG_REFERENCE)));assert(calls[1].url.endsWith('?ref='+sha));assert(calls.every(r=>r.headers['User-Agent']));assert.equal(installSource(loaded.entries[0],sha).commit,pin);
});
