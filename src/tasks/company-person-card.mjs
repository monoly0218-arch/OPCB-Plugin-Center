import {personWork,personToday} from './company-people.mjs';
export function createPersonCard(React){
 const h=React.createElement;
 function Photo({src,name,cover=false}){
  const [failed,setFailed]=React.useState(false);
  React.useEffect(()=>setFailed(false),[src]);
  return h('span',{className:cover?'cb-photo-cover':'cb-avatar','aria-hidden':true},src&&!failed?h('img',{src,alt:'',loading:'lazy',onError:()=>setFailed(true)}):h('span',{className:'cb-photo-fallback'},name.slice(0,1)));
 }
 return function PersonCard({group,identity,media,onOpen}){
  const work=personWork(group.tasks),today=personToday(group.tasks),presence=identity?.presence,name=identity?.displayName||group.name;
  const current=work.current.length?work.current.slice(0,2).map(t=>(t.blockReason||t.status==='blocked'?'受阻：':'')+t.title).join('；'):'当前事情未同步';
  const picture=identity?.picture;let src='';try{src=picture&&(typeof media==='function'?media(picture):picture)||'';}catch{}
  const known=today.percent!==null;
  return h('button',{className:'cb-person-card',type:'button','data-person':group.name,onClick:onOpen,'aria-label':`查看${name}的工作`},
   h(Photo,{src,name,cover:true}),
   h('span',{className:'cb-person-content'},
    h('span',{className:'cb-person-head'},h(Photo,{src,name}),h('span',{className:'cb-person-meta'},h('strong',null,name),h('span',{className:'cb-presence','data-known':String(!!presence),title:presence?`Buzz 本人设置 · ${new Date(presence.updatedAt*1000).toLocaleString('zh-CN')}`:'尚无可对应的有效本人状态'},presence?.text||'状态未同步'))),
    h('span',{className:'cb-person-current'},h('span',{className:'cb-person-label'},'当前事情'),h('span',{className:'cb-current-task',title:current},current)),
    h('span',{className:'cb-person-progress'},h('span',{className:'cb-person-progress-heading'},h('span',{className:'cb-person-label'},'今日工作进度'),h('strong',{className:'cb-person-value'},known?today.percent:'—',known?h('span',null,'%'):null)),
     h('span',{className:'cb-person-track',role:'progressbar','aria-label':`${name}今日工作进度`,'aria-valuemin':0,'aria-valuemax':100,'aria-valuenow':known?today.percent:undefined,'aria-valuetext':known?`今日已验收 ${today.done} / ${today.total} 项`:'今日进度未同步'},h('span',{style:{width:(today.percent??0)+'%'}})))));
 };
}
