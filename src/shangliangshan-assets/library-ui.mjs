import {createAssetActionsUI} from './actions-ui.mjs';
import {createMediaUI} from '../media-workspace/ui.mjs';
import {ASSET_COLLECTIONS,ASSET_TOPICS,ASSET_PLATFORMS,assetFiles,assetCollection,assetMediaUrl,assetKind,assetTopic,assetAllowed,assetDate,browseAssets,assetMembers} from './model.mjs';

// The source adapter owns identity and transport. No cookies, sample records or
// claims of native connectivity are created by these page components.
export function createAssetLibraryUI(React){
  const h=React.createElement,{Icon,Tool,Mark,Header,Pager}=createMediaUI(React);
  const {ShareDialog,FolderDialog,LifecycleDialog,AssignDialog}=createAssetActionsUI(React);
  const names={all:'全部资产',recent:'最近素材',mine:'我上传的',pending:'待分类',trash:'回收站',tags:'标签管理',permissions:'成员与权限',upload:'采集上传'};
  const roles={admin:'管理员',editor:'普通成员',viewer:'只读成员'};
  const date=value=>value?String(value).slice(0,10):'—';
  const action=(label,onClick,props={})=>h('button',{type:'button',className:'mw-button',onClick,...props},label);
  const field=(label,control)=>h('label',{className:'mw-field'},h('span',null,label),control);
  function SourceAction({label='在原站操作',onOpenWebsite,page,asset}){return action(label,()=>onOpenWebsite?.({page,asset:asset?.id}));}
  function Detail({asset,data,onBack,onOpenWebsite,onReadCopy,ImageComponent,VideoComponent,onShare}){
    const detailRef=React.useRef(null);
    React.useEffect(()=>{const previous=document.activeElement;detailRef.current?.querySelector('button')?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
    const [tab,setTab]=React.useState('info'),[number,setNumber]=React.useState(asset.versions.at(-1)?.number),[index,setIndex]=React.useState(0);
    const [platform,setPlatform]=React.useState('xhs'),[copy,setCopy]=React.useState(null),[error,setError]=React.useState(''),[copying,setCopying]=React.useState('');
    const versions=asset.versions,version=versions.find(v=>v.number===number)||versions.at(-1);
    const files=assetFiles(asset,data.files,version),file=files[Math.min(index,Math.max(0,files.length-1))];
    const url=assetMediaUrl(file?.url),poster=assetMediaUrl(file?.poster),collection=ASSET_COLLECTIONS.find(c=>c.id===assetCollection(asset,data.files));
    React.useEffect(()=>{
      if(tab!=='copy'||!onReadCopy)return;
      let active=true;setCopy(null);setError('');
      Promise.resolve(onReadCopy(asset.id,platform)).then(value=>{if(active)setCopy(value);}).catch(e=>{if(active)setError(e.message);});
      return()=>{active=false;};
    },[tab,platform,asset.id,asset.revision,onReadCopy]);
    async function copyText(value){try{await navigator.clipboard.writeText(value);setCopying('已复制');}catch{setCopying('复制受限，请选择文字复制');}}
    return h('article',{className:'mw-detail','aria-label':'资产详情',ref:detailRef,role:'dialog','aria-modal':true,onKeyDown:e=>{if(e.key==='Escape'){e.stopPropagation();onBack();}if(e.key==='Tab'){const nodes=[...detailRef.current.querySelectorAll('button:not(:disabled),input,textarea,select,a[href],video[controls]')].filter(n=>n.offsetParent!==null);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}},
      h('div',{className:'mw-detail-top'},h(Tool,{label:'关闭资产详情',icon:'close',onClick:onBack}),h('span',{className:'mw-eyebrow'},collection?.name||'待分类'),h('span',{className:'mw-spacer'}),h('span',{className:'mw-tag mw-numeric'},`v${version?.number||1}`),onShare&&!asset.trashed&&assetAllowed(data,'download',asset)&&action('分享',()=>onShare([asset.id]))),
      h('h1',null,asset.title),h('div',{className:'mw-detail-attributes'},h('span',{className:'mw-tag'},asset.createdBy||'未署名'),h('span',{className:'mw-tag'},`${files.length} 个文件`),h('span',{className:'mw-tag'},({disabled:'已停用',editing:'制作中'}[asset.status]||'可使用'))),
      h('nav',{className:'mw-detail-tabs','aria-label':'资产详情分页'},[['info','资料'],['versions','版本'],['copy','平台文案'],['records','发布记录']].map(([id,label])=>action(label,()=>setTab(id),{key:id,'aria-current':tab===id?'page':undefined}))),
      ['info','versions'].includes(tab)&&h(React.Fragment,null,
        h('div',{className:'mw-hero','data-media':file?.kind==='video'?'video':'image'},file?.kind==='image'&&url?h(ImageComponent||'img',{src:url,alt:asset.title}):file?.kind==='video'&&url?h(VideoComponent||'video',{key:url,controls:true,src:url,poster,preload:'metadata','aria-label':'资产视频预览'}):file?.kind==='pdf'&&url?VideoComponent?h('div',{className:'mw-media-unavailable'},h('span',null,'PDF 原件'),h(SourceAction,{label:'在原站打开文档',onOpenWebsite,asset})):h('iframe',{key:url,src:url,title:'PDF文件预览'}):h('div',{className:'mw-media-unavailable'},h(Mark,{name:'briefcase',size:56}),h('span',null,file?.name||'没有可用预览'),h(SourceAction,{label:'在原站预览文件',onOpenWebsite,asset}))),
        files.length>1&&h('div',{className:'mw-image-controls'},h(Tool,{label:'上一份文件',icon:'left',disabled:index===0,onClick:()=>setIndex(i=>i-1)}),h('span',{className:'mw-numeric'},`${index+1} / ${files.length}`),h(Tool,{label:'下一份文件',icon:'right',disabled:index+1>=files.length,onClick:()=>setIndex(i=>i+1)})),
        h('div',{className:'mw-version-row'},field('预览版本',h('select',{'aria-label':'资产版本',value:version?.number,onChange:e=>{setNumber(Number(e.target.value));setIndex(0);}},versions.slice().reverse().map(v=>h('option',{key:v.number,value:v.number},`v${v.number}${v===versions.at(-1)?' · 当前':''}`)))),h('span',{className:'mw-spacer'}),file?.bytes&&h('span',{className:'mw-eyebrow'},`${(file.bytes/1048576).toFixed(1)} MB`)),
        tab==='versions'?h('section',{className:'mw-version-history','aria-label':'版本历史'},versions.slice().reverse().map(v=>action(h(React.Fragment,null,h('b',{className:'mw-numeric'},`v${v.number}`),h('span',null,v.actor||'团队成员'),h('span',null,date(v.createdAt))),()=>{setNumber(v.number);setIndex(0);},{key:v.number,'aria-pressed':v.number===version?.number})),h('div',{className:'mw-action-row'},assetAllowed(data,'upload',asset)&&h(SourceAction,{label:'在原站上传新版本',onOpenWebsite,asset,page:'version'}))):h(React.Fragment,null,
          h('div',{className:'mw-asset-tags'},(asset.tags||[]).map(tag=>h('span',{className:'mw-tag',key:tag},tag))),
          asset.caption&&h('section',{className:'mw-note'},h('h2',null,'原文'),h('p',null,asset.caption),action('复制原文',()=>copyText(asset.caption))),
          h('dl',{className:'mw-asset-properties'},[['细分类',ASSET_TOPICS[collection?.id]?.find(([id])=>id===assetTopic(asset,data.files))?.[1]],['素材时间',date(assetDate(asset))],['上传时间',date(asset.createdAt)],['更新时间',date(asset.updatedAt)],['项目',asset.project],['主题',asset.subject]].filter(([,v])=>v).map(([key,value])=>h(React.Fragment,{key},h('dt',null,key),h('dd',null,value)))),
          h('div',{className:'mw-action-row'},assetAllowed(data,'editCopy',asset)&&h(SourceAction,{label:'在原站编辑资料',onOpenWebsite,asset,page:'edit'}),assetAllowed(data,'download',asset)&&h(SourceAction,{label:`在原站下载 v${version?.number||1}`,onOpenWebsite,asset,page:'download'}),asset.trashed&&assetAllowed(data,'delete',asset)&&h(SourceAction,{label:'在原站恢复资产',onOpenWebsite,asset,page:'restore'})))),
      tab==='copy'&&h('section',{className:'mw-copy-panel'},
        h('div',{className:'mw-platforms'},ASSET_PLATFORMS.map(([id,label])=>action(label,()=>{setPlatform(id);setCopying('');},{key:id,'aria-pressed':platform===id}))),
        error?h('p',{role:'alert'},error):copy?h(React.Fragment,null,h('p',{className:'mw-eyebrow'},`素材 v${copy.copy.mediaVersion} · ${{source:'现有原文',draft:'草稿 · 待人工确认',empty:'尚未准备平台文案'}[copy.copy.status]||'平台文案'}`),
          field('作品标题',h('input',{readOnly:true,value:copy.copy.title||''})),field('文案',h('textarea',{readOnly:true,value:copy.copy.caption||'',rows:8})),field('话题',h('input',{readOnly:true,value:(copy.copy.tags||[]).map(t=>'#'+t).join(' ')})),platform==='douyin'&&field('小黄车标题',h('input',{readOnly:true,value:copy.copy.cartTitle||''})),
          h('div',{className:'mw-action-row'},action('复制标题',()=>copyText(copy.copy.title||'')),action('复制文案',()=>copyText(copy.copy.caption||'')),action('复制全部',()=>copyText([copy.copy.title,copy.copy.caption,...(copy.copy.tags||[]).map(t=>'#'+t)].filter(Boolean).join('\n'))),h(SourceAction,{label:'在原站编辑与悬浮复制',onOpenWebsite,asset,page:'platform-copy'}))):h('p',{role:'status'},onReadCopy?'正在读取平台文案…':'平台文案请在原站查看'),!onReadCopy&&h(SourceAction,{onOpenWebsite,asset,page:'platform-copy'})),
      tab==='records'&&h('section',{className:'mw-record-list'},(asset.publications||[]).length?(asset.publications||[]).map((p,i)=>h('article',{key:p.id||i,className:'mw-record'},h('strong',null,p.platform),h('span',{className:'mw-tag mw-numeric'},`v${p.version}`),h('p',null,p.actor||p.createdBy||'团队成员'),h('p',{className:'mw-eyebrow'},`登记 ${date(p.createdAt)} · 发布 ${date(p.publishedAt)}`),h(SourceAction,{label:'在原站查看记录',onOpenWebsite,asset,page:'records'}))):h('div',{className:'mw-empty'},h(Icon,{name:'publish',size:32}),h('h2',null,'尚未登记发布链接')),assetAllowed(data,'editCopy',asset)&&h(SourceAction,{label:'在原站登记发布链接',onOpenWebsite,asset,page:'publish'})),
      copying&&h('p',{role:'status'},copying));
  }
  function Library({data,loading=false,pendingTrash=0,error='',onRefresh,onOpenWebsite,onReadCopy,ImageComponent,VideoComponent,executionTools,onAssetChange,onSwitchMember,identityBound=false,onCreateFolder,onShare,onAssignFolder,onLifecycle}){
    const [lifecycle,setLifecycle]=React.useState(null),[assigning,setAssigning]=React.useState(null),[undo,setUndo]=React.useState(null),[working,setWorking]=React.useState(false);
    const [creatingFolder,setCreatingFolder]=React.useState(false),[sharing,setSharing]=React.useState(null),[notice,setNotice]=React.useState(''),[folder,setFolder]=React.useState('');
    React.useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),7000);return()=>clearTimeout(timer);},[notice]);
    const [scope,setScope]=React.useState('all'),[collection,setCollection]=React.useState(''),[topic,setTopic]=React.useState('');
    const [query,search]=React.useState(''),[tag,setTag]=React.useState(''),[kind,setKind]=React.useState(''),[theme,setTheme]=React.useState('host');
    const [platform,setPlatform]=React.useState(''),[published,setPublished]=React.useState(''),[sort,setSort]=React.useState('new'),[from,setFrom]=React.useState(''),[to,setTo]=React.useState('');
    const [filters,showFilters]=React.useState(false),[selected,setSelected]=React.useState(''),[picked,setPicked]=React.useState([]);
    const [page,setPage]=React.useState(0),[density,setDensity]=React.useState('grid'),[side,setSide]=React.useState(true),[uploadTab,setUploadTab]=React.useState('files');
    const shellRef=React.useRef(null);
    React.useEffect(()=>{if(!shellRef.current)return;let previous=Infinity;const observer=new ResizeObserver(([entry])=>{const width=entry.contentRect.width;if(width<1000&&previous>=1000)setSide(false);previous=width;});observer.observe(shellRef.current);return()=>observer.disconnect();},[Boolean(data)]);
    const rows=React.useMemo(()=>{
      if(!data)return [];
      const assets=browseAssets(data,{scope,collection,topic,query,kind,platform,published,tag,sort,from,to});
      return folder?assets.filter(a=>a.folderIds?.includes(folder)):assets;
    },[data,scope,collection,topic,query,kind,platform,published,tag,sort,from,to,folder]);
    const counts=React.useMemo(()=>{
      const byCollection=new Map();
      let all=0;
      for(const asset of data?.assets||[]){
        if(asset.trashed||!assetAllowed(data,'view',asset))continue;
        all++;
        const key=assetCollection(asset,data.files);
        byCollection.set(key,(byCollection.get(key)||0)+1);
      }
      return {all,byCollection};
    },[data]);
    const size=18,currentPage=Math.min(page,Math.max(0,Math.ceil(rows.length/size)-1)),visible=rows.slice(currentPage*size,(currentPage+1)*size);
    const asset=rows.find(a=>a.id===selected),management=['tags','permissions','upload'].includes(scope);
    React.useEffect(()=>{onAssetChange?.(asset||null);return()=>onAssetChange?.(null);},[asset,onAssetChange]);
    const title=folder?(data?.folders||[]).find(f=>f.id===folder)?.name||'文件夹':tag?`标签：${tag}`:ASSET_TOPICS[collection]?.find(([id])=>id===topic)?.[1]||ASSET_COLLECTIONS.find(c=>c.id===collection)?.name||names[scope];
    const filterKey=JSON.stringify([scope,collection,topic,folder,query,kind,platform,published,tag,sort,from,to]);
    React.useEffect(()=>{setPage(0);setPicked([]);setSelected('');},[filterKey]);
    React.useEffect(()=>setPicked(previous=>{
      if(!previous.length)return previous;
      const available=new Set(rows.map(a=>a.id));
      const next=previous.filter(id=>available.has(id));
      return next.length===previous.length?previous:next;
    }),[rows]);
    function navigate(next,cat='',sub=''){setFolder('');setScope(next);setCollection(cat);setTopic(sub);setTag('');search('');setKind('');setPlatform('');setPublished('');setFrom('');setTo('');setSelected('');if(globalThis.innerWidth<1000)setSide(false);}
    function nav(label,icon,next,cat='',sub='',count){const active=scope===next&&collection===cat&&topic===sub;return h('button',{type:'button',className:'mw-side-item'+(sub?' mw-sub-item':''),key:[next,cat,sub].join('/'),'aria-current':active?'page':undefined,onClick:()=>navigate(next,cat,sub)},h(Icon,{name:icon,size:19}),h('span',null,label),count!==undefined&&h('small',{className:'mw-numeric'},count));}
    const tags=(data?.governance?.tags||[]).filter(t=>[t.name,t.group].join(' ').toLowerCase().includes(query.toLowerCase()));
    const pick=id=>setPicked(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
    async function applyLifecycle(operation,ids,snapshot){
      const optimistic=operation==='trash';
      if(working)return;
      if(!optimistic)setWorking(true);
      if(optimistic){setPicked([]);setSelected('');}
      try{
        const result=await onLifecycle(operation,ids,snapshot);
        if(!optimistic){setPicked([]);setSelected('');}
        setNotice(optimistic?`已将 ${result.count} 组放入回收站`:operation==='restore'?`已恢复 ${result.count} 组`:`已永久删除 ${result.count} 组`);
        setUndo(optimistic?result.items:null);
        return result;
      }catch(e){setUndo(null);setNotice(e.message);throw e;}
      finally{if(!optimistic)setWorking(false);}
    }
    const canRestore=a=>assetAllowed(data,'delete',a)&&(data.user.role==='admin'||a.trashedById===data.user.id);
    function quickAction(a,label,fn,allowed=true){return allowed&&h('button',{type:'button',disabled:working,onClick:e=>{e.currentTarget.closest('details').open=false;fn();}},label);}
    return h('div',{className:'opcb-v3 media-workspace assets-workspace','data-theme':theme,'data-language':'zh'},h('style',null,typeof OPCB_FACTORY_ASSETS_UI_CSS==='string'?OPCB_FACTORY_ASSETS_UI_CSS:''),
      h(Header,{brand:'Assets',mark:'briefcase',tabs:management?[]:[{id:'',label:'全部',icon:'grid'},{id:'pictures',label:'图片',icon:'image'},{id:'video',label:'视频',icon:'play'},{id:'documents',label:'文档',icon:'file'}],active:kind,onTab:setKind,query,onQuery:value=>{search(value);setSelected('');},searchLabel:scope==='tags'?'搜索标签':'搜索资产',tools:h(React.Fragment,null,h(Tool,{label:'展开或收起资产目录',icon:'menu',pressed:side,onClick:()=>setSide(!side)}),h(Tool,{label:'刷新资产',icon:'refresh',onClick:onRefresh,disabled:loading}),h(Tool,{label:'切换明暗主题',icon:'moon',onClick:()=>setTheme(theme==='dark'?'light':'dark')}),h(Tool,{label:'打开资产原站',icon:'arrow',onClick:()=>onOpenWebsite?.()}),executionTools)}),
      !data?h('section',{className:'mw-panel mw-empty'},h('h1',null,error||'正在读取资产…')):
      h('div',{className:'mw-asset-shell',ref:shellRef,'data-sidebar':side?'open':'closed'},
        side&&h('aside',{className:'mw-sidebar','aria-label':'资产目录'},h('div',{className:'mw-workspace-name'},h(Mark,{name:'briefcase',size:34}),h('div',null,h('strong',null,'上粮山'),null)),
          h('nav',null,h('p',{className:'mw-side-heading'},'浏览'),nav('全部资产','grid','all','','',counts.all),nav('最近素材','clock','recent'),nav('我上传的','person','mine'),h('div',{className:'mw-folder-heading'},h('p',{className:'mw-side-heading'},'文件夹'),onCreateFolder&&assetAllowed(data,'upload',null,collection)&&h('button',{type:'button',className:'mw-folder-add','aria-label':'新建文件夹',title:'新建文件夹',onClick:()=>setCreatingFolder(true)},h('svg',{viewBox:'0 0 24 24',width:16,height:16,fill:'none',stroke:'currentColor',strokeWidth:1.5,strokeLinecap:'round','aria-hidden':true},h('path',{d:'M12 4v16M4 12h16'})))),
            ASSET_COLLECTIONS.filter(c=>assetAllowed(data,'view',null,c.id)).map(c=>h(React.Fragment,{key:c.id},nav(c.name,'folder','all',c.id,'',counts.byCollection.get(c.id)||0),collection===c.id&&(ASSET_TOPICS[c.id]||[]).map(([id,label])=>nav(label,'right','all',c.id,id)))),
            (data.folders||[]).map(f=>h('button',{type:'button',className:'mw-side-item',key:f.id,'aria-current':folder===f.id?'page':undefined,onClick:()=>{navigate('all');setFolder(f.id);}},h(Icon,{name:'folder',size:19}),h('span',null,f.name))),
            h('p',{className:'mw-side-heading'},'整理'),nav('待分类','folder','pending'),nav('回收站','trash','trash'),h('p',{className:'mw-side-heading'},'管理'),nav('标签管理','tag','tags'),data.user.role==='admin'&&nav('成员与权限','shield','permissions')),
          h('div',{className:'mw-side-account'},h('span',{className:'mw-avatar'},data.user.initial||data.user.name?.slice(0,1)),h('span',null,h('strong',null,data.user.name),h('small',null,roles[data.user.role]||'成员')),!identityBound&&h(Tool,{label:onSwitchMember?'切换原站成员':'在原站切换成员',icon:'arrow',onClick:()=>onSwitchMember?onSwitchMember():onOpenWebsite?.({page:'account'})}))),
        h('main',{className:'mw-panel mw-asset-main','aria-label':title},
          h('div',{className:'mw-page-heading'},h('div',null,h('h1',null,title),null),h('span',{className:'mw-spacer'}),!management&&h('span',{className:'mw-count mw-numeric'},rows.length),assetAllowed(data,'upload',null,collection)&&action('新增 / 上传',()=>navigate('upload'),{className:'mw-button mw-primary'})),
          error&&h('p',{role:'alert'},error),
          pendingTrash>0&&h('p',{role:'status'},`正在同步 ${pendingTrash} 组删除`),
          scope==='tags'?h('section',{'aria-label':'标签管理工作页'},h('div',{className:'mw-management-intro'},h('p',null,`${tags.length} 个标签`),assetAllowed(data,'tags')&&h(SourceAction,{label:'在原站新增、合并标签',onOpenWebsite,page:'tags'})),h('div',{className:'mw-data-table'},h('div',{className:'mw-table-row mw-table-head'},h('span',null,'标签名称'),h('span',null,'标签组'),h('span',null,'资产数量'),h('span',null,'操作')),tags.map(t=>h('div',{className:'mw-table-row',key:t.id},action(t.name,()=>{navigate('all');setTag(t.name);}),h('span',null,t.group||'其他'),action(`${t.count} 组`,()=>{navigate('all');setTag(t.name);}),assetAllowed(data,'tags')&&h(SourceAction,{label:'原站编辑',onOpenWebsite,page:'tags'}))),!tags.length&&h('p',{className:'mw-empty'},'没有匹配的标签'))):
          scope==='permissions'?h('section',{'aria-label':'成员与权限工作页'},data.user.role!=='admin'?h('p',null,'当前账号没有成员管理权限'):h(React.Fragment,null,h('div',{className:'mw-management-intro'},h('p',null,'角色、操作权限和目录范围'),h(SourceAction,{label:'在原站修改权限',onOpenWebsite,page:'permissions'})),h('div',{className:'mw-data-table'},h('div',{className:'mw-table-row mw-table-head'},h('span',null,'成员'),h('span',null,'角色'),h('span',null,'操作权限'),h('span',null,'目录范围')),assetMembers(data).map(({id,name,role,capabilities,folderRights})=>h('div',{className:'mw-table-row',key:id},h('strong',null,name),h('span',null,roles[role]||role),h('span',null,role==='admin'?'全部':Object.entries(capabilities).filter(([,v])=>v).map(([k])=>({download:'下载',delete:'删除',tags:'标签',upload:'上传',editCopy:'文案'}[k]||k)).join('、')||'按角色继承'),h('span',null,Object.entries(folderRights).map(([k,v])=>(ASSET_COLLECTIONS.find(c=>c.id===k)?.name||(k==='unclassified'?'待分类':k))+'：'+({inherit:'继承',admin:'编辑',editor:'编辑',viewer:'只读',none:'不可访问'}[v]||v)).join('；')||'按角色继承')))),null)):
          scope==='upload'?h('section',{'aria-label':'采集上传工作页'},h('nav',{className:'mw-detail-tabs'},action('文件上传',()=>setUploadTab('files'),{'aria-current':uploadTab==='files'?'page':undefined}),action('小红书采集',()=>setUploadTab('xhs'),{'aria-current':uploadTab==='xhs'?'page':undefined})),uploadTab==='files'?h(React.Fragment,null,h('div',{className:'mw-upload-zone'},h(Mark,{name:'briefcase',size:68}),h('h2',null,'把好素材，留在这里'),h('p',null,'图片、视频、PDF、PPT、Keynote'),h(SourceAction,{label:'打开原站文件上传',onOpenWebsite,page:'upload'})),null):h(React.Fragment,null,h('div',{className:'mw-upload-zone'},h(Mark,{name:'pin',size:68}),h('h2',null,'采集小红书素材'),h(SourceAction,{label:'打开原站采集与任务队列',onOpenWebsite,page:'xhs'})),null)):
          h(React.Fragment,null,
            h('div',{className:'mw-filter-row'},action('筛选',()=>showFilters(!filters),{'aria-pressed':filters}),h('select',{'aria-label':'资产排序',value:sort,onChange:e=>setSort(e.target.value)},[['new','最新优先'],['old','最早优先'],['name','名称排序']].map(([id,label])=>h('option',{key:id,value:id},label))),h('span',{className:'mw-spacer'}),[['grid','网格视图'],['masonry','瀑布流视图'],['list','列表视图']].map(([id,label])=>h(Tool,{key:id,label,icon:id==='masonry'?'columns':id,pressed:density===id,onClick:()=>setDensity(id)}))),
            filters&&h('div',{className:'mw-expanded-filters'},field('平台',h('select',{'aria-label':'按发布平台筛选',value:platform,onChange:e=>setPlatform(e.target.value)},h('option',{value:''},'全部平台'),ASSET_PLATFORMS.map(([id,label])=>h('option',{key:id,value:id},label)))),field('发布记录',h('select',{'aria-label':'按发布状态筛选',value:published,onChange:e=>setPublished(e.target.value)},h('option',{value:''},'全部状态'),h('option',{value:'yes'},'已登记'),h('option',{value:'no'},'未登记'))),field('文件类型',h('select',{'aria-label':'按文件类型筛选',value:kind,onChange:e=>setKind(e.target.value)},[['','全部类型'],['pictures','所有图片'],['documents','所有文档'],['image','单图'],['gallery','图集'],['video','视频'],['live','Live'],['pdf','PDF'],['presentation','演示文稿'],['document','文档']].map(([id,label])=>h('option',{key:id,value:id},label)))),field('素材起始日期',h('input',{type:'date',value:from,onChange:e=>setFrom(e.target.value)})),field('结束日期',h('input',{type:'date',value:to,onChange:e=>setTo(e.target.value)})),action('清空筛选',()=>{search('');setPlatform('');setPublished('');setKind('');setTag('');setFrom('');setTo('');})),
            (picked.length>0||scope==='trash')&&h('div',{className:'mw-selection-bar'},h('strong',null,`已选 ${picked.length} 组`),action('选中本页',()=>setPicked(visible.map(a=>a.id))),action(`选择全部 ${rows.length} 组`,()=>setPicked(rows.map(a=>a.id))),scope!=='trash'&&h(SourceAction,{label:'批量整理 / 下载',onOpenWebsite,page:'batch'}),onAssignFolder&&scope!=='trash'&&action('加入文件夹',()=>setAssigning([...picked]),{disabled:working||!picked.length||picked.length>50||!picked.every(id=>assetAllowed(data,'upload',data.assets.find(a=>a.id===id)))}),onLifecycle&&scope!=='trash'&&action('删除',()=>{void applyLifecycle('trash',[...picked]).catch(()=>{});},{disabled:working||!picked.length||!picked.every(id=>assetAllowed(data,'delete',data.assets.find(a=>a.id===id)))}),onLifecycle&&scope==='trash'&&action('恢复',()=>{void applyLifecycle('restore',[...picked]).catch(()=>{});},{disabled:working||!picked.length||!picked.every(id=>canRestore(data.assets.find(a=>a.id===id)))}),onLifecycle&&scope==='trash'&&data.user.role==='admin'&&action('永久删除',()=>setLifecycle({operation:'purge',ids:[...picked]}),{disabled:working||pendingTrash>0||!picked.length}),onLifecycle&&scope==='trash'&&data.user.role==='admin'&&action('清空回收站',()=>setLifecycle({operation:'empty',ids:data.assets.filter(a=>a.trashed).map(a=>a.id)}),{disabled:working||pendingTrash>0||!data.assets.some(a=>a.trashed)}),onShare&&picked.length>0&&picked.length<=50&&picked.every(id=>{const item=data.assets.find(a=>a.id===id);return item&&!item.trashed&&assetAllowed(data,'download',item);})&&action('分享',()=>setSharing([...picked])),action('取消选择',()=>setPicked([]))),
            h('div',{className:'mw-asset-feed','data-layout':density,'aria-label':'资产列表'},visible.map(a=>{const file=assetFiles(a,data.files)[0],thumb=assetMediaUrl(file?.poster||((file?.kind==='image')?file.url:'')),kindName={image:'图片',gallery:'图集',video:'视频',live:'Live',pdf:'PDF',presentation:'演示文稿',document:'文档'}[assetKind(a,data.files)]||'文件';return h('article',{className:'mw-asset-card',key:a.id,'data-selected':picked.includes(a.id)},h('div',{className:'mw-asset-cover'},h('button',{type:'button','aria-label':`查看资产：${a.title}`,onClick:()=>setSelected(a.id)},thumb?h(ImageComponent||'img',{src:thumb,alt:'',loading:'lazy'}):h(Mark,{name:'briefcase',size:56})),h('label',{className:'mw-pick'},h('input',{type:'checkbox','aria-label':`选择资产：${a.title}`,checked:picked.includes(a.id),onChange:()=>pick(a.id)})),h('span',{className:'mw-cover-kind'},kindName)),h('div',{className:'mw-asset-card-copy'},h('button',{type:'button',className:'mw-asset-title',onClick:()=>setSelected(a.id)},a.title),h('div',{className:'mw-asset-card-meta'},h('span',null,a.createdBy||'未署名'),h('span',null,date(assetDate(a))),h('b',{className:'mw-numeric'},`v${a.versions.at(-1)?.number||1}`)),h('div',{className:'mw-asset-card-tags'},(a.tags||[]).slice(0,2).map(t=>h('span',{key:t},t)),a.trashed&&h('span',null,'已移入回收站'))),h('div',{className:'mw-asset-card-actions'},onShare&&!a.trashed&&assetAllowed(data,'download',a)&&action('分享',()=>setSharing([a.id])),h('details',{className:'mw-quick-menu'},h('summary',{'aria-label':`更多操作：${a.title}`},'⋯'),h('div',{className:'mw-quick-options'},quickAction(a,'查看',()=>setSelected(a.id)),!a.trashed&&quickAction(a,'分享',()=>setSharing([a.id]),onShare&&assetAllowed(data,'download',a)),!a.trashed&&quickAction(a,'加入文件夹',()=>setAssigning([a.id]),onAssignFolder&&assetAllowed(data,'upload',a)),!a.trashed&&quickAction(a,'下载',()=>onOpenWebsite?.({asset:a.id}),assetAllowed(data,'download',a)),!a.trashed&&quickAction(a,'编辑',()=>onOpenWebsite?.({asset:a.id}),assetAllowed(data,'editCopy',a)),onLifecycle&&(a.trashed?h(React.Fragment,null,quickAction(a,'恢复',()=>{void applyLifecycle('restore',[a.id]).catch(()=>{});},canRestore(a)),quickAction(a,'永久删除',()=>setLifecycle({operation:'purge',ids:[a.id]}),data.user.role==='admin'&&!pendingTrash)):quickAction(a,'放入回收站',()=>{void applyLifecycle('trash',[a.id]).catch(()=>{});},assetAllowed(data,'delete',a)))))));}),!rows.length&&h('div',{className:'mw-empty'},h(Mark,{name:'compass',size:58}),h('h2',null,scope==='trash'?'回收站为空':'没有匹配的资产'),action('清空筛选',()=>{search('');setPlatform('');setPublished('');setKind('');setFrom('');setTo('');setTag('');}))),h(Pager,{page:currentPage,total:rows.length,size,onPage:next=>{setPage(next);setSelected('');}}))),
        asset&&!management&&h('div',{className:'mw-asset-detail-wrap'},h('section',{className:'mw-panel mw-asset-detail','aria-label':'当前资产'},h(Detail,{key:asset.id,asset,data,onBack:()=>setSelected(''),onOpenWebsite,onReadCopy,ImageComponent,VideoComponent,onShare:onShare?setSharing:undefined})))),
      creatingFolder&&h(FolderDialog,{onCreate:name=>onCreateFolder(name,collection),onClose:()=>setCreatingFolder(false),onCreated:f=>{if(f?.id){navigate('all');setFolder(f.id);}}}),
      sharing&&h(ShareDialog,{assets:sharing,onShare,onClose:()=>setSharing(null),onCopied:setNotice}),
      lifecycle&&h(LifecycleDialog,{...lifecycle,data,onApply:onLifecycle,onClose:()=>setLifecycle(null),onDone:result=>{setNotice(`已永久删除 ${result.count} 组`);setPicked([]);setSelected('');}}),
      assigning&&h(AssignDialog,{ids:assigning,data,onApply:onAssignFolder,onClose:()=>setAssigning(null),onDone:()=>setNotice('已加入文件夹')}),
      notice&&h('div',{className:'mw-asset-toast',role:'status'},notice,undo&&h('button',{type:'button',disabled:working,onClick:()=>{void applyLifecycle('restore',undo.map(i=>i.id),{operation:'restore',items:undo}).then(()=>setUndo(null)).catch(()=>{});}},'撤销')));
  }
  return Library;
}
