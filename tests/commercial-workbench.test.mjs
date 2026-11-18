import test from 'node:test';
import assert from 'node:assert/strict';
import {humanOwners,beijingDay,safeURL,demandDetail,postDetail,moneyReport,contentCalendar,horizonGoals,budgetPanel,trendDetail} from '../src/commercial/review-workbench.mjs';
const D={tasks:[],content:[{id:'C01',owner:'周洋',title:'测试标题',date:'2026-11-17',time:'12:30'}],budget:{unitCost:40,mediaBudget:100},metrics:{},progress:{},videos:[]};
test('human owner tokens exclude agents and split role combinations',()=>{
 assert.deepEqual(humanOwners('周洋＋Steven＋Moo'),['周洋','Steven','MOO']);
 assert.deepEqual(humanOwners('潘涛 Studio'),[]);
 assert.deepEqual(humanOwners('小跑／夏明升'),['夏明升']);
 assert.deepEqual(humanOwners('Moo（小莫）'),['MOO']);
});
test('Beijing day respects UTC midnight boundary and safe URLs reject executable or credential URLs',()=>{
 assert.equal(beijingDay(new Date('2026-11-17T16:01:00Z')),'2026-11-18');
 assert.equal(safeURL('javascript:alert(1)'), '');assert.equal(safeURL('https://user:pass@example.com'), '');
});
test('income and cost stay unknown until all bill categories are recorded; subsidy is not double counted',()=>{
 assert.ok(moneyReport(D).includes('尚未登记'));assert.ok(!moneyReport(D).includes('¥0'));
 const html=moneyReport({...D,metrics:{revenue:200,refunds:10,generationCost:40,subsidyCost:20,acquisitionCost:5,otherCost:5}});
 assert.ok(html.includes('¥140'));assert.ok(!html.includes('¥120'));
});
test('category/template switching retains independent media selection and never treats a missing file as delivered',()=>{
 const html=demandDetail(D,{growthDemand:'countdown'});assert.equal((html.match(/data-review-template=/g)||[]).length,4);assert.ok(html.includes('视频待交付'));
 assert.ok(!html.includes('<video'));
});
test('post workbench contains only that post, has editable copy, scoped comments and escapes user content',()=>{
 const html=postDetail(D,{}, {...D.content[0],title:'<img onerror=alert(1)>'});
 assert.ok(html.includes('data-growth-copy="C01"'));assert.ok(html.includes('data-review-comments="post:C01"'));assert.ok(!html.includes('答疑与领取'));assert.ok(!html.includes('C02'));
 assert.ok(!html.includes('<img onerror'));assert.ok(!html.includes('参考视频'));
});
test('calendar covers month boundaries once and includes both scheduled posts',()=>{
 const html=contentCalendar({...D,content:[...D.content,{...D.content[0],id:'C02',date:'2026-12-01'}]},{});
 assert.equal((html.match(/data-review-calendar-post="C01"/g)||[]).length,1);
 assert.equal((html.match(/data-review-calendar-post="C02"/g)||[]).length,1);
});
test('milestones do not award completion without acceptance and goal horizon changes budgets',()=>{
 assert.ok(!horizonGoals(D,{},()=>'',new Date('2026-11-17T12:00:00Z')).includes('aria-label="已完成"'));
 assert.ok(budgetPanel(D,{}).includes('¥4,100'));
 assert.ok(budgetPanel(D,{reviewHorizon:'month',free:2}).includes('¥3,300'));
});
test('trend never fabricates missing historical points',()=>{
 assert.ok(!trendDetail(D,'arrivals').html.includes('polyline'));
 const x=trendDetail({...D,metricHistory:[{date:'2026-11-16',metrics:{arrivals:5}},{date:'2026-11-17',metrics:{arrivals:10}}]},'arrivals');
 assert.ok(x.html.includes('polyline'));assert.ok(x.html.includes('2026-11-16'));
});
import {normalizeMetricHistory,reportRecord,REPORT_BEGIN,REPORT_END} from '../src/commercial/model.mjs';
import {normalizeCommercialPlan,emptyCommercialPlan} from '../src/commercial/legacy-model.mjs';
test('historical metrics and per-post attribution require evidence and keep zero distinct from missing',()=>{
 assert.throws(()=>normalizeMetricHistory([{date:'2026-11-17',metrics:{arrivals:1}}]));
 const history=normalizeMetricHistory([{date:'2026-11-17',metrics:{arrivals:0},evidence:'https://example.com/day'}]);assert.equal(history[0].metrics.arrivals,0);assert.equal(history[0].metrics.revenue,null);
 assert.throws(()=>normalizeMetricHistory([...history,...history]));
 const plan=normalizeCommercialPlan({...emptyCommercialPlan(),postMetrics:{C01:{asOf:'2026-11-17',evidence:'https://example.com/post',arrivals:0,revenue:10,cost:2}}});assert.equal(plan.postMetrics.C01.arrivals,0);assert.equal(plan.postMetrics.C01.paidUsers,null);
 const record=REPORT_BEGIN+'\n```json\n'+JSON.stringify({schema:1,metrics:{},history})+'\n```\n'+REPORT_END;assert.equal(reportRecord(record).history[0].metrics.arrivals,0);
});
import {phoneExperience,noteDraft,taskConversation,executionText} from '../src/commercial/review-workbench.mjs';
test('phone save choice maps to a real original screen and copy has no duplicate punctuation',()=>{
 const html=phoneExperience({...D,reviewAssets:{mobileURL:'https://example.com/mobile.html'}},{reviewPhone:'save'});
 assert.ok(html.includes('screen=save_choice'));assert.ok(!html.includes('实机操作'));assert.ok(html.includes('交互体验'));
 assert.ok(!noteDraft(D,{...D.content[0],id:'C03'}).copy.includes('？。'));
});
test('execution path is actionable with or without a registered Solo and never auto-sends',()=>{
 const t={id:'t1',title:'制作模板',owner:'MOO',statusLabel:'待交付',deliverable:'成片'};
 assert.ok(taskConversation(t).includes('打开任务来源'));assert.ok(taskConversation(t).includes('不会自动发送'));
 assert.ok(taskConversation({...t,executionChannel:'solo-id'}).includes('buzz://channel/solo-id'));
 assert.ok(executionText(t).includes('制作模板'));assert.ok(executionText(t).includes('成片'));
});
