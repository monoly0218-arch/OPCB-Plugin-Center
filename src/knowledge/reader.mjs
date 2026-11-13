import {searchLibraries} from './discovery.mjs';
import {collectionCover,collectionTheme,sourceStatus} from './collection-visuals.mjs';
import {palette,quiet,button, input as controlInput,documentPreview,displayDate,icon} from './presentation.mjs';
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
  function Reader({ note, cache, sourceName,compact=false }) {
    const blocks = React.useMemo(() => {const parsed=markdownBlocks(note.content);return parsed[0]?.kind==='heading'&&parsed[0].text.trim()===String(note.title||'').trim()?parsed.slice(1):parsed;}, [note.content,note.title]);
    return h("article", { style: { maxWidth: 800, margin: "0 auto", width: "100%", overflowWrap: "anywhere" } },
      h("p", { style: muted }, `${sourceName || "知识资料"} · ${date(note.updated_at)}`),
      h("h1", { style: { fontSize: compact?30:40, lineHeight: 1.4, fontWeight: 600, margin: "20px 0 24px" } }, note.title || "未命名资料"),
      h("p", { role: "status", style: muted }, cache?.cached ? `本机缓存 · ${date(cache.savedAt)} 保存，可能不是最新版本` : cache?.saved ? "已从知识源读取 · 正文已加入本机缓存" : "已从知识源读取 · 本机缓存未保存"),
      safeURL(note.url) ? h("a", { href: safeURL(note.url), target: "_blank", rel: "noopener noreferrer", style: { fontSize: 14 } }, "打开原始来源") : null,
      blocks.some(b => b.kind === "heading") ? h("details", { style: { margin: "24px 0", borderTop: border, borderBottom: border, padding: "12px 0" } }, h("summary", { style: { cursor: "pointer", ...muted } }, "正文目录"), ...blocks.map((b, i) => b.kind === "heading" ? h("a", { key: i, href: `#knowledge-section-${i}`, style: { display: "block", padding: "4px 0", paddingLeft: (b.level - 1) * 12, fontSize: 14 } }, b.text) : null)) : null,
      h("div", { style: { fontSize: 18, lineHeight: 1.95, paddingBottom: 48 } }, ...blocks.map((b, i) => {
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
    const empty={connected:false,catalog:[],libraries:[],source:'recordings',listing:null,detail:null,latest:[],recent:[],search:null,pending:false,error:'',notice:'',cachedDocuments:0};
    const [state,setState]=React.useState(empty),[view,setView]=React.useState('home'),[returnView,setReturnView]=React.useState('home'),[settings,setSettings]=React.useState(false),[channel,setChannel]=React.useState(''),[query,setQuery]=React.useState(''),[scope,setScope]=React.useState('all'),[cacheMode,setCacheMode]=React.useState(false),[width,setWidth]=React.useState(1200);
    const scroller=React.useRef(null),positions=React.useRef({}),root=React.useRef(null),epoch=React.useRef(0),controller=React.useRef(new AbortController()),busy=React.useRef(false);
    let id;try{id=pageIdentity(connection);}catch{id=null;}
    const identityKey=id?.partition,online=connection.status==='ready'&&!connection.cached,compact=width<760;
    const privateChannels=(connection.session?.channels?.list?.().channels||[]).filter(c=>(c.visibility==='private'||c.private)&&!c.readOnly&&!c.cached&&!c.archived);
    const patch=value=>setState(s=>({...s,...value})),valid=v=>v===epoch.current&&!controller.current.signal.aborted;
    React.useEffect(()=>ctx.relay.subscribe(()=>setConnection(ctx.relay.snapshot())),[]);
    React.useEffect(()=>{const observer=new ResizeObserver(e=>setWidth(e[0].contentRect.width));if(root.current)observer.observe(root.current);return()=>observer.disconnect();},[]);
    React.useLayoutEffect(()=>{const element=scroller.current;if(!element)return;element.scrollTop=positions.current[view]||0;return()=>{positions.current[view]=element.scrollTop;};},[view]);
    async function boot(v){
      const status=await service.status(id);if(!valid(v))return;patch(status);setSettings(!status.connected);if(!status.connected)return;
      if(!online)throw Error('连接后才能核对知识库权限，离线不展示缓存资料');
      const catalog=await service.read(id,{op:'catalog'},{signal:controller.current.signal});if(!valid(v))return;
      patch({catalog:catalog.sources,libraries:catalog.libraries,detail:null,search:null,listing:null,latest:[],recent:state.recent.filter(doc=>catalog.sources.some(s=>s.source_id===doc.sourceId))});setView('home');setCacheMode(false);
      const work=catalog.sources.find(s=>s.source_id==='recordings');
      if(work?.state==='ready'){try{const latest=await service.read(id,{op:'list',source:work.source_id,limit:4,offset:0},{signal:controller.current.signal});if(valid(v))patch({latest:latest.results.map(note=>({...note,sourceId:work.source_id}))});}catch(e){if(e.denied)throw e;if(valid(v))patch({notice:'最近工作资料暂未载入，可先浏览已开通的知识库'});}}
    }
    React.useEffect(()=>{
      controller.current.abort();controller.current=new AbortController();const v=++epoch.current;setState({...empty,pending:!!id});setQuery('');setScope('all');setView('home');setCacheMode(false);busy.current=false;
      if(id)void boot(v).catch(e=>{if(valid(v))patch({error:e.message,...(e.denied?{catalog:[],latest:[],recent:[]}: {})});}).finally(()=>{if(valid(v))patch({pending:false});});
      return()=>{controller.current.abort();epoch.current++;};
    },[identityKey,connection.generation,online]);
    async function run(fn){
      if(!id||busy.current)return;busy.current=true;const v=++epoch.current;patch({pending:true,error:'',notice:''});
      try{await fn(v);if(valid(v))patch(await service.status(id));}
      catch(e){if(valid(v))patch({error:e.message,...(e.denied?{catalog:[],listing:null,detail:null,latest:[],recent:[],search:null}: {})});}
      finally{if(valid(v)){busy.current=false;patch({pending:false});}}
    }
    async function loadList(source,offset,v,mode=false){
      const sourceInfo=state.catalog.find(item=>item.source_id===source);
      if(!mode&&sourceInfo?.state!=='ready'){if(valid(v)){patch({source,listing:null,detail:null,notice:'这个知识库尚未完成同步，暂不能读取资料'});setView('collection');setCacheMode(false);}return;}
      const listing=await service.read(id,{op:'list',source,limit:20,offset},{signal:controller.current.signal,cacheOnly:mode});
      if(valid(v)){patch({source,listing,detail:null});setView('collection');setCacheMode(mode);}
    }
    const openCollection=source=>run(v=>loadList(source,0,v));
    const openDocument=doc=>run(async v=>{
      const source=doc.sourceId||state.source,detail=await service.read(id,{op:'get',source,id:doc.id},{signal:controller.current.signal,cacheOnly:view==='collection'&&cacheMode});
      if(valid(v)){setReturnView(view);setView('reading');patch({detail,source,recent:[{...doc,sourceId:source},...state.recent.filter(item=>item.id!==doc.id||item.sourceId!==source)].slice(0,6)});}
    });
    const smallAction=(label,onClick,props={})=>action(label,onClick,{...props,style:{...btn,minHeight:36,fontSize:14,padding:'6px 12px',...props.style}});
    const sourceMeta=state.catalog.find(s=>s.source_id===state.source),sourceName=sourceMeta?.display_name||SOURCES[state.source]||'知识资料';
    const getName=source=>state.catalog.find(s=>s.source_id===source)?.display_name||SOURCES[source];
    const total=state.catalog.reduce((count,s)=>count+(Number.isFinite(s.documents)?s.documents:0),0);
    const searchForm=(large=false,collection=false)=>h('form',{'aria-label':'知识搜索',onSubmit:e=>{e.preventDefault();if(!query.trim())return;void run(async v=>{
      const catalog=collection?state.catalog.filter(s=>s.source_id===state.source):scope==='all'?state.catalog:state.catalog.filter(s=>s.source_id===scope);
      if(collection)setScope(state.source);
      const search=await searchLibraries(service,id,catalog,query.trim(),{signal:controller.current.signal});
      if(valid(v)){patch({search,detail:null});setView('search');if(search.unavailable.length)patch({notice:`以下知识库暂未返回结果：${search.unavailable.join('、')}`});}
    });},style:{display:'flex',alignItems:'center',gap:12,padding:large?'10px 12px 10px 24px':'8px 10px 8px 16px',background:palette.surface,border,borderRadius:large?18:12,boxShadow:large?'0 6px 24px #00000005':undefined,maxWidth:large?840:720,width:'100%'}},
      h('span',{style:{color:palette.muted,display:'flex'}},icon(h,'search',large?22:18)),h('input',{type:'search','aria-label':'搜索知识库',placeholder:collection?'在这个知识库中查找':'搜索计划、会议、研究资料…',value:query,maxLength:100,onChange:e=>setQuery(e.target.value),style:{...controlInput,border:0,padding:'8px 0',background:'transparent',fontSize:large?18:15,minHeight:large?42:32,flex:1}}),
      !compact&&!collection?h('select',{'aria-label':'搜索范围',value:scope,onChange:e=>setScope(e.target.value),style:{font:'inherit',fontSize:13,color:palette.muted,border:0,background:palette.surface,maxWidth:150}},h('option',{value:'all'},'全部知识库'),...state.catalog.map(s=>h('option',{key:s.source_id,value:s.source_id},getName(s.source_id)))):null,
      h('button',{type:'submit',disabled:state.pending||!query.trim(),style:{...btn,background:palette.text,color:palette.surface,borderColor:'transparent',borderRadius:large?12:8,minHeight:large?44:36,padding:large?'10px 22px':'6px 14px'}},state.pending?'查找中':'搜索'));
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


    const docCard=doc=>h('button',{key:`${doc.sourceId||state.source}:${doc.id}`,type:'button',onClick:()=>openDocument(doc),disabled:state.pending,'aria-label':`阅读 ${doc.title||'未命名资料'}`,style:{...btn,whiteSpace:'normal',textAlign:'left',display:'flex',flexDirection:'column',minWidth:0,minHeight:196,padding:24,borderRadius:16,background:palette.surface,boxShadow:'0 2px 6px #00000002'}},
      h('span',{style:{display:'flex',gap:8,alignItems:'center',marginBottom:20,color:collectionTheme(doc.sourceId||state.source).accent}},icon(h,'document',18),h('span',{style:{fontSize:12,color:palette.muted}},getName(doc.sourceId||state.source))),
      h('strong',{style:{fontSize:18,fontWeight:500,lineHeight:1.55,overflowWrap:'anywhere',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},doc.title||'未命名资料'),
      h('span',{style:{...muted,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',margin:'12px 0 24px'}},documentPreview(doc.excerpt)||'打开查看完整正文与来源'),
      h('span',{style:{...muted,fontSize:12,marginTop:'auto',display:'flex',justifyContent:'space-between',width:'100%'}},h('span',null,displayDate(doc.updated_at)),h('span',null,'阅读 ↗')));
    const shelf=h('section',{'aria-label':'知识书架'},h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:16,marginBottom:24}},h('h2',{style:{fontSize:22,fontWeight:500,margin:0}},'你的知识书架'),h('span',{style:{...muted,fontSize:13}},`${state.catalog.length} 个集合 · ${total.toLocaleString('zh-CN')} 份资料`)),
      h('div',{style:{display:'grid',gridTemplateColumns:`repeat(${compact?2:width<1100?3:5},minmax(0,1fr))`,gap:compact?18:28}},...state.catalog.map(source=>h('button',{key:source.source_id,type:'button',onClick:()=>openCollection(source.source_id),disabled:state.pending,'aria-label':`打开知识库 ${getName(source.source_id)}`,style:{...btn,minWidth:0,textAlign:'left',whiteSpace:'normal',border:0,background:'transparent',padding:0,display:'flex',flexDirection:'column',justifyContent:'flex-start'}},collectionCover(h,{source:source.source_id,title:getName(source.source_id),narrow:compact}),h('span',{style:{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',width:'100%',padding:'18px 4px 6px'}},h('strong',{style:{fontSize:16,fontWeight:500,lineHeight:1.5}},getName(source.source_id)),h('span',{style:{...muted,fontSize:13,whiteSpace:'nowrap'}},`${source.documents} 份`)),h('span',{style:{...muted,fontSize:12,display:'block',padding:'0 4px'}},sourceStatus(source))))));
    const home=h('div',{'data-knowledge-view':'home',style:{maxWidth:1500,width:'100%',margin:'0 auto',padding:compact?'32px 20px 48px':'44px 48px 64px'}},
      h('section',{style:{padding:compact?'8px 0 40px':'16px 0 52px',borderBottom:border,marginBottom:40}},h('p',{style:{...muted,fontSize:14,margin:'0 0 16px'}},'OPCB 企业知识'),h('h1',{style:{fontSize:compact?34:48,fontWeight:500,lineHeight:1.25,letterSpacing:'-.02em',margin:'0 0 18px',maxWidth:860}},'今天，要找什么资料？'),h('p',{style:{...muted,fontSize:16,margin:'0 0 28px',lineHeight:1.8}},'从会议、计划与研究里，找到这次工作要用的知识。'),searchForm(true)),
      state.pending&&!state.catalog.length?h('p',{role:'status',style:muted},'正在打开你的知识空间…'):shelf,
      !state.pending&&!state.catalog.length?h('div',{style:{padding:'32px 0'}},h('h2',{style:{fontSize:22,fontWeight:500}},'等待开通知识库'),h('p',{style:muted},'你的身份已连接。管理员开通个人权限后，所属 Agent 会一起获得读取权限。')):null,
      state.recent.length?h('section',{'aria-label':'最近阅读',style:{marginTop:48}},h('h2',{style:{fontSize:22,fontWeight:500,margin:'0 0 24px'}},'本次最近阅读'),h('div',{style:{display:'grid',gridTemplateColumns:compact?'1fr':'repeat(3,minmax(0,1fr))',gap:20}},...state.recent.slice(0,3).map(docCard))):null,
      state.latest.length?h('section',{'aria-label':'最近工作资料',style:{marginTop:48}},h('div',{style:{display:'flex',justifyContent:'space-between',gap:16,alignItems:'baseline',marginBottom:24}},h('h2',{style:{fontSize:22,fontWeight:500,margin:0}},'最近的工作资料'),smallAction('查看全部 →',()=>openCollection('recordings'),{disabled:state.pending,style:{border:0,background:'transparent'}})),h('div',{style:{display:'grid',gridTemplateColumns:compact?'1fr':`repeat(${width<1100?2:4},minmax(0,1fr))`,gap:20}},...state.latest.map(docCard))):null,
      h('p',{style:{...muted,fontSize:13,margin:'40px 0 0',borderTop:border,paddingTop:24}},'已开通的知识，你的 Agent 也能读取。无需保持页面打开。'));
    const collection=h('div',{'data-knowledge-view':'collection',style:{maxWidth:1440,width:'100%',margin:'0 auto',padding:compact?'28px 20px 48px':'40px 48px 64px'}},
      h('section',{style:{display:'grid',gridTemplateColumns:compact?'1fr':'minmax(0,1fr) 280px',gap:40,alignItems:'center',marginBottom:40,paddingBottom:40,borderBottom:border}},h('div',null,h('p',{style:{...muted,fontSize:13,margin:'0 0 12px'}},collectionTheme(state.source).label),h('h1',{style:{fontSize:compact?30:40,fontWeight:500,lineHeight:1.3,margin:'0 0 16px'}},sourceName),h('p',{style:{...muted,fontSize:16,maxWidth:650,margin:'0 0 20px'}},collectionTheme(state.source).description),h('p',{style:{...muted,fontSize:13}},`${sourceMeta?.documents??0} 份资料 · ${sourceMeta?sourceStatus(sourceMeta):''}`)),!compact?collectionCover(h,{source:state.source,title:sourceName,compact:true}):null),
      h('div',{style:{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',marginBottom:28}},h('div',{style:{minWidth:0,flex:'1 1 340px'}},searchForm(false,true)),h('label',{style:{...muted,fontSize:14,display:'flex',alignItems:'center',gap:8}},h('input',{type:'checkbox',checked:cacheMode,disabled:state.pending,onChange:e=>{const value=e.target.checked;void run(v=>loadList(state.source,0,v,value));}}),'本机缓存')),
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:20}},h('h2',{style:{fontSize:20,fontWeight:500,margin:0}},cacheMode?'已缓存的资料':'最近更新'),h('span',{style:{...muted,fontSize:12}},'标题 · 摘要 · 来源')),
      h('section',{'aria-label':'资料集合',style:{display:'grid',gridTemplateColumns:compact?'1fr':`repeat(${width<1180?2:3},minmax(0,1fr))`,gap:20}},...(state.listing?.results||[]).map(docCard)),
      !state.listing?.results?.length?h('p',{style:{...muted,padding:'32px 0'}},cacheMode?'这个集合还没有可用缓存。':sourceMeta?.state!=='ready'?'来源待同步，完成后这里会出现资料。':'这里暂时没有资料，试试其他知识库。'):null,
      h('div',{style:{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginTop:28}},h('div',{style:{display:'flex',gap:8}},state.listing?.offset>0?smallAction('上一页',()=>run(v=>loadList(state.source,Math.max(0,state.listing.offset-20),v,cacheMode)),{disabled:state.pending}):null,Number.isInteger(state.listing?.next_offset)?smallAction('下一页',()=>run(v=>loadList(state.source,state.listing.next_offset,v,cacheMode)),{disabled:state.pending}):null),state.listing?.results?.length?smallAction('缓存本页正文',()=>run(async v=>{for(const doc of state.listing.results){if(!valid(v))return;await service.read(id,{op:'get',source:state.source,id:doc.id},{signal:controller.current.signal});}if(valid(v))patch({notice:'本页正文已缓存，读取时仍核对当前权限'});}),{disabled:state.pending||!online}):null));
    const results=h('div',{'data-knowledge-view':'search',style:{maxWidth:1440,width:'100%',margin:'0 auto',padding:compact?'28px 20px':'40px 48px'}},h('h1',{style:{fontSize:compact?30:40,fontWeight:500,lineHeight:1.35,margin:'0 0 16px'}},`查找“${state.search?.query||''}”`),h('p',{style:{...muted,margin:'0 0 28px'}},`${state.search?.documents.length||0} 条已返回结果 · 每个知识库最多显示 10 条`),searchForm(),h('section',{'aria-label':'搜索结果',style:{display:'grid',gridTemplateColumns:compact?'1fr':`repeat(${width<1180?2:3},minmax(0,1fr))`,gap:20,marginTop:32}},...(state.search?.documents||[]).map(docCard)),!state.search?.documents.length?h('p',{style:{...muted,marginTop:40}},'没有找到匹配资料，试试更短的关键词。'):null);
    const reading=h('div',{'data-knowledge-view':'reading',style:{padding:compact?'28px 20px 64px':'48px 48px 80px'}},state.detail?h(Reader,{note:state.detail.note,cache:state.detail.cache,sourceName,compact}):null);
    return h('main',{ref:root,'data-knowledge-v2':true,style:{width:'100%',height:'100%',minHeight:0,display:'flex',flexDirection:'column',overflow:'hidden',color:palette.text,fontFamily:'inherit',fontSize:16,background:palette.surface}},
      h('header',{style:{padding:compact?'16px 20px':'18px 40px',borderBottom:border,display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}},
        h('div',{style:{display:'flex',alignItems:'center',gap:16,minWidth:0}},view!=='home'?smallAction(h('span',{style:{display:'flex',gap:6,alignItems:'center'}},icon(h,'arrow',16),view==='reading'?'返回资料':'知识空间'),()=>{if(view==='reading'){patch({detail:null});setView(returnView);}else void run(v=>boot(v));},{disabled:state.pending,style:{border:0,background:'transparent',padding:'6px 0'}}):h('span',{style:{fontSize:16,fontWeight:500,display:'flex',gap:10,alignItems:'center'}},icon(h,'book',21),'知识空间'),view==='reading'?h('span',{style:{...muted,fontSize:13}},sourceName):null),
        h('div',{style:{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}},!compact?h('span',{style:{...muted,fontSize:12}},state.connected?(online?'个人身份已连接':'连接已离线'):'等待连接'):null,smallAction('连接与缓存',()=>setSettings(!settings),{'aria-expanded':settings,style:{border:0,background:palette.inset,borderRadius:20,padding:'7px 16px'}}))),
      h('div',{ref:scroller,style:{overflowY:'auto',flex:1,minHeight:0},'aria-busy':state.pending},identityPanel,state.error?h('p',{role:'alert',style:{margin:'20px 32px',padding:'16px 20px',borderLeft:'3px solid var(--text-danger, #a33)',background:palette.inset}},state.error):null,state.notice?h('p',{role:'status',style:{...muted,margin:'16px 32px'}},state.notice):null,state.connected?(view==='reading'?reading:view==='collection'?collection:view==='search'?results:home):null));
  }
  ctx.pages.register({icon:"data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItYm9va3MiCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTUgNWExIDEgMCAwIDEgMSAtMWgyYTEgMSAwIDAgMSAxIDF2MTRhMSAxIDAgMCAxIC0xIDFoLTJhMSAxIDAgMCAxIC0xIC0xbDAgLTE0IiAvPgogIDxwYXRoIGQ9Ik05IDVhMSAxIDAgMCAxIDEgLTFoMmExIDEgMCAwIDEgMSAxdjE0YTEgMSAwIDAgMSAtMSAxaC0yYTEgMSAwIDAgMSAtMSAtMWwwIC0xNCIgLz4KICA8cGF0aCBkPSJNNSA4aDQiIC8+CiAgPHBhdGggZD0iTTkgMTZoNCIgLz4KICA8cGF0aCBkPSJNMTMuODAzIDQuNTZsMi4xODQgLS41M2MuNTYyIC0uMTM1IDEuMTMzIC4xOSAxLjI4MiAuNzMybDMuNjk1IDEzLjQxOGExLjAyIDEuMDIgMCAwIDEgLS42MzQgMS4yMTlsLS4xMzMgLjA0MWwtMi4xODQgLjUzYy0uNTYyIC4xMzUgLTEuMTMzIC0uMTkgLTEuMjgyIC0uNzMybC0zLjY5NSAtMTMuNDE4YTEuMDIgMS4wMiAwIDAgMSAuNjM0IC0xLjIxOWwuMTMzIC0uMDQxIiAvPgogIDxwYXRoIGQ9Ik0xNCA5bDQgLTEiIC8+CiAgPHBhdGggZD0iTTE2IDE2bDMuOTIzIC0uOTgiIC8+Cjwvc3ZnPg==",id:'knowledge',title:'知识库',primary:true,placement:'dock',layout:'workspace',component:Page});
}
