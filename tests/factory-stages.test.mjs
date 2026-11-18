import test from 'node:test';
import assert from 'node:assert/strict';
import {FACTORY_STAGES, inStage, pendingReviewFeedback, productionParticipants} from '../src/content-factory/model.mjs';

const members=[{id:'alice',name:'制作人甲'},{id:'bob',name:'制作人乙'},{id:'reviewer',name:'审片人'}];
const card={id:'clip',status:'progress',owner_id:'alice',result_revision:2};
const data={
  current_member:members[0],members,
  production_claims:[{card_id:'clip',member_id:'alice'},{card_id:'clip',member_id:'bob'}],
  production_versions:[
    {card_id:'clip',member_id:'alice',version_id:'a1',version_number:1,result_revision:1,review_status:'approved'},
    {card_id:'clip',member_id:'bob',version_id:'b1',version_number:1,result_revision:2,review_status:'pending'},
  ],
};

test('five stages keep the approved and under-review branches reachable when another person is producing',()=>{
  assert.deepEqual(FACTORY_STAGES.map(([key])=>key),['inbox','confirm','progress','review','ready']);
  assert.ok(inStage(data,{...card,status:'approved',media_status:'ready'},'inbox'));
  assert.ok(inStage(data,card,'progress'));
  assert.ok(inStage(data,card,'review'));
  assert.ok(inStage(data,card,'ready'));
  assert.equal(inStage(data,{...card,status:'review'},'progress'),false);
  const parallel={...data,production_versions:[...data.production_versions,{card_id:'clip',member_id:'alice',version_id:'a2',version_number:2,status:'draft'}]};
  assert.ok(inStage(parallel,{...card,status:'review'},'progress'));
  assert.deepEqual(productionParticipants(data,card).map(person=>[person.branch,person.id,person.versions.map(v=>v.version_id)]),[
    ['A','alice',['a1']],['B','bob',['b1']],
  ]);
});

test('review feedback follows the submitted version and keeps the author without leaking into another branch',()=>{
  const review={id:'review1',card_id:'clip',production_version_id:'a1',result_revision:1,member_id:'reviewer',verdict:'revise',note:'调整开头'};
  const snapshot={...data,production_reviews:[review]};
  const doc={currentVersion:'a2',versions:[{id:'a1',number:1,status:'accepted'},{id:'a2',number:2,status:'draft'}]};
  assert.deepEqual(pendingReviewFeedback(snapshot,card,doc),{id:'review1',name:'审片人',note:'调整开头'});
  assert.equal(pendingReviewFeedback({...snapshot,current_member:members[1]},card,doc),undefined);
  assert.equal(pendingReviewFeedback(snapshot,card,{...doc,versions:[doc.versions[0],{...doc.versions[1],reviewFeedback:{id:review.id}}]}),undefined);
});
