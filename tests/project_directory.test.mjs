import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDirectory,readDirectory,replaceDirectory,canManageDirectory,canPublishPrivate,lockedDirectoryEntries,saveDirectoryEntry} from '../src/project-workspace/directory.mjs';
const directory=()=>({schema:1,id:'shared-index',revision:0,entries:[{channelId:'private-job',title:'允许共享的任务名',company:'OPCB'}]});
function fixture(){
 const index={id:'shared-index',name:'共享目录',visibility:'public',creator:'admin',owners:['admin'],members:['admin'],channelType:'stream'},target={id:'private-job',name:'私密原名称',visibility:'private',private:true,creator:'admin',owners:['admin'],members:['admin'],channelType:'stream'};
 let head={id:'head-0',content:replaceDirectory('# 保留原文',directory())},saves=0,reads=[];const channels=[index,target];
 const session={viewer:'admin',channels:{list:()=>({status:'ready',channels}),get:id=>channels.find(c=>c.id===id)},canvas:{available:true,read:async id=>{reads.push(id);assert.equal(id,'shared-index');return head;},save:async(id,content,expected,options)=>{assert.equal(id,index.id);assert.equal(expected,head.id);assert.deepEqual(options,{preserveApproval:true});saves++;head={id:'head-'+saves,content};return head;}}};
 const connection={status:'ready',scope:'community-A',generation:1,session};return{index,target,channels,session,connection,current:()=>connection,get head(){return head;},set head(value){head=value;},get saves(){return saves;},reads};
}
test('shared index round trips minimal metadata while preserving other Canvas prose',()=>{
 const d=directory(),text=replaceDirectory('# 保留原文',d);assert.ok(text.startsWith('# 保留原文'));assert.deepEqual(readDirectory({content:text},d.id),d);
 d.revision++;d.entries=[];const next=replaceDirectory(text,d);assert.equal(next.match(/opcb-project-directory/g).length,1);assert.deepEqual(readDirectory({content:next},d.id),d);
 assert.throws(()=>readDirectory({content:text+'\n'+text},d.id),/重复/);assert.throws(()=>replaceDirectory('```opcb-project-directory\n{broken}\n```',d),/损坏/);
});
test('shared index rejects extra private data, invalid IDs, self references and duplicate entries',()=>{
 const d=directory();assert.throws(()=>validateDirectory({...d,summary:'secret'},d.id),/格式/);
 assert.throws(()=>validateDirectory({...d,entries:[{...d.entries[0],summary:'secret'}]},d.id),/条目/);
 assert.throws(()=>validateDirectory({...d,entries:[...d.entries,...d.entries]},d.id),/条目/);
 assert.throws(()=>validateDirectory({...d,entries:[{...d.entries[0],channelId:d.id}]},d.id),/条目/);
 assert.throws(()=>validateDirectory({...d,entries:[{...d.entries[0],channelId:'https://private'}]},d.id),/条目/);
 assert.throws(()=>validateDirectory({...d,entries:[{...d.entries[0],title:'\nsecret'}]},d.id),/条目/);
});
test('a visible locked entry grants no private read, join or task payload; invitation switches it to normal access',()=>{
 const f=fixture();f.session.viewer='reader';f.channels.splice(1,1);const d=directory();assert.deepEqual(lockedDirectoryEntries([d],f.connection),[{...d.entries[0],directoryId:d.id}]);assert.deepEqual(f.reads,[]);
 f.channels.push({...f.target,members:['admin','reader']});assert.deepEqual(lockedDirectoryEntries([d],f.connection),[]);
 f.index.visibility='private';assert.deepEqual(lockedDirectoryEntries([d],f.connection),[]);
});
test('publishing needs both source directory administrator and private-channel administrator',async()=>{
 const f=fixture();assert.equal(canManageDirectory(f.connection,f.index.id),true);assert.equal(canPublishPrivate(f.connection,f.target.id),true);
 f.session.viewer='guest';f.index.members.push('guest');f.target.members.push('guest');assert.equal(canManageDirectory(f.connection,f.index.id),false);assert.equal(canPublishPrivate(f.connection,f.target.id),false);
 await assert.rejects(saveDirectoryEntry({connection:f.connection,current:f.current,directoryId:f.index.id,headId:f.head.id,revision:0,entry:directory().entries[0]}),/权限/);assert.equal(f.saves,0);
 f.session.viewer='admin';f.target.creator='other';f.target.owners=[];await assert.rejects(saveDirectoryEntry({connection:f.connection,current:f.current,directoryId:f.index.id,headId:f.head.id,revision:0,entry:directory().entries[0]}),/管理员/);assert.equal(f.saves,0);
});
test('publish and withdraw touch only the index, keep protected prose and preserve conflict safety',async()=>{
 const f=fixture(),entry={channelId:'private-job',title:'自选公开名称',company:'品牌'};
 const added=await saveDirectoryEntry({connection:f.connection,current:f.current,directoryId:f.index.id,headId:f.head.id,revision:0,entry});assert.equal(added.directory.revision,1);assert.equal(added.directory.entries[0].title,entry.title);assert.ok(f.head.content.startsWith('# 保留原文'));assert.deepEqual(f.reads,['shared-index']);
 await assert.rejects(saveDirectoryEntry({connection:f.connection,current:f.current,directoryId:f.index.id,headId:'head-0',revision:0,removeId:entry.channelId}),/已变化/);assert.equal(f.saves,1);
 const removed=await saveDirectoryEntry({connection:f.connection,current:f.current,directoryId:f.index.id,headId:added.headId,revision:1,removeId:entry.channelId});assert.equal(removed.directory.revision,2);assert.deepEqual(removed.directory.entries,[]);assert.equal(f.saves,2);
});
test('cross-scope and mid-read revocation cannot publish a directory change',async()=>{
 const f=fixture(),base={connection:f.connection,directoryId:f.index.id,headId:f.head.id,revision:0,entry:directory().entries[0]};
 await assert.rejects(saveDirectoryEntry({...base,current:()=>({...f.connection,scope:'community-B'})}),/权限/);assert.equal(f.saves,0);
 f.session.canvas.read=async()=>{f.index.readOnly=true;return f.head;};await assert.rejects(saveDirectoryEntry({...base,current:f.current}),/权限/);assert.equal(f.saves,0);
});
