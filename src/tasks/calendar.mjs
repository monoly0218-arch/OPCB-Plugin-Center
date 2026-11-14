export const SAMPLE_TODAY='2026-11-14';
export function dateKey(year,month,day){return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
export function monthCells(month){
 const [year,m]=month.split('-').map(Number),count=new Date(Date.UTC(year,m,0)).getUTCDate();
 const offset=(new Date(Date.UTC(year,m-1,1)).getUTCDay()+6)%7;
 return Array.from({length:Math.ceil((offset+count)/7)*7},(_,i)=>{
  const d=new Date(Date.UTC(year,m-1,i-offset+1));
  return {date:dateKey(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()),day:d.getUTCDate(),current:d.getUTCMonth()===m-1};
 });
}
export function shiftMonth(month,delta){const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return dateKey(d.getUTCFullYear(),d.getUTCMonth(),1).slice(0,7);}
export function dateLabel(date){if(!date)return '待排期';const [y,m,d]=date.split('-').map(Number);return `${y}年${m}月${d}日`;}
