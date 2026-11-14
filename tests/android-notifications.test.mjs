import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import sender from '../plugins/opcb.android-notifications/0.1.0/sender.cjs';
import {eligible, nativeClient, createBridge, WORKER} from '../plugins/opcb.android-notifications/0.1.0/plugin.js';

const scope = {viewer: 'a'.repeat(64), origin: 'https://isolated.test'};
const channelId = 'fb867d40-3919-4001-bd86-d89cb144990b';
function fixture() {
  const receiver = crypto.createECDH('prime256v1'); receiver.generateKeys();
  const pair = {version:1, viewer:scope.viewer, communityOrigin:scope.origin,
    deviceId:'fb867d40-3919-4001-bd86-d89cb144990a', subscription:{endpoint:'https://ntfy.sh/isolated-p1?up=1',
      p256dh:receiver.getPublicKey().toString('base64url'), auth:crypto.randomBytes(16).toString('base64url')}};
  return {receiver, pair};
}
const message = () => ({messageId:'b'.repeat(64), channelId, authorId:'c'.repeat(64), createdAt:Math.floor(Date.now()/1000), previewContent:'隔离测试，非真实团队消息'});
function decrypt(record, receiver, subscription) {
  assert.equal(record.readUInt32BE(16), 4096);
  assert.equal(record[20], 65);
  const publicKey = record.subarray(21,86), salt = record.subarray(0,16);
  const shared = receiver.computeSecret(publicKey);
  const kdf = (key, salt, info, n) => Buffer.from(crypto.hkdfSync('sha256',key,salt,Buffer.from(info),n));
  const ikm = kdf(shared, Buffer.from(subscription.auth,'base64url'), Buffer.concat([Buffer.from('WebPush: info\0'), receiver.getPublicKey(), publicKey]),32);
  const decipher = crypto.createDecipheriv('aes-128-gcm', kdf(ikm,salt,'Content-Encoding: aes128gcm\0',16),kdf(ikm,salt,'Content-Encoding: nonce\0',12));
  decipher.setAuthTag(record.subarray(-16));
  const plain = Buffer.concat([decipher.update(record.subarray(86,-16)),decipher.final()]);
  assert.equal(plain.at(-1),2); return JSON.parse(plain.subarray(0,-1));
}
test('RFC8291 encrypted sends survive restart, dedupe unknown results and keep pairing private/scoped', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'opcb-notify-test-'));
  const {receiver,pair} = fixture(), posts = [];
  const post = async (url, options) => {posts.push({url,options}); return {status:201};};
  try {
    let worker = sender.createWorker({root,post});
    await worker({op:'save',scope,pair,channels:[channelId]});
    worker = sender.createWorker({root,post});
    const loaded = await worker({op:'load',scope}); assert.equal(loaded.enabled,true); assert.equal('subscription' in loaded,false);
    assert.equal((await worker({op:'load',scope:{...scope,viewer:'d'.repeat(64)}})).enabled,false);
    const m = {...message(),threadRootId:'e'.repeat(64)};
    await worker({op:'send',scope,message:m,title:'隔离会话'});
    assert.equal(posts.length,1); assert.equal(posts[0].url,pair.subscription.endpoint);
    const payload = decrypt(posts[0].options.body,receiver,pair.subscription);
    assert.equal(payload.body,m.previewContent); assert.equal(payload.threadRootId,m.threadRootId);
    assert.equal(payload.communityOrigin,scope.origin); assert.equal(payload.viewer,scope.viewer);
    assert.equal(posts[0].options.redirect,'manual');
    assert.equal((await worker({op:'send',scope,message:m})).duplicate,true);
    const badPost = sender.createWorker({root,post:async()=>{throw Error('lost acknowledgement');}});
    await assert.rejects(badPost({op:'send',scope,message:{...m,messageId:'f'.repeat(64)}}));
    assert.equal((await worker({op:'send',scope,message:{...m,messageId:'f'.repeat(64)}})).duplicate,true);
    const inactive = sender.createWorker({root,post:async()=>({status:507})});
    await assert.rejects(inactive({op:'send',scope,message:{...m,messageId:'9'.repeat(64)}}), /subscriber_inactive/);
    for(const file of await fs.readdir(root)) {
      const content = await fs.readFile(path.join(root,file),'utf8');
      assert.equal(content.includes(m.previewContent),false);
      if(process.platform!=='win32') assert.equal((await fs.stat(path.join(root,file))).mode & 0o777,0o600);
    }
    await worker({op:'clear',scope}); assert.equal((await worker({op:'load',scope})).enabled,false);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('pairing rejects another identity/community, unsafe endpoints and malformed EC keys', () => {
  const {pair}=fixture();
  for(const bad of [{...pair,viewer:'d'.repeat(64)}, {...pair,communityOrigin:'https://another.test'},
    {...pair,subscription:{...pair.subscription,endpoint:'https://evil.test/topic?up=1'}},
    {...pair,subscription:{...pair.subscription,p256dh:'bad'}}]) assert.throws(()=>sender.pairing(bad,scope));
});
test('live eligibility obeys unread, mute, viewed, replay-age and internal audience rules', () => {
  let attention={status:'eligible',unread:true,mentioned:false,viewing:false}, prefs={status:'ready',data:{muted:[]}}, sync={status:'ready',capability:'supported',completeness:'complete'};
  const session={viewer:scope.viewer,channels:{list:()=>({status:'ready',channels:[{id:channelId}]})},
    unread:{attention:()=>attention,sync:()=>sync},sidebarPreferences:{snapshot:()=>prefs}};
  const m=message(); assert.equal(eligible(session,m),true);
  const original=session.channels.list; session.channels.list=()=>({status:'ready',channels:[{id:channelId,metadataPending:true}]}); assert.equal(eligible(session,m),'wait'); session.channels.list=original;
  for(const patch of [{authorId:scope.viewer},{audience:'agents'},{createdAt:1}]) assert.equal(eligible(session,{...m,...patch}),false);
  prefs={status:'ready',data:{muted:[channelId]}}; assert.equal(eligible(session,m),false);
  attention={...attention,mentioned:true}; assert.equal(eligible(session,m),true);
  attention={...attention,viewing:true}; assert.equal(eligible(session,m),false);
  attention={...attention,viewing:false,unread:false}; assert.equal(eligible(session,m),false);
  attention={...attention,unread:true}; sync={...sync,completeness:'unknown'}; assert.equal(eligible(session,m),'wait');
});
test('retiring a sender while process startup awaits kills the late process', async()=>{
  let ready, killed=0;
  const client=nativeClient({spawn:()=>new Promise(resolve=>{ready=resolve;})},'isolated-worker');
  const call=client.call({op:'load',scope}); client.close();
  ready({write:async()=>{},kill:()=>killed++,exited:new Promise(()=>{})});
  await assert.rejects(call); assert.equal(killed,1);
});
test('real bridge uses native live messages and retires scope without replaying old pairing', async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'opcb-notify-bridge-'));
  const {pair}=fixture(), posts=[];
  const worker=sender.createWorker({root,post:async(url,options)=>{posts.push({url,options});return {status:201};}});
  let receive, changed, kills=0;
  const session={viewer:scope.viewer,channels:{list:()=>({status:'ready',channels:[{id:channelId,name:'隔离会话'}]}),subscribeList:()=>()=>{}},
    subscribeIncoming:fn=>{receive=fn;return()=>{receive=undefined;};},unread:{attention:()=>({status:'eligible',unread:true}),sync:()=>({status:'ready',capability:'unsupported'})},
    sidebarPreferences:{snapshot:()=>({status:'ready',data:{muted:[]}})}};
  let connection={status:'ready',origin:scope.origin,generation:1,session};
  const host={spawn:async(_,callbacks)=>{
    let resolveExit, initialized=false;
    return {exited:new Promise(resolve=>{resolveExit=resolve;}),kill:()=>{kills++;resolveExit();},write:async line=>{
      const command=JSON.parse(line);
      if(!initialized){initialized=true;return;}
      try {const value=await worker(command); callbacks.onStdout(JSON.stringify({id:command.id,value})+'\n');}
      catch {callbacks.onStdout(JSON.stringify({id:command.id,error:'isolated failure'})+'\n');}
    }};
  }};
  const bridge=createBridge({host,relay:{snapshot:()=>connection,subscribe:fn=>{changed=fn;return()=>{};}}},'fixture boot');
  const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  try {
    await tick(30); await bridge.save(JSON.stringify(pair),[channelId]);
    assert.equal(bridge.snapshot().enabled,true);
    const m=message(); receive([m,m]); await tick(700); assert.equal(posts.length,1);
    assert.match(bridge.snapshot().status,/手机送达待确认/);
    connection={...connection,generation:2,session:{...session,viewer:'d'.repeat(64)}}; changed();
    await tick(30); assert.equal(bridge.snapshot().enabled,false); assert.deepEqual(bridge.snapshot().selected,[]); assert.ok(kills>0);
  } finally {bridge.dispose(); await fs.rm(root,{recursive:true,force:true});}
});

