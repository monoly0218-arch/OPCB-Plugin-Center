import {validDate} from './source.mjs';

// Calendar arithmetic stays in UTC; the selected key is a Beijing calendar date.
export function addDays(date, delta) {
 if (!validDate(date) || !Number.isInteger(delta)) throw new Error('无效日期');
 const d = new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+delta);
 return d.toISOString().slice(0,10);
}
export function dateStrip(date, count=12) {return Array.from({length:count},(_,i)=>addDays(date,i));}
export const weekday = date => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(date+'T12:00:00Z').getUTCDay()];
export const isChecked = task => task.status === 'done';
export const taskStatus = task => task.blockReason?'进行中 · 受阻':task.status==='planning'&&task.date?'已排期 · 待回执':STATUS_NAMES[task.status]||STATUS_NAMES.planning;
export const openTask = task => task.status !== 'done' && !isChecked(task);
export function inboxGroups(tasks, today, filter='all') {
 return [['unscheduled','未安排',tasks.filter(t=>!t.date&&openTask(t)&&!t.removed)]];
}
export const STATUS_NAMES={planning:'执行状态未登记',todo:'待开始',doing:'进行中',blocked:'受阻',review:'待验收',done:'已完成'};
// Explicit clocks in the dated target schedule are plan times, not execution or approval evidence.
export function taskTime(task) {const time=task.time||task.times?.[0]||'';return task.date && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '';}
export function taskOccurrences(tasks){return tasks.flatMap(task=>task.times?.length?task.times.map(time=>({...task,time,occurrenceTime:time})):[task]);}
export const sortByTime = tasks => [...tasks].sort((a,b)=>(taskTime(a)||'99:99').localeCompare(taskTime(b)||'99:99'));
export function scheduleDays(tasks, start, count=30) {
 return dateStrip(start,count).map(date=>({date,tasks:sortByTime(tasks.filter(t=>t.date===date))}));
}
