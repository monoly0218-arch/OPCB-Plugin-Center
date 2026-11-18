import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMUNITY,roleBinding} from '../src/media-workspace/role-binding.mjs';
const keo='823091f2c74e48e8eda43eb4c3830af13ec2ab99afa8abf3f2635bddecf2316b';
const connection=(viewer=keo)=>({status:'ready',cached:false,session:{viewer,relayAuthor:COMMUNITY}});
test('KEo resolves only to the existing keo assets member',()=>{
 assert.deepEqual(roleBinding(connection(),'assets'),{owner:keo,community:COMMUNITY,name:'KEo',member:'keo'});
 assert.throws(()=>roleBinding(connection(),'factory'),/尚未分配/);
 assert.equal(roleBinding(connection('96ddfaedaca50c0248576563df8dff9f08ed8abd5ddead823b44635b181fb24d'),'assets').member,'pantao');
});
test('KEo authorization requires the current personal identity in the authorized community',()=>{
 assert.throws(()=>roleBinding({...connection(),cached:true},'assets'),/当前 Buzz/);
 assert.throws(()=>roleBinding({...connection(),status:'disconnected'},'assets'),/当前 Buzz/);
 assert.throws(()=>roleBinding({status:'ready',session:{viewer:keo,relayAuthor:'another-community'}},'assets'),/跑圈集团/);
 const agent=connection('a05fac75bcae4be2542d7b8b8cfe5e31c4ee9513ac3a730551ed5837eb891e44');
 agent.session.name='KEo';
 assert.throws(()=>roleBinding(agent,'assets'),/尚未分配/);
});
