import {createOriginalReferences} from './original-references.mjs';
import {createStructuredData} from './structured-data.mjs';
import {searchLibraries} from './discovery.mjs';
import {createKnowledgeWorkspace} from './reader-ui.mjs';
import {palette,quiet,button, input as controlInput,icon} from './presentation.mjs';
import { SOURCES, createIdentityClient, pageIdentity, publishPersonalBinding, registerAgentTools } from './identity-client.mjs';
export const inject=['react','pages','relay','host','agents'];
export function safeURL(value) { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; } }
export function markdownBlocks(content) {
  const lines = String(content).replace(/\r\n?/g, "\n").slice(0, 1000000).split("\n"), blocks = [];
  let paragraph = [], code = null;
  const flush = () => { if (paragraph.length) { blocks.push({ kind: "p", text: paragraph.join("\n") }); paragraph = []; } };
  for (let n=0;n<lines.length;n++) {
    const line=lines[n];
    if (/^\s*```/.test(line)) { flush(); if (code) { blocks.push({ kind: "code", text: code.join("\n") }); code = null; } else code = []; continue; }
    if (code) { code.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    const cells = text => text.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());
    if(line.includes('|')&&n+1<lines.length&&cells(lines[n+1]).length>1&&cells(lines[n+1]).every(v=>/^:?-{3,}:?$/.test(v))){
      flush();const headers=cells(line),rows=[];n++;
      while(n+1<lines.length&&lines[n+1].includes('|')&&lines[n+1].trim()){rows.push(cells(lines[++n]));}
      blocks.push({kind:'table',headers,rows});continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line), item = /^\s*(?:[-*+] |\d+[.)] )(.+)$/.exec(line);
    if (heading) { flush(); blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] }); }
    else if (item) { flush(); blocks.push({ kind: "item", text: item[1] }); }
    else if (/^>\s?/.test(line)) { flush(); blocks.push({ kind: "quote", text: line.replace(/^>\s?/, "") }); }
    else if (/^\s*[-*_]{3,}\s*$/.test(line)) { flush(); blocks.push({ kind: "rule" }); }
    else paragraph.push(line);
  }
  flush(); if (code) blocks.push({ kind: "code", text: code.join("\n") });
  return blocks;
}


export function apply(ctx){
 const React=ctx.react,h=React.createElement,service=createIdentityClient(ctx.host);
 registerAgentTools(ctx,service);ctx.effect(()=>()=>service.dispose());
 const KnowledgeWorkspace=createKnowledgeWorkspace(React),StructuredData=createStructuredData(React),Originals=createOriginalReferences(React);
 const muted=quiet;
 const border=palette.border;
 const btn=button;
 const action=(text,onClick,props={})=>h('button',{type:'button',onClick,style:btn,...props},text);
 const inline=text=>String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g).map((part,i)=>{
   if(part.startsWith('**')&&part.endsWith('**'))return h('strong',{key:i,style:{fontWeight:600}},part.slice(2,-2));
   if(part.startsWith('`')&&part.endsWith('`'))return h('code',{key:i,style:{fontSize:'0.9em',background:'var(--surface-inset, #f3f4f5)',padding:'2px 4px',borderRadius:4}},part.slice(1,-1));
   const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);return link&&safeURL(link[2])?h('a',{key:i,href:safeURL(link[2]),target:'_blank',rel:'noopener noreferrer'},link[1]):part;
 });
 const date=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-CN',{hour12:false});};
  function Reader({ note, cache, sourceName,compact=false,preview=false }) {
    const blocks = React.useMemo(() => {const parsed=markdownBlocks(note.content);return parsed[0]?.kind==='heading'&&parsed[0].text.trim()===String(note.title||'').trim()?parsed.slice(1):parsed;}, [note.content,note.title]);
    let structured;try{const v=JSON.parse(note.content);if(v&&typeof v==='object'&&!Array.isArray(v))structured=v;}catch{}
    return h("article", { style: { maxWidth: 800, margin: "0 auto", width: "100%", overflowWrap: "anywhere" } },
      !preview&&h("p", { style: muted }, `${sourceName || "知识资料"} · ${date(note.updated_at)}`),
      !preview&&h("h1", { className:"kn-reader-title",tabIndex:-1 }, note.title || "未命名资料"),
      !preview&&h("p", { role: "status", style: muted }, cache?.cached ? `本机缓存 · ${date(cache.savedAt)} 保存，可能不是最新版本` : cache?.saved ? "已从知识源读取 · 正文已加入本机缓存" : "已从知识源读取 · 本机缓存未保存"),
      h(Originals,{items:note.originals||[]}),
      note.content.includes('[图片]')&&h('p',{role:'note',className:'kn-media-notice'},'正文图片尚未接入；请打开原始来源查看，当前页面仅显示文字。'),
      safeURL(note.url) ? h("a", { href: safeURL(note.url), target: "_blank", rel: "noopener noreferrer", style: { fontSize: 14 } }, "打开原始来源") : null,
      !preview&&blocks.some(b => b.kind === "heading") ? h("details", { style: { margin: "24px 0", borderTop: border, borderBottom: border, padding: "12px 0" } }, h("summary", { style: { cursor: "pointer", ...muted } }, "正文目录"), ...blocks.map((b, i) => b.kind === "heading" ? h("a", { key: i, href: `#knowledge-section-${i}`, style: { display: "block", padding: "4px 0", paddingLeft: (b.level - 1) * 12, fontSize: 14 } }, b.text) : null)) : null,
      structured?h(StructuredData,{value:structured,preview}):h("div", { className:preview?"kn-prose kn-prose-preview":"kn-prose" }, ...(preview?blocks.slice(0,6):blocks).map((b, i) => {
        if(b.kind==='table')return h('div',{key:i,style:{overflowX:'auto',margin:'20px 0'}},h('table',{style:{borderCollapse:'collapse',width:'100%',fontSize:16,minWidth:400}},h('thead',null,h('tr',null,...b.headers.map((cell,j)=>h('th',{key:j,style:{textAlign:'left',padding:12,borderBottom:border,fontWeight:600}},inline(cell))))),h('tbody',null,...b.rows.map((row,j)=>h('tr',{key:j},...b.headers.map((_,k)=>h('td',{key:k,style:{padding:12,borderBottom:border,verticalAlign:'top'}},inline(row[k]||''))))))));
        if (b.kind === "heading") return h(`h${Math.min(b.level + 1, 6)}`, { key: i, id: `knowledge-section-${i}`, style: { fontWeight: 600, fontSize: b.level === 1 ? 24 : 20, margin: "28px 0 12px", lineHeight: 1.6 } }, inline(b.text));
        if (b.kind === "code") return h("pre", { key: i, style: { overflowX: "auto", padding: 16, borderRadius: 8, background: "var(--surface-inset, #f3f4f5)", fontSize: 14, lineHeight: 1.7 } }, h("code", null, b.text));
        if (b.kind === "quote") return h("blockquote", { key: i, style: { borderLeft: "3px solid var(--border-standard, #ccc)", margin: "12px 0", paddingLeft: 16, color: "var(--text-subtle, #70747b)" } }, inline(b.text));
        if (b.kind === "item") return h("div", { key: i, style: { paddingLeft: 20, margin: "8px 0" } }, "• ", inline(b.text));
        if (b.kind === "rule") return h("hr", { key: i, style: { border: 0, borderTop: border, margin: "24px 0" } });
        return h("p", { key: i, style: { whiteSpace: "pre-wrap", margin: "12px 0 20px" } }, inline(b.text));
      })));
  }
  function Page(){
    const [connection,setConnection]=React.useState(()=>ctx.relay.snapshot());
    const empty={connected:false,catalog:[],libraries:[],organization:null,browsing:null,source:'recordings',listing:null,detail:null,latest:[],recent:[],search:null,pending:false,error:'',notice:'',cachedDocuments:0};
    const [state,setState]=React.useState(empty),[view,setView]=React.useState('home'),[returnView,setReturnView]=React.useState('home'),[settings,setSettings]=React.useState(false),[channel,setChannel]=React.useState(''),[query,setQuery]=React.useState(''),[scope,setScope]=React.useState('all'),[cacheMode,setCacheMode]=React.useState(false),[width,setWidth]=React.useState(1200);
    const scroller=React.useRef(null),positions=React.useRef({}),root=React.useRef(null),epoch=React.useRef(0),controller=React.useRef(new AbortController()),busy=React.useRef(false);
    let id;try{id=pageIdentity(connection);}catch{id=null;}
    const identityKey=id?.partition,online=connection.status==='ready'&&!connection.cached,compact=width<760;
    const privateChannels=(connection.session?.channels?.list?.().channels||[]).filter(c=>(c.visibility==='private'||c.private)&&!c.readOnly&&!c.cached&&!c.archived);
    const patch=value=>setState(s=>({...s,...value})),valid=v=>v===epoch.current&&!controller.current.signal.aborted;
    React.useEffect(()=>ctx.relay.subscribe(()=>setConnection(ctx.relay.snapshot())),[]);
    React.useEffect(()=>{const observer=new ResizeObserver(e=>setWidth(e[0].contentRect.width));if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
    React.useLayoutEffect(()=>{const element=scroller.current;if(!element)return;element.scrollTop=positions.current[view]||0;if(view==='reading')element.querySelector('h1')?.focus();},[view]);
    async function boot(v){
      const status=await service.status(id);if(!valid(v))return;patch(status);setSettings(!status.connected);if(!status.connected)return;
      if(!online)throw Error('连接后才能核对知识库权限，离线不展示缓存资料');
      const catalog=await service.read(id,{op:'catalog'},{signal:controller.current.signal});if(!valid(v))return;
      patch({catalog:catalog.sources,libraries:catalog.libraries,organization:catalog.organization||null,browsing:null,detail:null,search:null,listing:null,latest:[],recent:state.recent.filter(doc=>catalog.sources.some(s=>s.source_id===doc.sourceId))});setView('home');setScope('all');setCacheMode(false);
      const work=catalog.sources.find(s=>s.source_id==='recordings');
      if(work?.state==='ready'){try{const latest=await service.read(id,{op:'list',source:work.source_id,limit:4,offset:0},{signal:controller.current.signal});if(valid(v))patch({latest:latest.results.map(note=>({...note,sourceId:work.source_id}))});}catch(e){if(e.denied)throw e;if(valid(v))patch({notice:'最近工作资料暂未载入，可先浏览已开通的知识库'});}}
    }
    React.useEffect(()=>{
      controller.current.abort();controller.current=new AbortController();const v=++epoch.current;setState({...empty,pending:!!id});setQuery('');setScope('all');setView('home');setCacheMode(false);busy.current=false;
      if(id)void boot(v).catch(e=>{if(valid(v))patch({error:e.message,...(e.denied?{catalog:[],organization:null,browsing:null,latest:[],recent:[]}: {})});}).finally(()=>{if(valid(v))patch({pending:false});});
      return()=>{controller.current.abort();epoch.current++;};
    },[identityKey,connection.generation,online]);
    async function run(fn){
      if(!id||busy.current)return;busy.current=true;const v=++epoch.current;patch({pending:true,error:'',notice:''});
      try{await fn(v);if(valid(v))patch(await service.status(id));}
      catch(e){if(valid(v))patch({error:e.message,...(e.denied?{catalog:[],organization:null,browsing:null,listing:null,detail:null,latest:[],recent:[],search:null}: {})});}
      finally{if(valid(v)){busy.current=false;patch({pending:false});}}
    }
    async function loadList(source,offset,v,mode=false){
      const sourceInfo=state.catalog.find(item=>item.source_id===source);
      if(!mode&&sourceInfo?.state!=='ready'){if(valid(v)){patch({source,listing:null,detail:null,notice:'这个知识库尚未完成同步，暂不能读取资料'});setView('collection');setScope(source);setCacheMode(false);}return;}
      const listing=await service.read(id,{op:'list',source,limit:20,offset},{signal:controller.current.signal,cacheOnly:mode});
      if(valid(v)){positions.current.collection=0;if(scroller.current)scroller.current.scrollTop=0;patch({source,listing,detail:null});setView('collection');setScope(source);setCacheMode(mode);}
    }
    async function loadSpace(space,v,filters={}){
      const browsing=await service.read(id,{op:'browse',space:space.space||'all',space_id:space.space_id||'',category:filters.category||'',kind:filters.kind||'',query:filters.query||'',limit:20,offset:filters.offset||0},{signal:controller.current.signal});
      if(valid(v)){positions.current.space=0;if(scroller.current)scroller.current.scrollTop=0;patch({browsing:{...browsing,title:space.title||'全部资料',category:filters.category||'',kind:filters.kind||''},detail:null});setView('space');setCacheMode(false);setScope('@'+(space.space||'all')+':'+(space.space_id||''));if(browsing.unavailable.length)patch({notice:'部分知识源尚未同步，当前只展示可读取资料'});}
    }
    const openSpace=(space,filters={})=>{setSettings(false);setQuery(filters.query||'');return run(v=>loadSpace(space,v,filters));};
    const openCollection=source=>{setSettings(false);return run(v=>loadList(source,0,v));};
    const openDocument=(doc,full=false)=>run(async v=>{
      const source=doc.sourceId||state.source,detail=await service.read(id,{op:'get',source,id:doc.id},{signal:controller.current.signal,cacheOnly:view==='collection'&&cacheMode});
      if(valid(v)){if(full){positions.current[view]=scroller.current?.scrollTop||0;setReturnView(view);setView('reading');}patch({detail,source,recent:[{...state.recent.find(item=>item.id===doc.id&&item.sourceId===source),...doc,sourceId:source},...state.recent.filter(item=>item.id!==doc.id||item.sourceId!==source)].slice(0,6)});}
    });
    const smallAction=(label,onClick,props={})=>action(label,onClick,{...props,style:{...btn,minHeight:36,fontSize:14,padding:'6px 12px',...props.style}});
    const sourceMeta=state.catalog.find(s=>s.source_id===state.source),sourceName=sourceMeta?.display_name||SOURCES[state.source]||'知识资料';
    const getName=source=>state.catalog.find(s=>s.source_id===source)?.display_name||SOURCES[source];
    const searchForm=()=>h('form',{'aria-label':'知识搜索',className:'v2-search kn-search',onSubmit:e=>{e.preventDefault();if(!query.trim())return;void run(async v=>{
      if(scope.startsWith('@')||scope==='all'&&state.organization){const [kind,space_id='']=scope==='all'?['all','']:scope.slice(1).split(':');const list=kind==='team'?state.organization?.teams:state.organization?.projects;await loadSpace({space:kind,space_id,title:kind==='all'?'全部资料':kind==='shared'?'集团共享':kind==='unassigned'?'归属待确认':list?.find(s=>s.id===space_id)?.name},v,{query:query.trim()});return;}
      const catalog=scope==='all'?state.catalog:state.catalog.filter(s=>s.source_id===scope);
      const search=await searchLibraries(service,id,catalog,query.trim(),{signal:controller.current.signal});
      if(valid(v)){patch({search,detail:null});setSettings(false);setView('search');if(search.unavailable.length)patch({notice:`以下知识库暂未返回结果：${search.unavailable.join('、')}`});}
    });}},h('span',{'aria-hidden':true},icon(h,'search',18)),h('input',{type:'search','aria-label':'搜索知识库',placeholder:'搜索会议、经营、研究资料…',value:query,maxLength:100,onChange:e=>setQuery(e.target.value),disabled:!state.connected}),
      h('select',{'aria-label':'搜索范围',value:scope,onChange:e=>setScope(e.target.value),disabled:!state.connected},h('option',{value:'all'},state.organization?'集团全部资料':'全部知识库'),state.organization?h('optgroup',{label:'团队空间'},...state.organization.teams.map(t=>h('option',{key:t.id,value:'@team:'+t.id},t.name))):null,state.organization?h('optgroup',{label:'业务专题'},...state.organization.projects.map(p=>h('option',{key:p.id,value:'@project:'+p.id},p.name))):null,state.organization?h('option',{value:'@shared:'},'集团共享'):null,state.organization?h('option',{value:'@unassigned:'},'归属待确认'):null,...state.catalog.map(s=>h('option',{key:s.source_id,value:s.source_id},getName(s.source_id)))),
      h('button',{type:'submit','aria-label':'搜索',disabled:state.pending||!state.connected||!query.trim()},'搜索'));
    // Connection and cache controls are secondary to finding and reading knowledge.
    const identityPanel=(settings||!state.connected)?h('section',{'aria-label':'身份与缓存设置',style:{padding:compact?20:32,borderBottom:border,background:palette.inset}},
      h('div',{style:{maxWidth:760}},h('h2',{style:{fontSize:20,fontWeight:500,margin:'0 0 8px'}},state.connected?'本机连接与缓存':'连接你的 Buzz 身份'),
        h('p',{style:muted},state.connected?'已记住本机身份。Agent 可以直接查询，阅读页面无需保持打开。':'首次在这台电脑连接一次。你的 Agent 随个人继承已开通的知识库，无需逐个添加。'),
        !state.connected?h(React.Fragment,null,
          h('label',{style:{...muted,display:'block',margin:'20px 0 12px'}},'保存连接记录的私人对话',h('select',{'aria-label':'身份绑定私人对话',style:{...controlInput,display:'block',marginTop:8},value:channel||privateChannels[0]?.id||'',onChange:e=>setChannel(e.target.value)},...privateChannels.map(c=>h('option',{key:c.id,value:c.id},c.name||'私人对话')))),
          action('绑定当前 Buzz 身份',()=>run(async v=>{if(!online)throw Error('请先连接 Buzz 社区');const selected=channel||privateChannels[0]?.id;if(!selected)throw Error('请先建立可写的私人对话');await service.bind(id,content=>publishPersonalBinding(connection.session,selected,content,{signal:controller.current.signal}),{signal:controller.current.signal});if(valid(v)){setSettings(false);await boot(v);}}),{disabled:state.pending||!online||!id||!privateChannels.length}),
          h('p',{style:{...muted,fontSize:13}},'保存的原生记录仅含设备公钥与随机挑战，不包含私钥或知识正文。')):
          h('div',{style:{display:'flex',flexWrap:'wrap',gap:12,marginTop:16}},smallAction('清除正文缓存',()=>run(async()=>{await service.clearCache(id);patch({listing:null,detail:null,notice:'已清除正文缓存，连接保留'});setView('home');}),{disabled:state.pending}),h('details',null,h('summary',{style:{...muted,cursor:'pointer',padding:'8px 0'}},'断开本机连接'),h('p',{style:muted},'断开后，本机需要重新绑定。不会关闭你的服务器权限。'),smallAction('移除本机身份绑定与缓存',()=>run(async()=>{await service.forget(id);patch({...empty});setView('home');setQuery('');setSettings(true);}),{disabled:state.pending}))),
        h('p',{style:{...muted,fontSize:13,marginBottom:0}},'正文缓存仅在本机加密保存；每次读取仍会核对当前权限。'))):null;


    const closePreview=()=>patch({detail:null});
    const back=(home=false)=>{setSettings(false);if(home){void run(v=>boot(v));}else{patch({detail:null});setView(returnView);}};
    const openFull=()=>state.detail&&openDocument({...state.detail.note,sourceId:state.source},true);
    const cachePage=()=>run(async v=>{for(const doc of state.listing?.results||[]){if(!valid(v))return;await service.read(id,{op:'get',source:state.source,id:doc.id},{signal:controller.current.signal});}if(valid(v))patch({notice:'本页正文已缓存，读取时仍核对当前权限'});});
    return h(KnowledgeWorkspace,{state,view,compact,width,root,scroller,searchForm,identityPanel,settings,setSettings,sourceName,sourceMeta,getName,openCollection,openSpace,loadSpace,openDocument,openFull,closePreview,back,run,loadList,cacheMode,cachePage,Reader,online,connectionStatus:state.connected?(online?'个人身份已连接':'连接已离线'):'等待连接'});

  }
  ctx.pages.register({icon:"data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItYm9va3MiCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTUgNWExIDEgMCAwIDEgMSAtMWgyYTEgMSAwIDAgMSAxIDF2MTRhMSAxIDAgMCAxIC0xIDFoLTJhMSAxIDAgMCAxIC0xIC0xbDAgLTE0IiAvPgogIDxwYXRoIGQ9Ik05IDVhMSAxIDAgMCAxIDEgLTFoMmExIDEgMCAwIDEgMSAxdjE0YTEgMSAwIDAgMSAtMSAxaC0yYTEgMSAwIDAgMSAtMSAtMWwwIC0xNCIgLz4KICA8cGF0aCBkPSJNNSA4aDQiIC8+CiAgPHBhdGggZD0iTTkgMTZoNCIgLz4KICA8cGF0aCBkPSJNMTMuODAzIDQuNTZsMi4xODQgLS41M2MuNTYyIC0uMTM1IDEuMTMzIC4xOSAxLjI4MiAuNzMybDMuNjk1IDEzLjQxOGExLjAyIDEuMDIgMCAwIDEgLS42MzQgMS4yMTlsLS4xMzMgLjA0MWwtMi4xODQgLjUzYy0uNTYyIC4xMzUgLTEuMTMzIC0uMTkgLTEuMjgyIC0uNzMybC0zLjY5NSAtMTMuNDE4YTEuMDIgMS4wMiAwIDAgMSAuNjM0IC0xLjIxOWwuMTMzIC0uMDQxIiAvPgogIDxwYXRoIGQ9Ik0xNCA5bDQgLTEiIC8+CiAgPHBhdGggZD0iTTE2IDE2bDMuOTIzIC0uOTgiIC8+Cjwvc3ZnPg==",id:'knowledge',title:'跑圈集团知识库',primary:true,placement:'dock',layout:'workspace',component:Page});
}
