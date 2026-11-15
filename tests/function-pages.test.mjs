import {COMMUNITY} from '../src/media-workspace/role-binding.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {browseAssets,assetAllowed,assetTopic} from '../src/shangliangshan-assets/model.mjs';
import {createFactoryWorkspace} from '../src/content-factory/plugin.mjs';
const files=[{id:'i',kind:'image'},{id:'v',kind:'video'},{id:'p',kind:'pdf'}];
const make=(id,extra={})=>({id,title:id,createdById:'me',createdAt:'2026-11-14T08:00:00Z',assetDate:'2026-11-13T08:00:00Z',tags:[],category:'images',versions:[{number:1,fileIds:['i']}],...extra});
const data={user:{id:'me',role:'admin'},files,assets:[make('current'),make('old',{assetDate:'2020-01-01'}),make('other',{createdById:'other'}),make('trash',{trashed:true}),make('pending',{category:''}),make('published',{publications:[{platform:'小红书',version:1}]}),make('pdf',{category:'brand',versions:[{number:1,fileIds:['p']}]}),make('gallery',{versions:[{number:1,fileIds:['i','i']}]}),make('video',{category:'videos',versions:[{number:1,fileIds:['v']}]})]};
test('asset function scopes preserve trash, original material dates, platform records, and grouped media kinds',()=>{
  assert.deepEqual(browseAssets(data,{scope:'trash'}).map(a=>a.id),['trash']);
  assert.equal(browseAssets(data,{scope:'pending'}).length,1);
  assert.ok(!browseAssets(data,{scope:'recent',now:Date.parse('2026-11-15')}).some(a=>a.id==='old'));
  assert.ok(!browseAssets(data,{scope:'mine'}).some(a=>a.id==='other'));
  assert.deepEqual(browseAssets(data,{platform:'xhs',published:'yes'}).map(a=>a.id),['published']);
  assert.ok(!browseAssets(data,{platform:'xhs',published:'no'}).some(a=>a.id==='published'));
  assert.deepEqual(browseAssets(data,{kind:'documents'}).map(a=>a.id),['pdf']);
  assert.ok(browseAssets(data,{kind:'pictures'}).some(a=>a.id==='gallery'));
  assert.deepEqual(browseAssets(data,{from:'2026-11-14'}),[]);
});
test('asset folder restrictions are enforced even when navigating by search, and viewers cannot edit',()=>{
  const restricted={...data,user:{id:'me',role:'viewer',capabilities:{download:true,upload:true},folderRights:{images:'none',brand:'viewer'}}};
  assert.ok(!browseAssets(restricted,{query:'current'}).length);
  assert.ok(assetAllowed(restricted,'download',data.assets.find(a=>a.id==='pdf')));
  assert.equal(assetAllowed(restricted,'upload',data.assets.find(a=>a.id==='pdf')),false);
  assert.equal(assetTopic(make('legacy',{category:'product'}),files),'product');
  assert.equal(assetTopic(make('bad',{topic:'unknown'}),files),'');
});
function factory(){
  let d={current_member:{id:'me'},members:[{id:'me',name:'潘涛'}],cards:[{id:'a',title:'a',note:'',version:1,status:'pending',media_status:'ready'}],reviews:[],comments:[],source_images:[]};
  const calls=[],connection={status:'ready',cached:false,scope:'scope',generation:1,session:{viewer:'96ddfaedaca50c0248576563df8dff9f08ed8abd5ddead823b44635b181fb24d',relayAuthor:COMMUNITY}};
  const w=createFactoryWorkspace({relay:{snapshot:()=>connection},host:{request:async req=>{calls.push(req);if(req.url.endsWith('/opcb/login'))return {status:200,body:JSON.stringify({token:'test'})};if(req.url.endsWith('/state'))return {status:200,body:JSON.stringify(d)};if(req.url.endsWith('/review')){d={...d,reviews:req.method==='DELETE'?[]:[{card_id:'a',member_id:'me',verdict:JSON.parse(req.body).verdict}]};}return {status:200,body:'{}'};}}});w.bind(connection);
  return {w,calls,get:()=>structuredClone(d),set:value=>{d=value;}};
}
test('factory review toggle and undo use the original review routes and restore the previous choice',async()=>{
  const {w,calls}=factory();await w.connect();const card=w.snapshot().data.cards[0];
  await w.act(card,'yes');assert.equal(w.snapshot().data.reviews[0].verdict,'yes');
  await w.act(card,'undo');assert.equal(w.snapshot().data.reviews.length,0);
  assert.deepEqual(calls.filter(r=>r.url.endsWith('/review')).map(r=>r.method),['POST','DELETE']);
  await assert.rejects(w.act(card,'undo'),/没有可撤销/);w.dispose();
});
test('factory workflow refuses a changed card before writing and binds approval to the current result revision',async()=>{
  const {w,calls,get,set}=factory();await w.connect();const stale=w.snapshot().data.cards[0],d=get();d.cards[0].version=2;d.cards[0].result_revision=3;set(d);
  await assert.rejects(w.act(stale,'confirm'),/素材已更新/);assert.equal(calls.filter(r=>r.url.endsWith('/workflow')).length,0);
  const current=w.snapshot().data.cards[0];await w.act(current,'approve');const request=calls.find(r=>r.url.endsWith('/workflow'));
  assert.deepEqual(JSON.parse(request.body),{action:'approve',version:2,result_revision:3});w.dispose();
});

test('asset roster resolves declared defaults and folder-keyed overrides without inventing saved roles',async()=>{
  const {assetMembers}=await import('../src/shangliangshan-assets/model.mjs');
  const members=assetMembers({...data,governance:{roles:{xiaolu:'viewer'},folderRights:{images:{xiaolu:'none'}}}});
  assert.equal(members.find(m=>m.id==='pantao').role,'admin');
  assert.equal(members.find(m=>m.id==='xiaolu').folderRights.images,'none');
  assert.equal(members.find(m=>m.id==='xiaopao').capabilities.delete,false);
});

test('a failed post-write read locks further mutations until an explicit refresh succeeds',async()=>{
  let failed=false,failRead=false,writes=0;
  const connection={status:'ready',cached:false,scope:'scope',generation:1,session:{viewer:'96ddfaedaca50c0248576563df8dff9f08ed8abd5ddead823b44635b181fb24d',relayAuthor:COMMUNITY}};
  const d={current_member:{id:'me'},members:[{id:'me',name:'潘涛'}],cards:[{id:'a',title:'a',version:1,status:'pending',media_status:'ready'}],reviews:[],comments:[],source_images:[]};
  const w=createFactoryWorkspace({relay:{snapshot:()=>connection},host:{request:async r=>{
    if(r.url.endsWith('/opcb/login'))return {status:200,body:'{"token":"test"}'};
    if(r.url.endsWith('/state')){if(failRead){failed=true;throw Error('network');}return {status:200,body:JSON.stringify(d)};}
    writes++;failRead=true;return {status:200,body:'{}'};
  }}});w.bind(connection);await w.connect();
  const card=w.snapshot().data.cards[0];await assert.rejects(w.act(card,'comment',{text:'test'}),/回读失败/);
  assert.equal(failed,true);assert.equal(w.snapshot().syncRequired,true);
  await assert.rejects(w.act(card,'comment',{text:'test'}),/先刷新/);assert.equal(writes,1);
  failRead=false;await w.refresh();assert.equal(w.snapshot().syncRequired,false);w.dispose();
});
