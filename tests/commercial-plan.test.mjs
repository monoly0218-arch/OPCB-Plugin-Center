import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyCommercialPlan,normalizeCommercialPlan,shiftCommercialDate,commercialScenario,apply} from '../plugins/opcb.results-report/2026-11-14-commercial/plugin.js';
test('launch day is separate from the four commercial days; rejects calendar overflow',()=>{
 assert.equal(shiftCommercialDate('2026-11-15',1),'2026-11-16');assert.equal(shiftCommercialDate('2026-11-15',4),'2026-11-19');assert.equal(shiftCommercialDate('2026-11-17',4),'2026-11-21');
 for(const date of ['2026-02-30','bad','2026-13-01'])assert.throws(()=>shiftCommercialDate(date,0));
});
test('subsidy and paid goal are different cohorts; markup is not gross margin',()=>{
 const a=commercialScenario(emptyCommercialPlan().budget);assert.equal(a.subsidy,800);assert.equal(a.total,900);assert.equal(a.expectedPaid,4);assert.equal(a.neededTrials,100);assert.equal(a.neededSubsidy,4000);assert.equal(a.markupPrice,46);assert(Math.abs(a.markupMargin-.1304347826)<1e-9);
 const b=commercialScenario({...emptyCommercialPlan().budget,freeTimes:2,mediaBudget:200});assert.equal(b.subsidy,1600);assert.equal(b.total,1800);
 for(const patch of [{unitCost:0},{freeTimes:3},{trialUsers:1.5},{paidConversion:0},{paidConversion:101},{unitCost:Infinity}])assert.throws(()=>commercialScenario({...emptyCommercialPlan().budget,...patch}));
});
test('import preserves unknown versus zero, checks unique tasks, safe evidence and lengths',()=>{
 let p=emptyCommercialPlan();p.metrics.paidUsers=0;const result=normalizeCommercialPlan(p);assert.equal(result.metrics.paidUsers,0);assert.equal(result.metrics.revenue,null);
 const t={id:'a',title:'one',owner:'person',fromDay:-1,toDay:1,status:'进行中',evidence:'buzz://message?channel=test'};
 p.tasks=[t];assert.equal(normalizeCommercialPlan(p).tasks.length,1);p.tasks=[t,t];assert.throws(()=>normalizeCommercialPlan(p));
 p.tasks=[{...t,evidence:'javascript:alert(1)'}];assert.throws(()=>normalizeCommercialPlan(p));p.tasks=[{...t,fromDay:2,toDay:1}];assert.throws(()=>normalizeCommercialPlan(p));
});
function runtime(){let hooks=[],cursor=0,effects=[],page,fail=false;const listeners=new Set();const saved=new Map([['library',{schema:1,templates:[{key:'private',name:'Private',category:'other',status:'本人通过',source:'',video:'',poster:'',note:'',description:''}],screens:[]}]]);const opens=[];
 const react={createElement(type,props,...children){return typeof type==='function'?type(props||{}):{type,props:props||{},children}},useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v]},useRef(value){const i=cursor++;return hooks[i]??={current:value}},useEffect(fn,deps){const i=cursor++;if(!hooks[i]||deps.some((v,n)=>v!==hooks[i][n])){hooks[i]=deps;effects.push(fn)}},useSyncExternalStore(_,get){return get()}};
 apply({react,pages:{register(p){page=p}},relay:{subscribe(){return()=>{}},snapshot:()=>({status:'ready',scope:'one',generation:1,session:{viewer:'person'}})},artifactStorage:{open(options){opens.push(options);return{preferences:{async get(key){return saved.get(key)},async update(key,fn){if(fail)throw Error('disk full');saved.set(key,fn(saved.get(key)));for(const f of listeners)f()}},subscribe(f){listeners.add(f);return()=>listeners.delete(f)},close(){}}}}});
 return{saved,opens,set fail(v){fail=v},async render(){cursor=0;const tree=page.component();const pending=effects;effects=[];for(const e of pending)e();await new Promise(r=>setImmediate(r));return tree;}};}
function find(n,p){if(Array.isArray(n)){for(const a of n){const x=find(a,p);if(x)return x;}return;}if(!n||typeof n!=='object')return;if(p(n))return n;return find(n.children,p);}
test('plan import uses its own preference and preserves existing private library; errors do not claim saved',async()=>{
 const r=runtime();await r.render();let tree=await r.render();const libraryBefore=JSON.stringify(r.saved.get('library'));let plan=emptyCommercialPlan();plan.intro='approved private draft';
 const input=find(tree,n=>n.props['aria-label']==='导入商业化计划');assert(input);await input.props.onChange({target:{files:[{size:100,text:async()=>JSON.stringify(plan)}],value:'x'}});tree=await r.render();
 assert.equal(r.saved.get('commercial-plan').intro,'approved private draft');assert.equal(JSON.stringify(r.saved.get('library')),libraryBefore);assert(r.opens.every(x=>x.name==='brand-library'&&x.type==='opcb.results-report.library'&&x.version===1));
 r.fail=true;plan.intro='must not persist';await find(tree,n=>n.props['aria-label']==='导入商业化计划').props.onChange({target:{files:[{size:100,text:async()=>JSON.stringify(plan)}],value:'x'}});tree=await r.render();assert.equal(r.saved.get('commercial-plan').intro,'approved private draft');assert(JSON.stringify(tree).includes('未保存：disk full'));
});
