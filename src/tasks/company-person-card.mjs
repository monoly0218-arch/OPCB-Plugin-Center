import {personWork} from './company-people.mjs';
export function createPersonCard(React){
 const h=React.createElement;
 const symbol=(office=false)=>h('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:office?'M4 21V4h12v17 M16 9h4v12 M2 21h20 M8 8h4 M8 12h4 M8 16h4':'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M5 21v-3a7 7 0 0 1 14 0v3'}));
 return function PersonCard({group,identity,onOpen}){
  const work=personWork(group.tasks),presence=identity?.presence,projects=[...new Set(group.tasks.map(t=>t.businessProject))];
  const current=work.current.length?work.current.slice(0,2).map(t=>(t.blockReason?'受阻：':'')+t.title).join('；'):work.unknown?'当前任务待回执':work.total?'暂无进行中任务':'暂无已登记任务';
  return h('button',{className:'cb-person-card',type:'button','data-person':group.name,onClick:onOpen},
   h('span',{className:'cb-person-head'},h('span',{className:'cb-avatar','aria-hidden':true},group.name.slice(0,1)),h('span',null,h('strong',null,group.name),h('span',{className:'cb-person-projects'},projects.join('／'))),identity?.isAgent?h('span',{className:'cb-person-type'},'Agent'):null),
   h('span',{className:'cb-presence',title:presence?'Buzz 本人设置的状态':'尚无可对应的有效本人状态','data-known':String(!!presence)},symbol(!!presence&&/在公司|办公室/.test(presence.text)),h('span',null,presence?.text||(identity?.isAgent?'Agent 状态未同步':'本人状态未同步')),presence?h('time',{dateTime:new Date(presence.updatedAt*1000).toISOString()},new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(presence.updatedAt*1000)):null),
   h('span',{className:'cb-person-label'},'当前任务'),h('span',{className:'cb-current-task'},current),
   h('span',{className:'cb-person-progress'},h('span',null,'任务完成'),h('strong',null,`${work.done} / ${work.total}`)),
   h('progress',{max:Math.max(1,work.total),value:work.done,'aria-label':`${group.name} 已完成 ${work.done} / ${work.total} 项任务`}),
   h('span',{className:'cb-person-footer'},h('span',null,`${work.review} 待验收`),h('span',null,`${work.blocked} 受阻`),work.unknown?h('span',null,`${work.unknown} 未登记`):null));
 };
}