test('installable bundle contains the exact reviewed worker and client source',async()=>{
const folder=new URL('../plugins/opcb.android-notifications/0.1.0/',import.meta.url);
assert.equal(WORKER,await fs.readFile(new URL('sender.cjs',folder),'utf8'));
const code=await fs.readFile(new URL('plugin.js',folder),'utf8');
assert.ok(code.startsWith(await fs.readFile(new URL('client.js',folder),'utf8')));
});
test('declared native Node launcher executes the actual embedded worker protocol',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../plugins/opcb.android-notifications/0.1.0/manifest.json',import.meta.url),'utf8'));
  const client=nativeClient({spawn:async(id,callbacks)=>{
    assert.equal(id,'sender');
    const proc=spawn(process.execPath,manifest.host.processes[0].args,{stdio:['pipe','pipe','pipe']});
    proc.stdout.on('data',chunk=>callbacks.onStdout(chunk.toString()));
    return {write:async text=>{await new Promise((resolve,reject)=>proc.stdin.write(text,error=>error?reject(error):resolve()));},
      kill:()=>proc.kill(),exited:new Promise(resolve=>proc.on('exit',resolve))};
  }},WORKER);
  try {
    const result=await client.call({op:'load',scope:{viewer:'f'.repeat(64),origin:'https://p1-loader-'+crypto.randomUUID()+'.invalid'}});
    assert.equal(result.enabled,false); assert.deepEqual(result.channels,[]);
  } finally {client.close();}
});
