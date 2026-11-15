import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addDays,dateStrip,inboxGroups,taskTime,scheduleDays} from '../src/tasks/schedule.mjs';
import {createReferenceViews} from '../src/tasks/reference-views.mjs';
import {createUI} from '../design-system/v3/react.mjs';
import {createControlIcons} from '../design-system/v3/icons.mjs';
test('date strip crosses leap day, month, year and day offsets without timezone shifts',()=>{
 assert.deepEqual(dateStrip('2024-02-28',3),['2024-02-28','2024-02-29','2024-03-01']);
 assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(addDays('2027-01-01',-1),'2026-12-31');assert.throws(()=>addDays('2026-02-30',1));
});
test('Inbox and Upcoming share original objects, exclude completed overdue and never schedule unknown dates',()=>{
 const a={id:'a',date:null,status:'planning'},b={id:'b',date:'2026-11-14',status:'done'},c={id:'c',date:'2026-11-14',status:'review'},d={id:'d',date:'2026-11-15',status:'todo'};
 const groups=inboxGroups([a,b,c,d],'2026-11-15');assert.deepEqual(groups.map(g=>g[2]),[[c],[a],[d]]);assert.deepEqual(inboxGroups([a,c],'2026-11-15','unscheduled')[0][2],[a]);
 const days=scheduleDays([a,b,c,d],'2026-11-15',30);assert.equal(days.length,30);assert.deepEqual(days[0].tasks,[d]);assert.equal(days.flatMap(d=>d.tasks).length,1);assert.strictEqual(days[0].tasks[0],d);
});
test('suggested slots, missing dates and malformed times never enter hourly positions',()=>{
 assert.equal(taskTime({date:'2026-11-15',slot:'10:00'}),'');assert.equal(taskTime({date:null,time:'10:00'}),'');
 for(const time of ['24:00','09:60','7:30','soon'])assert.equal(taskTime({date:'2026-11-15',time}),'');assert.equal(taskTime({date:'2026-11-15',time:'07:30'}),'07:30');
});
test('production Today has English navigation names, real date/clock and explicit Chinese empty state',()=>{
 const {Today,Inbox}=createReferenceViews(React,createUI(React),createControlIcons(React));
 const props={tasks:[{id:'pending',title:'待排期工作',status:'planning',date:null}],today:'2026-11-15',day:'2026-11-15',clock:'01:23',onDay(){},onOpen(){},onInbox(){}};
 const html=renderToStaticMarkup(React.createElement(Today,props));assert.match(html,/>Today</);assert.match(html,/01:23/);assert.match(html,/2026年11月15日/);assert.match(html,/当天暂无已登记安排/);assert.doesNotMatch(html,/tr-task-title/);
 const inbox=renderToStaticMarkup(React.createElement(Inbox,{...props,onClose(){}}));assert.match(inbox,/>Inbox</);assert.match(inbox,/待排期工作/);assert.match(inbox,/执行状态未登记/);
});
