import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadDirectory,installSource,CATALOG_REFERENCE,CATALOG_PATH,validateRegistry} from '../src/plugin-center/directory.mjs';

test('reinstall catalog resolves one remote head and pins all icon review targets to their reviewed sources',async()=>{
 const registry=JSON.parse(await readFile(new URL('../REINSTALL_REGISTRY.json',import.meta.url)));
 const releases=JSON.parse(await readFile(new URL('../src/plugin-icons/RELEASES.json',import.meta.url)));
 const calls=[],sha='a'.repeat(40);
 const loaded=await loadDirectory(async options=>{
  calls.push(options.url);
  return {status:200,body:JSON.stringify(calls.length===1?{sha}:{encoding:'base64',content:Buffer.from(JSON.stringify(registry)).toString('base64')})};
 });
 assert(calls[0].endsWith('/commits/'+CATALOG_REFERENCE));
 assert(calls[1].endsWith('/contents/'+CATALOG_PATH+'?ref='+sha));
 assert.equal(loaded.commit,sha);
 const active=loaded.entries.filter(e=>!e.legacy);assert.equal(active.length,16);
 for(const row of releases){
  const entry=active.find(e=>e.id===row.id);assert.equal(entry.version,row.version);
  assert.equal(installSource(entry,loaded.commit).commit,row.reviewSource.commit);
 }
 const higgs=active.find(e=>e.id==='opcb.higgsfield-mailbox');assert.equal(higgs.version,'2026-11-13-icons.1');
 assert(loaded.entries.some(e=>e.id===higgs.id&&e.version==='1.4'&&e.legacy));
 assert.equal(active.find(e=>e.id==='opcb.plugin-center').version,'0.2.5');
 // The general repository catalog retains its existing 1.4 recommendation.
 const main=validateRegistry(JSON.parse(await readFile(new URL('../REGISTRY.json',import.meta.url))));
 assert.equal(main.find(e=>e.id===higgs.id&&!e.legacy).version,'1.4');
});
