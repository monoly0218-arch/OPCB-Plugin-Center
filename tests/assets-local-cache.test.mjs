import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssetCache} from '../src/shangliangshan-assets/local-cache.mjs';

const binding = {community: 'relay', owner: 'first-viewer', member: 'pantao'};
const source = 'https://staging.paolab.cn/assets/api/assets/files/aa0/preview';
const img = 'data:image/jpeg;base64,AAAA';
const sample = {
  revision: 10,
  user: {id: 'pantao', name: 'Owner', role: 'admin', capabilities: {delete: true}, sessionToken: 'secret'},
  assets: [{id: 'photo', title: 'A photo', revision: 3, caption: 'private source', tags: ['team'], versions: [{number: 1, fileIds: ['aa0']}]}],
  files: [{id: 'aa0', kind: 'image', url: source, poster: source+'?token=secret'}, {id: 'external', url: 'https://example.org/a'}],
  folders: [{id: 'folder1', name: 'Shared'}],
};
function memory() {
  const data = new Map();
  return {data, getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
}

test('fresh plugin instance reads a scoped, read-only catalog and cover without access tokens', () => {
  const storage = memory();
  const first = createAssetCache(binding,{storage});
  first.write(sample);
  first.storeCover(source, img);
  first.flush();
  const restored = createAssetCache(binding,{storage});
  assert.equal(restored.read().assets[0].title,'A photo');
  assert.equal(restored.read().user.role,'viewer');
  assert.deepEqual(restored.read().user.capabilities,{});
  assert.equal(restored.cover(source),img);
  assert.equal(restored.read().files[0].poster,undefined);
  assert.equal(restored.read().files[1].url,undefined);
  assert.equal([...storage.data.values()].some(raw => raw.includes('secret') || raw.includes('private source')),false);
  for(const scope of [{owner:'second-viewer'},{community:'another-relay'},{member:'other-member'}]){
    const other=createAssetCache({...binding,...scope},{storage});
    assert.equal(other.read(),null);
    assert.equal(other.cover(source),undefined);
  }
});

test('revoked, expired, corrupt and no-store storage cannot repopulate the cache', () => {
  const storage = memory();
  let now = Date.now();
  const clock = {storage,now:()=>now};
  const first = createAssetCache(binding,clock);
  first.write(sample);
  first.storeCover(source,img);
  first.clear();
  first.flush();
  assert.equal(storage.data.size,0);
  first.write(sample);
  now += 8*24*60*60*1000;
  assert.equal(createAssetCache(binding,clock).read(),null);
  first.write(sample);
  const [key] = storage.data.keys();
  storage.data.set(key,'{');
  assert.equal(first.read(),null);
  const forbidden = createAssetCache(binding,{storage:{getItem(){throw Error('unavailable');}, setItem(){throw Error('quota');}}});
  forbidden.write(sample);
  assert.equal(forbidden.read(),null);
});
