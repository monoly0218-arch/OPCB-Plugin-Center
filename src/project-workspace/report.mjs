// Public PagesReader reuses the active report component and its original owner-
// scoped services. Never copy its private collection or impersonate its plugin ID.
const empty=[];
const noSubscribe=()=>()=>{};
export function activeReport(entries){return entries.find(p=>p.pluginId==='opcb.results-report'&&p.id==='report'&&typeof p.component==='function')||null;}
export function createReportPane(R,pages){
 const h=R.createElement;
 class Boundary extends R.Component{state={error:false};static getDerivedStateFromError(){return{error:true};}render(){return this.state.error?h('p',{role:'alert',style:{padding:24}},'原报告暂时未能展开，请返回阶段与任务，或打开原报告入口核对'):this.props.children;}}
 return function ReportPane(){
  const readable=typeof pages.snapshot==='function'&&typeof pages.subscribe==='function';
  const entries=R.useSyncExternalStore(readable?pages.subscribe:noSubscribe,readable?pages.snapshot:()=>empty,()=>empty),report=activeReport(entries);
  if(!report)return h('div',{className:'pw-empty'},h('h2',null,'商业化计划与报告尚未启用'),h('p',null,'启用现有「OPCB 平台商业化计划与报告」插件后，可在本频道直接展开原有内容'));
  return h(Boundary,{key:report.key+':'+report.revision},h(report.component));
 };
}
