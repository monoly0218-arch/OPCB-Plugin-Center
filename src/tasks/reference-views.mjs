import {addDays,dateStrip,weekday,inboxGroups,STATUS_NAMES,taskTime,scheduleDays} from './schedule.mjs';
import {dateLabel,monthCells,shiftMonth} from './calendar.mjs';

export function createReferenceViews(React,UI,Control) {
 const h=React.createElement;
 const icon=name=>h(Control,{name,size:18});
 const tool=(label,run,children,pressed)=>h(UI.Tool,{label,onClick:run,'aria-pressed':pressed},children||label);
 const monthName=date=>new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
 const rangeTitle=(start,end)=>`${monthName(start)} ${Number(start.slice(8))} – ${start.slice(0,7)===end.slice(0,7)?'':monthName(end)+' '}${Number(end.slice(8))}`;
 const shortDate=date=>date?`${Number(date.slice(5,7))}月${Number(date.slice(8))}日`:'待排期';
 function Row({task,onOpen,compact=false}) {
  const time=taskTime(task),tag=task.project||task.team;
  const tone=['blue','green','purple'][[...(tag||'')].reduce((sum,c)=>sum+c.codePointAt(0),0)%3];
  return h('article',{className:'tr-task','data-status':task.status,'data-task-id':task.id},
   h('button',{className:'tr-task-open',type:'button',onClick:e=>onOpen(task.id,e),'aria-label':`${task.title}，${STATUS_NAMES[task.status]||STATUS_NAMES.planning}，查看详情`},
    h('span',{className:'tr-check','data-status':task.status,'aria-hidden':true},task.status==='done'?'✓':''),
    h('span',{className:'tr-task-copy'},h('span',{className:'tr-task-title'},task.title),
     h('span',{className:'tr-task-meta'},!compact&&h('span',null,shortDate(task.date)),time?h('time',{className:'tr-time',dateTime:task.date+'T'+time},time):task.date&&h('span',null,'未登记时间'),tag&&h(UI.Chip,{tone},tag),
      h('span',{className:'tr-task-status'},STATUS_NAMES[task.status]||STATUS_NAMES.planning)))));
 }
 function Inbox({tasks,today,onOpen,onClose}) {
  const [filter,setFilter]=React.useState('all');
  return h('section',{className:'tr-inbox','aria-label':'Inbox'},
   h('header',{className:'tr-inbox-head'},h('h2',null,'Inbox'),h('div',{className:'v2-tools'},h('select',{'aria-label':'Inbox filter',value:filter,onChange:e=>setFilter(e.target.value)},...[['all','All'],['overdue','Overdue'],['unscheduled','Unscheduled'],['today','Today']].map(([value,label])=>h('option',{value,key:value},label))),tool('Hide Inbox',onClose,icon('events')))),
   ...inboxGroups(tasks,today,filter).map(([id,label,items])=>h('section',{key:id,className:'tr-inbox-group'},h('h3',null,label),...items.map(task=>h(Row,{key:task.id,task,onOpen})),!items.length&&h('p',{className:'tr-empty'},'暂无任务'))));
 }
 function DayTools({today,day,onDay,onInbox,inboxVisible}) {
  return h('div',{className:'v2-tools tr-day-tools'},tool('Today',()=>onDay(today)),tool('Previous day',()=>onDay(addDays(day,-1)),h('span',{'aria-hidden':true},'‹')),tool('Next day',()=>onDay(addDays(day,1)),h('span',{'aria-hidden':true},'›')),tool('Inbox',onInbox,icon('events'),inboxVisible));
 }
 function Today({tasks,today,day,onDay,onOpen,onInbox,inboxVisible,clock}) {
  const items=tasks.filter(t=>t.date===day),doing=items.filter(t=>t.status==='doing').length,review=items.filter(t=>t.status==='review').length;
  return h('section',{className:'tr-today','aria-label':'Today'},
   h('header',{className:'tr-header'},h('div',null,h('h1',null,'Today'),h('p',{className:'tr-subtitle'},h('time',{dateTime:day},dateLabel(day)),h('span',null,' · '),h('time',null,clock),' 北京时间')),h(DayTools,{today,day,onDay,onInbox,inboxVisible})),
   h('div',{className:'tr-date-strip','aria-label':'日期选择'},...dateStrip(day<today||day>addDays(today,11)?day:today).map(date=>h('button',{key:date,type:'button','aria-label':dateLabel(date),'aria-pressed':date===day,onClick:()=>onDay(date)},h('strong',{className:'v3-num'},Number(date.slice(8))),h('span',null,weekday(date))))),
   h('div',{className:'tr-summary'},h('strong',null,day===today?'今天有':'当天有'),h(UI.Chip,{tone:'red'},`${items.length} 项安排`),h(UI.Chip,{tone:'gold'},`${doing} 项进行中`),h(UI.Chip,{tone:'purple'},`${review} 项待验收`)),
   h('div',{className:'tr-day-list'},...items.map(task=>h(Row,{key:task.id,task,onOpen})),!items.length&&h('div',{className:'tr-day-empty'},h('h2',null,'当天暂无已登记安排'),h('p',null,'未确认日期的工作在 Inbox「待排期」中。选择任务可查看原文并登记确认日期。'))));
 }
 function Upcoming({tasks,today,day,onDay,onOpen,onInbox,inboxVisible,mode,onMode}) {
  const days=scheduleDays(tasks,day,mode==='board'?7:30),groups=days.filter(d=>d.tasks.length);
  const header=h('header',{className:'tr-header'},h('div',null,h('h1',null,'Upcoming'),h('p',{className:'tr-subtitle'},mode==='board'?`${shortDate(day)} — ${shortDate(addDays(day,6))}`:(day===today?'未来 30 天':`${shortDate(day)}起的30天`))),
   h('div',{className:'tr-upcoming-tools'},h('div',{className:'tr-segment','aria-label':'Upcoming view'},tool('Board',()=>onMode('board'),icon('events'),mode==='board'),tool('List',()=>onMode('list'),icon('notes'),mode==='list')),h(DayTools,{today,day,onDay,onInbox,inboxVisible})));
  const dateHeader=date=>h('div',{className:'tr-date-heading','data-today':date===today},h('h2',null,date===today?'Today':weekday(date)),h('time',{dateTime:date},shortDate(date)));
  return h('section',{className:'tr-upcoming','data-mode':mode,'aria-label':'Upcoming'},header,mode==='board'?
   h('div',{className:'tr-date-board','aria-label':'按日期看板'},...days.map(({date,tasks:items})=>h('section',{className:'tr-date-column',key:date},dateHeader(date),...items.map(task=>h(Row,{key:task.id,task,onOpen,compact:true})),!items.length&&h('p',{className:'tr-empty'},'暂无安排')))):
   h('div',{className:'tr-upcoming-list'},...groups.map(({date,tasks:items})=>h('section',{className:'tr-date-group',key:date},dateHeader(date),h('div',null,...items.map(task=>h(Row,{key:task.id,task,onOpen,compact:true}))))),!groups.length&&h('p',{className:'tr-empty'},'未来 30 天暂无已登记安排，未确认日期的任务保留在 Inbox。')));
 }
 function Calendar({tasks,today,day,onDay,onOpen,onInbox,inboxVisible,month,onMonth}) {
  const [range,setRange]=React.useState('3'),scroll=React.useRef(null),days=dateStrip(day,Number(range)||3);
  React.useEffect(()=>{if(range!=='month'&&scroll.current){const rows=scroll.current.querySelectorAll('.tr-hour');const head=scroll.current.querySelector('.tr-timeline-head');const earliest=Math.min(8,...tasks.filter(t=>days.includes(t.date)&&taskTime(t)).map(t=>Number(taskTime(t).slice(0,2))));if(rows[earliest])scroll.current.scrollTop=rows[earliest].offsetTop-scroll.current.firstElementChild.offsetTop-(head?.offsetHeight||0);}},[range,day]);
  const dates=range==='month'?monthCells(month).map(c=>c.date):days;
  // Times are display-only here; persistence remains owned by the existing execution editor.
  const loose=tasks.filter(t=>dates.includes(t.date)&&!taskTime(t));
  return h('section',{className:'tr-calendar','aria-label':'Calendar'},h('header',{className:'tr-header'},h('div',null,h('h1',null,range==='month'?`${Number(month.slice(5))}月`:rangeTitle(day,addDays(day,Number(range)-1))),h('p',{className:'tr-subtitle'},range==='month'?month.slice(0,4):day.slice(0,4))),
   h('div',{className:'tr-upcoming-tools'},h('select',{'aria-label':'Calendar range',value:range,onChange:e=>setRange(e.target.value)},h('option',{value:'3'},'3 days'),h('option',{value:'7'},'Week'),h('option',{value:'month'},'Month')),tool('Today',()=>{onDay(today);onMonth(today.slice(0,7));}),tool('Previous period',()=>range==='month'?onMonth(shiftMonth(month,-1)):onDay(addDays(day,-Number(range))),'‹'),tool('Next period',()=>range==='month'?onMonth(shiftMonth(month,1)):onDay(addDays(day,Number(range))),'›'),tool('Inbox',onInbox,icon('events'),inboxVisible))),
   range==='month'?h('div',{className:'tr-month','aria-label':'整月日历'},...['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>h('div',{className:'tr-weekday',key:d},d)),...monthCells(month).map(cell=>h('section',{key:cell.date,'data-current':cell.current,'data-today':cell.date===today},h('button',{type:'button','aria-label':dateLabel(cell.date),'aria-pressed':cell.date===day,onClick:()=>onDay(cell.date)},cell.day),...tasks.filter(t=>t.date===cell.date).map(task=>h('button',{type:'button',key:task.id,className:'tr-month-item','data-status':task.status,onClick:e=>onOpen(task.id,e)},task.title)))))
   :h('div',{className:'tr-time-scroll',ref:scroll},h('div',{className:'tr-time-grid',style:{'--tr-days':Number(range)}},h('div',{className:'tr-timeline-head'},h('span',null,'时间'),...days.map(date=>h('div',{key:date,'data-today':date===today},date===today?'Today':weekday(date),h('small',null,shortDate(date))))),
    loose.length>0&&h('div',{className:'tr-untimed'},h('span',null,'时间未登记'),...days.map(date=>h('div',{key:date},...loose.filter(t=>t.date===date).map(task=>h(Row,{key:task.id,task,onOpen,compact:true}))))),
    ...Array.from({length:24},(_,hour)=>h('div',{className:'tr-hour',key:hour},h('time',null,String(hour).padStart(2,'0')+':00'),...days.map(date=>h('div',{className:'tr-hour-cell',key:date},...tasks.filter(t=>t.date===date&&taskTime(t)&&Number(taskTime(t).slice(0,2))===hour).map(task=>h(Row,{key:task.id,task,onOpen,compact:true})))))))));
 }
 return {Today,Upcoming,Calendar,Inbox,Row};
}
