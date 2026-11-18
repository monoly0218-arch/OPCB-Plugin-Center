import {createUI} from '../../design-system/v3/react.mjs';
import {createControlIcons} from '../../design-system/v3/icons.mjs';
import {CATEGORIES,categoryLabel,entryLinks,createDirectoryStore} from './directory.mjs';
import {pluginIcon,versionLabel} from './visuals.mjs';
import {CONTRIBUTIONS,useContributorProfiles} from './contributors.mjs';
import {createContributorUI} from './contributor-ui.mjs';
import {registerInstallCards} from './install-card.mjs';
import {installationStatus,releaseState,releaseAction,currentEntries} from './release-state.mjs';
import {installSource} from './directory.mjs';
import {createNativeReview} from './native-review.mjs';
export const VERSION='0.3.6';
export const inject=['react','pages','host','relay','conversation','agents','navigation'];

export function createPage(React,store,installer,assets,css,relay) {
 const h=React.createElement,{Workspace,Header,Tool}=createUI(React),Control=createControlIcons(React);
 const Contributors=createContributorUI(React);
 return function PluginCenter() {
  const directory=React.useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot);
  const catalog=React.useMemo(()=>[...directory.entries,...(directory.installedEntrypoints||[])],[directory.entries,directory.installedEntrypoints]);
  const [query,setQuery]=React.useState(''),[category,setCategory]=React.useState('全部'),[history,setHistory]=React.useState(false),[statuses,setStatuses]=React.useState({}),[,setInstallationRevision]=React.useState(0),[selected,setSelected]=React.useState(null),[navOpen,setNavOpen]=React.useState(false);
  const contributions=directory.contributions||CONTRIBUTIONS,identity=useContributorProfiles(React,relay,contributions);
  const contributors=e=>h(Contributors,{key:`${e.id}@${e.version}`,entry:e,data:contributions,...identity,assets,error:directory.creditError});
  const detailHeading=React.useRef(null),cardRefs=React.useRef(new Map());
  React.useEffect(()=>{if(store.snapshot().status==='idle')void store.refresh();},[]);
  React.useEffect(()=>{
   let live=true;const off=[];
   const update=(id,status)=>{if(live){setStatuses(previous=>({...previous,[id]:['installed','absent'].includes(status)?status:'unavailable'}));setInstallationRevision(value=>value+1);void store.refreshInstalled?.();}};
   for(const id of new Set(catalog.map(e=>e.id))){
    if(typeof installer?.subscribeInstallationStatus==='function'){
     try {off.push(installer.subscribeInstallationStatus(id,status=>update(id,status)));}catch{update(id,'unavailable');}
    }
    update(id,installationStatus(installer,id));
   }
   return()=>{live=false;off.forEach(fn=>{if(typeof fn==='function')fn();});};
  },[catalog]);
  React.useEffect(()=>{if(selected)detailHeading.current?.focus();},[selected]);
  const close=()=>{const key=selected;setSelected(null);requestAnimationFrame(()=>cardRefs.current.get(key)?.focus());};
  const status=e=>statuses[e.id]||installationStatus(installer,e.id);
  const installedIds=new Set(catalog.filter(e=>e.installedEntrypoint&&status(e)==='installed').map(e=>e.id));
  const available=catalog.filter(e=>e.installedEntrypoint?installedIds.has(e.id):!installedIds.has(e.id));
  const entry=selected?available.find(e=>`${e.id}@${e.version}`===selected):null;
  const entries=currentEntries(available,history).filter(e=>(category==='全部'||category===e.category)&&`${e.name} ${e.id} ${e.version} ${e.summary} ${e.requirements}`.toLowerCase().includes(query.trim().toLowerCase()));
  const label=e=>e.installedEntrypoint?'本机已安装':versionLabel(e.version);
  const image=e=>{const src=pluginIcon(e,assets);return h('img',{className:'pc-icon',src,'data-vector':src?.startsWith('data:image/svg+xml')||undefined,alt:'',width:64,height:64,draggable:false});};
  const release=e=>{let source;try{source=e.installedEntrypoint?null:installSource(e,directory.commit);}catch{}return releaseState(installer,e,source,directory);};
  const review=e=>{
   if(e.installedEntrypoint)return h('button',{type:'button',className:'pc-action',disabled:!!directory.busy,onClick:()=>store.open(e),'aria-label':`打开${e.name}`},directory.busy===`${e.id}@${e.version}`?'打开中':'打开日历');
   const action=releaseAction(release(e));
   return h('button',{type:'button',className:'pc-action',disabled:action.disabled||!!directory.busy||directory.status!=='ready',onClick:()=>action.label==='核对版本'?setSelected(`${e.id}@${e.version}`):store.review(e),'aria-label':`${action.label}：${e.name} ${versionLabel(e.version)}`},directory.busy===`${e.id}@${e.version}`?'审核中':action.label);
  };
  const link=(label,url)=>h('a',{href:url,target:'_blank',rel:'noopener noreferrer',className:'pc-link'},label);
  const nav=h(React.Fragment,null,...CATEGORIES.map(name=>h('button',{type:'button',key:name,'aria-current':category===name?'page':undefined,onClick:()=>{setCategory(name);setSelected(null);setNavOpen(false);}},categoryLabel(name))),h('div',{className:'pc-nav-bottom'},h('label',{className:'pc-history'},h('input',{type:'checkbox',checked:history,onChange:e=>setHistory(e.target.checked)}),'历史版本'),h('span',{className:'pc-center-version'},versionLabel(VERSION))));
  const global=h(React.Fragment,null,h(Tool,{label:'切换分类',className:'v2-mobile-nav pc-menu','aria-expanded':navOpen,onClick:()=>setNavOpen(v=>!v)},h(Control,{name:'notes'})),h('div',{className:'v2-search pc-search'},h('input',{type:'search','aria-label':'搜索插件',placeholder:'搜索插件',value:query,onChange:e=>{setQuery(e.target.value);setSelected(null);}})));
  return h(React.Fragment,null,h('style',null,css),h(Workspace,{className:'pc-workspace',theme:'host',global,nav,navOpen,'data-plugin-center':true,onKeyDown:e=>{if(e.key==='Escape'){if(selected){e.preventDefault();close();}else setNavOpen(false);}}},
   h(Header,{title:entry?'插件详情':'插件中心',tools:h(Tool,{label:'刷新目录',disabled:directory.status==='loading'||!!directory.busy,onClick:()=>store.refresh()},h(Control,{name:'cloud'}),directory.status==='loading'?'刷新中':'刷新')}),
   directory.installationError?h('p',{role:'status',className:'pc-notice'},directory.installationError):null,
   directory.error?h('p',{role:'alert',className:'pc-notice'},directory.error):null,
   directory.notice?h('p',{role:'status',className:'pc-notice'},directory.notice):null,
   entry?h('section',{className:'pc-detail'},h('button',{type:'button',className:'pc-back',onClick:close},'返回'),h('div',{className:'pc-detail-identity'},image(entry),h('div',null,h('h2',{ref:detailHeading,tabIndex:-1},entry.name),h('p',{className:'pc-version'},label(entry)))),
    h('div',{className:'pc-detail-people'},contributors(entry),entry.legacy?h('span',null,'历史版本'):null),
    h('p',{className:'pc-description'},entry.summary),h('h3',null,'使用条件'),h('p',{className:'pc-description'},entry.requirements),
    !entry.installedEntrypoint&&release(entry)==='unknown'?h('p',{role:'status',className:'pc-notice'},'本机已安装，但当前 Buzz 无法核验此包是否同版。可在原生审核中核对目标版本；未确认前不会更新。'):null,
    h('div',{className:'pc-detail-actions'},!entry.installedEntrypoint&&release(entry)==='unknown'?h('button',{type:'button',className:'pc-action',disabled:!!directory.busy||directory.status!=='ready',onClick:()=>store.review(entry)},'审阅此版本'):review(entry),entry.installedEntrypoint?null:h(React.Fragment,null,link('源码',entryLinks(entry,directory.commit).source),link('下载',entryLinks(entry,directory.commit).download))))
   :h('div',{className:'pc-grid','aria-busy':directory.status==='loading'},...entries.map(e=>h('article',{key:`${e.id}@${e.version}`,className:'pc-card','data-entry':e.id,'data-version':e.version},
    h('button',{type:'button',className:'pc-card-identity',ref:node=>{const key=`${e.id}@${e.version}`;if(node)cardRefs.current.set(key,node);else cardRefs.current.delete(key);},onClick:()=>setSelected(`${e.id}@${e.version}`),'aria-label':`查看${e.name}详情`},image(e),h('h2',null,e.name)),
    h('div',{className:'pc-card-meta'},h('span',{className:'pc-version'},label(e)),e.legacy?h('span',{className:'pc-legacy'},'历史'):null),
    h('div',{className:'pc-card-footer'},contributors(e),review(e))))),
   !entry&&!entries.length?h('p',{role:'status',className:'pc-empty'},directory.status==='loading'?'加载中':directory.entries.length?'没有匹配的插件':'尚未载入目录'):null));
 };
}
export function apply(ctx){
 const assets=OPCB_PLUGIN_CENTER_ASSETS,css=OPCB_PLUGIN_CENTER_CSS;
 const installer=ctx.reflect.get('pluginInstaller');
 const nativeReview=createNativeReview(ctx.reflect.get('pluginRequests'),ctx.relay,ctx.navigation,installer);
 const store=createDirectoryStore(options=>ctx.host.request(options),installer,ctx.navigation,nativeReview);
 ctx.effect(()=>nativeReview.subscribe(()=>void store.refreshInstalled()));
 ctx.effect(()=>ctx.relay.subscribe(()=>void store.refreshInstalled()));
 ctx.effect(()=>{const refresh=()=>{void store.refreshInstalled();if(Date.now()-store.snapshot().refreshedAt>60000)void store.refresh();};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);});
 ctx.effect(()=>()=>store.dispose());
 registerInstallCards(ctx,store,installer,assets,css);
 const component=createPage(ctx.react,store,installer,assets,css,ctx.relay);
 ctx.pages.register({id:'catalog',title:'插件中心',icon:pluginIcon({id:'opcb.plugin-center'},assets),primary:true,placement:'dock',layout:'workspace',component});
}
