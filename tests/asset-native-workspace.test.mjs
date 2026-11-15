import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fitMedia} from '../src/media-workspace/adaptive-video.mjs';
import {createAssetWorkspace} from '../src/shangliangshan-assets/native-workspace.mjs';
test('video surface follows portrait or landscape ratio and fits both pane constraints',()=>{
 assert.deepEqual(fitMedia(1000,700,1080,1920),{width:393,height:700});
 assert.deepEqual(fitMedia(1000,700,1920,1080),{width:1000,height:562});
 assert.deepEqual(fitMedia(240,500,1080,1920),{width:240,height:426});
 assert.equal(fitMedia(0,500,1080,1920),null);
});
test('asset sessions cannot outlive identity or community ownership',async()=>{
 let current={status:'ready',cached:false,scope:'one',generation:1,session:{viewer:'owner'}};
 const w=createAssetWorkspace({relay:{snapshot:()=>current},host:{}});w.bind(current);
 current={...current,scope:'two'};await assert.rejects(w.members(),/账号、社区/);
 assert.equal(w.snapshot().data,null);w.dispose();
});
test('asset adapter uses a new cookie jar, validates native member selection and clears revoked sessions',()=>{
 const output=execFileSync('python3',['tests/asset_native_session_test.py'],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:15000});
 assert.match(output,/ASSET_NATIVE_SESSION_OK/);
});
test('asset adapter discards late images when the connected owner changes',async()=>{
 const prior=globalThis.OPCB_ASSET_SESSION_SOURCE;globalThis.OPCB_ASSET_SESSION_SOURCE='test-fixture-source';
 let connection={status:'ready',cached:false,scope:'one',generation:1,session:{viewer:'owner'}},out,input='',boot=false,kills=0,imageRequest;
 const raw='https://staging.paolab.cn/assets/api/assets/files/12345678-1234-1234-1234-123456789abc/preview';
 const child={kill:async()=>{kills++;},exited:new Promise(()=>{}),write:async part=>{input+=part;let end;while((end=input.indexOf('\n'))>=0){const line=input.slice(0,end);input=input.slice(end+1);if(!boot){boot=true;out(JSON.stringify({ready:true,base:'http://127.0.0.1:12345/'+'a'.repeat(43)+'/'})+'\n');continue;}const req=JSON.parse(line);if(req.action==='image'){imageRequest=req;continue;}out(JSON.stringify({id:req.id,result:req.action==='members'?[{id:'pantao',name:'潘涛'}]:{data:{user:{id:'pantao'},assets:[],files:[]},media:{[raw]:'x'.repeat(24)}}})+'\n');}}};
 const w=createAssetWorkspace({relay:{snapshot:()=>connection},host:{spawn:async(_id,options)=>{out=options.onStdout;return child;}}});
 try{
  w.bind(connection);await w.members();await w.login('pantao');const image=w.image(raw);await new Promise(resolve=>setImmediate(resolve));
  assert.ok(imageRequest);connection={...connection,scope:'two',session:{viewer:'other'}};w.bind(connection);
  out(JSON.stringify({id:imageRequest.id,result:'data:image/png;base64,aA=='})+'\n');
  await assert.rejects(image,/会话已关闭|账号/);assert.equal(w.snapshot().data,null);assert.ok(kills>=1);
 }finally{w.dispose();globalThis.OPCB_ASSET_SESSION_SOURCE=prior;}
});
