import {createUI} from '../../design-system/v3/react.mjs';
import {createControlIcons} from '../../design-system/v3/icons.mjs';
import {CATEGORIES,entryLinks,createDirectoryStore} from './directory.mjs';
import {pluginIcon,versionLabel} from './visuals.mjs';
export const VERSION='0.2.2';
export const inject=['react','pages','host'];

export function createPage(React,store,installer,assets,css) {
 const h=React.createElement,{Workspace,Header,Tool}=createUI(React),Control=createControlIcons(React);
 const installationStatus=id=>{
  try { const status=installer?.getInstallationStatus?.(id);return ['installed','absent'].includes(status)?status:'unavailable'; }
  catch {return 'unavailable';}
 };
 return function PluginCenter() {
  const directory=React.useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot);
  const [query,setQuery]=React.useState(''),[category,setCategory]=React.useState('全部'),[filter,setFilter]=React.useState('all'),[history,setHistory]=React.useState(false),[statuses,setStatuses]=React.useState({}),[selected,setSelected]=React.useState(null),[navOpen,setNavOpen]=React.useState(false);
  const detailHeading=React.useRef(null),cardRefs=React.useRef(new Map());
  React.useEffect(()=>{if(store.snapshot().status==='idle')void store.refresh();},[]);
  React.useEffect(()=>{
   let live=true;const off=[];
   const update=(id,status)=>{if(live)setStatuses(previous=>({...previous,[id]:['installed','absent'].includes(status)?status:'unavailable'}));};
   for(const id of new Set(directory.entries.map(e=>e.id))){
    if(typeof installer?.subscribeInstallationStatus==='function'){
     try {off.push(installer.subscribeInstallationStatus(id,status=>update(id,status)));}catch{update(id,'unavailable');}
    }
    update(id,installationStatus(id));
   }
   return()=>{live=false;off.forEach(fn=>{if(typeof fn==='function')fn();});};
  },[directory.entries]);
  React.useEffect(()=>{if(selected)detailHeading.current?.focus();},[selected]);
  const close=()=>{const key=selected;setSelected(null);requestAnimationFrame(()=>cardRefs.current.get(key)?.focus());};
  const entry=selected?directory.entries.find(e=>`${e.id}@${e.version}`===selected):null;
  const status=e=>statuses[e.id]||'unavailable';
  const statusText=e=>status(e)==='installed'?'已安装':status(e)==='absent'?'未安装':'状态待核';
  const entries=directory.entries.filter(e=>(history||!e.legacy)&&(category==='全部'||category===e.category)&&(filter==='all'||(filter==='installed'&&status(e)==='installed')||(filter==='absent'&&status(e)==='absent'))&&`${e.name} ${e.id} ${e.version} ${e.summary} ${e.requirements}`.toLowerCase().includes(query.trim().toLowerCase()));
  const image=e=>{const src=pluginIcon(e,assets);return h('img',{className:'pc-icon',src,'data-vector':src?.startsWith('data:image/svg+xml')||undefined,alt:'',width:64,height:64,draggable:false});};
  const review=e=>h('button',{type:'button',className:'pc-action',disabled:!!directory.busy||directory.status!=='ready',onClick:()=>store.review(e),'aria-label':`${status(e)==='installed'?'查看更新':'审阅安装'}：${e.name} ${versionLabel(e.version)}`},directory.busy===`${e.id}@${e.version}`?'审核中':status(e)==='installed'?'查看更新':'安装');
  const link=(label,url)=>h('a',{href:url,target:'_blank',rel:'noopener noreferrer',className:'pc-link'},label);
  const nav=h(React.Fragment,null,...CATEGORIES.map(name=>h('button',{type:'button',key:name,'aria-current':category===name?'page':undefined,onClick:()=>{setCategory(name);setSelected(null);setNavOpen(false);}},name)),h('div',{className:'pc-nav-bottom'},h('label',{className:'pc-history'},h('input',{type:'checkbox',checked:history,onChange:e=>setHistory(e.target.checked)}),'历史版本'),h('span',{className:'pc-center-version'},versionLabel(VERSION))));
  const global=h(React.Fragment,null,h(Tool,{label:'切换分类',className:'v2-mobile-nav pc-menu','aria-expanded':navOpen,onClick:()=>setNavOpen(v=>!v)},h(Control,{name:'notes'})),h('div',{className:'v2-search pc-search'},h('input',{type:'search','aria-label':'搜索插件',placeholder:'搜索插件',value:query,onChange:e=>{setQuery(e.target.value);setSelected(null);}})),h('select',{'aria-label':'安装状态',className:'pc-filter',value:filter,onChange:e=>{setFilter(e.target.value);setSelected(null);}},h('option',{value:'all'},'全部'),h('option',{value:'installed'},'已安装'),h('option',{value:'absent'},'未安装')));
  return h(React.Fragment,null,h('style',null,css),h(Workspace,{className:'pc-workspace',theme:'host',global,nav,navOpen,'data-plugin-center':true,onKeyDown:e=>{if(e.key==='Escape'){if(selected){e.preventDefault();close();}else setNavOpen(false);}}},
   h(Header,{title:entry?'插件详情':'插件中心',tools:h(Tool,{label:'刷新目录',disabled:directory.status==='loading'||!!directory.busy,onClick:()=>store.refresh()},h(Control,{name:'cloud'}),directory.status==='loading'?'刷新中':'刷新')}),
   directory.error?h('p',{role:'alert',className:'pc-notice'},directory.error):null,
   directory.notice?h('p',{role:'status',className:'pc-notice'},directory.notice):null,
   entry?h('section',{className:'pc-detail'},h('button',{type:'button',className:'pc-back',onClick:close},'返回'),h('div',{className:'pc-detail-identity'},image(entry),h('div',null,h('h2',{ref:detailHeading,tabIndex:-1},entry.name),h('p',{className:'pc-version'},versionLabel(entry.version)))),
    h('div',{className:'pc-detail-status'},h('span',null,statusText(entry)),entry.legacy?h('span',null,'历史版本'):null),
    h('p',{className:'pc-description'},entry.summary),h('h3',null,'使用条件'),h('p',{className:'pc-description'},entry.requirements),
    h('div',{className:'pc-detail-actions'},review(entry),link('源码',entryLinks(entry,directory.commit).source),link('下载',entryLinks(entry,directory.commit).download)))
   :h('div',{className:'pc-grid','aria-busy':directory.status==='loading'},...entries.map(e=>h('article',{key:`${e.id}@${e.version}`,className:'pc-card','data-entry':e.id,'data-version':e.version},
    h('button',{type:'button',className:'pc-card-identity',ref:node=>{const key=`${e.id}@${e.version}`;if(node)cardRefs.current.set(key,node);else cardRefs.current.delete(key);},onClick:()=>setSelected(`${e.id}@${e.version}`),'aria-label':`查看${e.name}详情`},image(e),h('h2',null,e.name)),
    h('div',{className:'pc-card-meta'},h('span',{className:'pc-version'},versionLabel(e.version)),e.legacy?h('span',{className:'pc-legacy'},'历史'):null),
    h('div',{className:'pc-card-footer'},h('span',{className:'pc-status','data-status':status(e)},statusText(e)),review(e))))),
   !entry&&!entries.length?h('p',{role:'status',className:'pc-empty'},directory.status==='loading'?'加载中':directory.entries.length?'没有匹配的插件':'尚未载入目录'):null));
 };
}
export function apply(ctx){
 const installer=ctx.reflect.get('pluginInstaller');
 const store=createDirectoryStore(options=>ctx.host.request(options),installer);
 ctx.effect(()=>()=>store.dispose());
 const component=createPage(ctx.react,store,installer,OPCB_PLUGIN_CENTER_ASSETS,OPCB_PLUGIN_CENTER_CSS);
 ctx.pages.register({id:'catalog',title:'插件中心',icon:OPCB_PLUGIN_CENTER_ASSETS.puzzle,primary:true,placement:'dock',layout:'workspace',component});
}
