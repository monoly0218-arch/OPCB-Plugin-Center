import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewState,reviewDemands,reviewNotes,reviewExperience} from '../src/commercial/growth-review.mjs';
const content=[{id:'C01',title:'原始标题',owner:'测试成员',date:'2026-11-17',time:'12:30',status:'草案'}];
test('work colors require explicit revision or approval and keep missing data separate',()=>{
 assert.equal(reviewState([],false).key,'empty');
 assert.equal(reviewState([{status:'草案'}],true).key,'data');
 assert.equal(reviewState([{status:'needs_changes'},{status:'done'}],true).key,'changes');
 assert.equal(reviewState([{status:'review'}],true).key,'data');
 assert.equal(reviewState([{status:'done'}],true).key,'approved');
});
test('overview includes twelve demands; individual note view does not show other note editors',()=>{
 const d={content:[...content,{...content[0],id:'C02',title:'第二篇'}]};
 assert.equal((reviewDemands(d,{},true).match(/data-growth-demand=/g)||[]).length,12);
 const single=reviewNotes(d,{growthContent:1},false);
 assert.ok(single.includes('C02标题草稿'));assert.ok(!single.includes('C01标题草稿'));
 const all=reviewNotes(d,{},true);assert.ok(all.includes('C01标题草稿')&&all.includes('C02标题草稿'));
});
test('review fields escape text, reject executable media URLs, and distinguish delivery proposals',()=>{
 const d={content:[{...content[0],title:'<img src=x onerror=1>'}],videos:[{name:'倒计时原片',video:'javascript:alert(1)'}]};
 const note=reviewNotes(d,{},false);assert.ok(!note.includes('<img src=x'));assert.ok(note.includes('&lt;img'));
 assert.ok(!note.includes('src="javascript:'));assert.ok(note.includes('待补原片'));
 const proposal=reviewExperience(d,{growthDemand:'launch'},'result');
 assert.ok(proposal.includes('企业微信客服'));assert.ok(proposal.includes('自动发送尚未接通'));assert.ok(proposal.includes('disabled'));
});
