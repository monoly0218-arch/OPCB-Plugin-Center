import {validDate} from './source.mjs';

// Calendar arithmetic stays in UTC; the selected key is a Beijing calendar date.
export function addDays(date, delta) {
 if (!validDate(date) || !Number.isInteger(delta)) throw new Error('无效日期');
 const d = new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+delta);
 return d.toISOString().slice(0,10);
}
export function dateStrip(date, count=12) {return Array.from({length:count},(_,i)=>addDays(date,i));}
export const weekday = date => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(date+'T12:00:00Z').getUTCDay()];
export const openTask = task => task.status !== 'done';
export function inboxGroups(tasks, today, filter='all') {
 const groups=[['overdue','逾期',tasks.filter(t=>t.date&&t.date<today&&openTask(t))],['unscheduled','待排期',tasks.filter(t=>!t.date&&openTask(t))],['today','今天',tasks.filter(t=>t.date===today&&openTask(t))]];
 return groups.filter(([id])=>filter==='all'||filter===id);
}
export const STATUS_NAMES={planning:'执行状态未登记',todo:'待开始',doing:'进行中',blocked:'受阻',review:'待验收',done:'已验收'};
// Only confirmed clock values may occupy an hourly slot. Never parse a suggested slot.
export function taskTime(task) {return task.date && /^([01]\d|2[0-3]):[0-5]\d$/.test(task.time||'') ? task.time : '';}
export function scheduleDays(tasks, start, count=30) {
 return dateStrip(start,count).map(date=>({date,tasks:tasks.filter(t=>t.date===date)}));
}
