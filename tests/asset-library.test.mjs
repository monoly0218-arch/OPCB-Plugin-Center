import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {assetCollection,assetFiles,assetMediaUrl,assetRows} from '../src/shangliangshan-assets/model.mjs';
import {createAssetLibraryUI} from '../src/shangliangshan-assets/library-ui.mjs';

const files=[{id:'old',kind:'image',url:'/api/assets/files/old/preview'},{id:'current',kind:'video',url:'/api/assets/files/current/preview',poster:'/api/assets/files/current/poster'}];
const asset={id:'a',title:'测试文件',category:'product',createdById:'owner',updatedAt:'2026-11-14',versions:[{number:1,fileIds:['old']},{number:2,mediaItems:[{kind:'video',video:'current'}]}]};
test('asset version selection resolves exact files and keeps source records intact',()=>{
  const before=structuredClone(asset);
  assert.deepEqual(assetFiles(asset,files).map(f=>f.id),['current']);
  assert.deepEqual(assetFiles(asset,files,asset.versions[0]).map(f=>f.id),['old']);
  assert.deepEqual(assetFiles(asset,files,{number:0,fileIds:['missing']}),[]);
  assert.deepEqual(asset,before);
});
test('asset media addresses apply the deployed assets mount without permitting another origin',()=>{
  assert.equal(assetMediaUrl('/api/assets/files/old/preview'),'https://staging.paolab.cn/assets/api/assets/files/old/preview');
  assert.equal(assetMediaUrl('https://evil.test/assets/a.jpg'),undefined);
  assert.equal(assetMediaUrl('https://user:password@staging.paolab.cn/assets/a.jpg'),undefined);
  assert.equal(assetMediaUrl('javascript:alert(1)'),undefined);
});
test('asset taxonomy and personal filtering use authoritative rows and exclude trash',()=>{
  const data={user:{id:'owner'},files,assets:[asset,{...asset,id:'b',createdById:'other',category:'product-knowledge'},{...asset,id:'c',trashed:true}]};
  assert.equal(assetCollection(asset,files),'videos');
  assert.equal(assetCollection(data.assets[1],files),'brand');
  assert.deepEqual(assetRows(data,{mine:true}).map(a=>a.id),['a']);
  assert.deepEqual(assetRows(data,{collection:'brand'}).map(a=>a.id),['b']);
  assert.deepEqual(assetRows(data,{query:'不存在'}),[]);
});
test('asset workspace never manufactures business rows while the source is missing',()=>{
  const Library=createAssetLibraryUI(React);
  const html=renderToStaticMarkup(React.createElement(Library,{data:null,error:'资产登录已过期'}));
  assert.match(html,/资产登录已过期/);
  assert.doesNotMatch(html,/class="mw-media-row"/);
});
