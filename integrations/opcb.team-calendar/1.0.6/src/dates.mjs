export const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function addDays(day,count){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
export function monday(day){const d=new Date(day+'T12:00:00Z');return addDays(day,-((d.getUTCDay()+6)%7));}
export function shiftMonth(day,count){const d=new Date(day+'T12:00:00Z'),n=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+count);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(n,last));return d.toISOString().slice(0,10);}
export const weekday=day=>['周日','周一','周二','周三','周四','周五','周六'][new Date(day+'T12:00:00Z').getUTCDay()];
export const shortDate=day=>`${Number(day.slice(5,7))}月${Number(day.slice(8))}日`;
export const statuses={todo:'待开始',doing:'进行中',review:'待审核',done:'已完成',blocked:'阻塞'};
