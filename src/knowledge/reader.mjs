import {palette,quiet,button, input as controlInput,documentPreview,displayDate,icon} from './presentation.mjs';
import { SOURCES, libraryRows, createIdentityClient, pageIdentity, publishPersonalBinding, registerAgentTools } from './identity-client.mjs';
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
  function Reader({ note, cache, sourceName }) {
    const blocks = React.useMemo(() => {const parsed=markdownBlocks(note.content);return parsed[0]?.kind==='heading'&&parsed[0].text.trim()===String(note.title||'').trim()?parsed.slice(1):parsed;}, [note.content,note.title]);
    return h("article", { style: { maxWidth: 800, margin: "0 auto", width: "100%", overflowWrap: "anywhere" } },
      h("p", { style: muted }, `${sourceName || "知识资料"} · ${date(note.updated_at)}`),
      h("h1", { style: { fontSize: 30, lineHeight: 1.45, fontWeight: 600, margin: "12px 0 16px" } }, note.title || "未命名资料"),
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
    const empty={connected:false,catalog:[],libraries:[],source:'recordings',listing:null,detail:null,pending:false,error:'',notice:'',cachedDocuments:0};
    const [state,setState]=React.useState(empty),[settings,setSettings]=React.useState(false),[channel,setChannel]=React.useState(''),[query,setQuery]=React.useState(''),[cacheMode,setCacheMode]=React.useState(false),[width,setWidth]=React.useState(1200);
    const root=React.useRef(null),epoch=React.useRef(0),controller=React.useRef(new AbortController()),busy=React.useRef(false);
    let id;try{id=pageIdentity(connection);}catch{id=null;}
    const identityKey=id?.partition,online=connection.status==='ready'&&!connection.cached,wide=width>=1180,compact=width<760;
    const privateChannels=(connection.session?.channels?.list?.().channels||[]).filter(c=>(c.visibility==='private'||c.private)&&!c.readOnly&&!c.cached&&!c.archived);
    const patch=value=>setState(s=>({...s,...value}));
    const valid=v=>v===epoch.current&&!controller.current.signal.aborted;
    React.useEffect(()=>ctx.relay.subscribe(()=>setConnection(ctx.relay.snapshot())),[]);
    React.useEffect(()=>{const o=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));if(root.current)o.observe(root.current);return()=>o.disconnect();},[]);
    async function loadList(source,offset,v,mode=cacheMode){
      const listing=await service.read(id,{op:'list',source,limit:20,offset},{signal:controller.current.signal,cacheOnly:mode});
      if(valid(v)){patch({source,listing,detail:null});setQuery('');}
    }
    async function boot(v){
      const status=await service.status(id);if(!valid(v))return;patch(status);setSettings(!status.connected);
      if(!status.connected)return;
      if(!online)throw Error('当前离线，需要连接后核对知识库权限');
      const catalog=await service.read(id,{op:'catalog'},{signal:controller.current.signal});if(!valid(v))return;
      patch({catalog:catalog.sources,libraries:catalog.libraries});setCacheMode(false);
      const source=catalog.sources.find(s=>s.source_id===state.source)?.source_id||catalog.sources[0]?.source_id;
      if(source)await loadList(source,0,v,false);else patch({notice:'当前身份尚未开通知识库，请管理员授权'});
    }
    React.useEffect(()=>{
      controller.current.abort();controller.current=new AbortController();const v=++epoch.current;
      setState({...empty,pending:!!id});setQuery('');setCacheMode(false);busy.current=false;
      if(id)void boot(v).catch(e=>{if(valid(v))patch({error:e.message});}).finally(()=>{if(valid(v))patch({pending:false});});
      return()=>{controller.current.abort();epoch.current++;};
    },[identityKey,connection.generation,online]);
    async function run(fn){
      if(!id||busy.current)return;busy.current=true;const v=++epoch.current;patch({pending:true,error:'',notice:''});
      try{await fn(v);if(valid(v))patch(await service.status(id));}
      catch(e){if(valid(v))patch({error:e.message,...(e.denied?{catalog:[],listing:null,detail:null}: {})});}
      finally{if(valid(v)){busy.current=false;patch({pending:false});}}
    }
    const sourceMeta=state.catalog.find(s=>s.source_id===state.source),sourceName=sourceMeta?.display_name||SOURCES[state.source]||'知识资料';
    const docCount=state.listing?.results?.length||0;
    const smallAction=(label,onClick,props={})=>action(label,onClick,{...props,style:{...btn,minHeight:36,fontSize:14,padding:'6px 12px',...props.style}});
    const openDocument=doc=>run(async v=>{const detail=await service.read(id,{op:'get',source:state.source,id:doc.id},{signal:controller.current.signal,cacheOnly:cacheMode});if(valid(v))patch({detail});});
    const identityPanel=(settings||!state.connected)?h('section',{'aria-label':'身份与缓存设置',style:{padding:compact?20:32,borderBottom:border,background:palette.inset}},
      h('div',{style:{maxWidth:760}},h('h2',{style:{fontSize:20,fontWeight:500,margin:'0 0 8px'}},state.connected?'本机连接与缓存':'连接你的 Buzz 身份'),
        h('p',{style:muted},state.connected?'已记住本机身份。Agent 可以直接查询，阅读页面无需保持打开。':'首次在这台电脑连接一次。你的 Agent 随个人继承已开通的知识库，无需逐个添加。'),
        !state.connected?h(React.Fragment,null,
          h('label',{style:{...muted,display:'block',margin:'20px 0 12px'}},'保存连接记录的私人对话',h('select',{'aria-label':'身份绑定私人对话',style:{...controlInput,display:'block',marginTop:8},value:channel||privateChannels[0]?.id||'',onChange:e=>setChannel(e.target.value)},...privateChannels.map(c=>h('option',{key:c.id,value:c.id},c.name||'私人对话')))),
          action('绑定当前 Buzz 身份',()=>run(async v=>{if(!online)throw Error('请先连接 Buzz 社区');const selected=channel||privateChannels[0]?.id;if(!selected)throw Error('请先建立可写的私人对话');await service.bind(id,content=>publishPersonalBinding(connection.session,selected,content,{signal:controller.current.signal}),{signal:controller.current.signal});if(valid(v)){setSettings(false);await boot(v);}}),{disabled:state.pending||!online||!id||!privateChannels.length}),
          h('p',{style:{...muted,fontSize:13}},'保存的原生记录仅含设备公钥与随机挑战，不包含私钥或知识正文。')):
          h('div',{style:{display:'flex',flexWrap:'wrap',gap:12,marginTop:16}},smallAction('清除正文缓存',()=>run(async()=>{await service.clearCache(id);patch({listing:null,detail:null,notice:'已清除正文缓存，连接保留'});}),{disabled:state.pending}),h('details',null,h('summary',{style:{...muted,cursor:'pointer',padding:'8px 0'}},'断开本机连接'),h('p',{style:muted},'断开后，本机需要重新绑定。不会关闭你的服务器权限。'),smallAction('移除本机身份绑定与缓存',()=>run(async()=>{await service.forget(id);patch({...empty});setSettings(true);}),{disabled:state.pending}))),
        h('p',{style:{...muted,fontSize:13,marginBottom:0}},'正文缓存仅在本机加密保存；每次读取仍会核对当前权限。'))):null;
    const catalog=h('aside',{'aria-label':'知识源目录',style:{minWidth:0,padding:'24px 16px',overflowY:'auto',borderRight:border,background:palette.inset}},
      h('p',{style:{...muted,margin:'0 12px 20px',fontWeight:500}},'知识库目录'),
      h('nav',null,...libraryRows(state.libraries).map(lib=>{const sources=state.catalog.filter(s=>s.library===lib.id);return sources.length?sources.map(s=>action(h('span',{style:{display:'flex',gap:10,alignItems:'center'}},icon(h,'book',17),h('span',{style:{flex:1}},s.display_name||SOURCES[s.source_id]),h('span',{style:{...muted,fontSize:12,fontVariantNumeric:'tabular-nums'}},s.documents)),()=>run(v=>loadList(s.source_id,0,v)),{key:s.source_id,disabled:state.pending,'aria-pressed':s.source_id===state.source,style:{...btn,display:'block',width:'100%',whiteSpace:'normal',textAlign:'left',borderColor:'transparent',background:s.source_id===state.source?palette.surface:'transparent',marginBottom:4,padding:'10px 12px',fontWeight:s.source_id===state.source?500:400}})):h('p',{key:lib.id,style:{...muted,fontSize:12,margin:'24px 12px 8px',lineHeight:1.6}},lib.name);})),
      h('div',{style:{...muted,fontSize:12,margin:'32px 12px 0',borderTop:border,paddingTop:16}},'按个人授权',h('br'),'Agent 自动继承读取'));
    const listing=h('section',{'aria-label':'文档列表',style:{minWidth:0,minHeight:0,display:'flex',flexDirection:'column',borderRight:wide?border:undefined}},
      h('div',{style:{padding:'24px 24px 16px'}},h('h2',{style:{fontSize:20,fontWeight:500,margin:'0 0 4px'}},sourceName),h('p',{style:{...muted,fontSize:13,margin:0}},state.listing?.query?`“${state.listing.query}” · ${docCount} 条结果`:sourceMeta?`${sourceMeta.documents} 份资料 · ${sourceMeta.state==='ready'?'已同步':'同步待检查'}`:'正在读取目录'),
        h('form',{style:{display:'flex',gap:8,marginTop:20},onSubmit:e=>{e.preventDefault();if(!query.trim())return;void run(async v=>{const value=await service.read(id,{op:'search',source:state.source,query:query.trim(),limit:20},{signal:controller.current.signal,cacheOnly:cacheMode});if(valid(v))patch({listing:value,detail:null});});}},
          h('div',{style:{position:'relative',minWidth:0,flex:1}},h('span',{style:{position:'absolute',left:12,top:12,color:palette.muted}},icon(h,'search',16)),h('input',{type:'search','aria-label':'搜索知识库',placeholder:'搜索当前知识库',value:query,maxLength:100,onChange:e=>setQuery(e.target.value),style:{...controlInput,paddingLeft:36}})),h('button',{type:'submit','aria-label':'搜索',style:{...btn,flexShrink:0},disabled:state.pending||!query.trim()},'搜索')),
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:16}},h('span',{style:{...muted,fontSize:12}},state.listing?.cache?.cached?`缓存 · ${displayDate(state.listing.cache.savedAt)}`:state.listing?.query?'搜索结果':'最近更新'),state.listing?.query?smallAction('返回列表',()=>run(v=>loadList(state.source,0,v)),{disabled:state.pending}):h('label',{style:{...muted,fontSize:12,display:'flex',alignItems:'center',gap:6}},h('input',{type:'checkbox',checked:cacheMode,disabled:state.pending,onChange:e=>{const next=e.target.checked;setCacheMode(next);void run(v=>loadList(state.source,0,v,next));}}),'本机缓存'))),
      h('div',{style:{overflowY:'auto',minHeight:0,flex:1,padding:'0 12px 16px'},'aria-busy':state.pending},
        ...(state.listing?.results||[]).map(doc=>action(h(React.Fragment,null,
          h('span',{style:{display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:12,marginBottom:8}},h('span',{style:{...muted,fontSize:12}},sourceName),h('time',{style:{...muted,fontSize:12,whiteSpace:'nowrap'}},displayDate(doc.updated_at))),
          h('strong',{style:{display:'block',fontSize:16,fontWeight:500,lineHeight:1.65}},doc.title||'未命名资料'),
          h('span',{style:{...muted,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',fontSize:14,marginTop:8}},documentPreview(doc.excerpt)||'打开查看完整正文')),
          ()=>openDocument(doc),{key:doc.id,disabled:state.pending,'aria-pressed':state.detail?.note?.id===doc.id,style:{...btn,width:'100%',textAlign:'left',whiteSpace:'normal',border:'1px solid transparent',borderRadius:10,padding:16,marginBottom:4,background:state.detail?.note?.id===doc.id?palette.inset:'transparent',overflowWrap:'anywhere'}})),
        state.pending&&!state.listing?h('p',{role:'status',style:{...muted,padding:16}},'正在载入资料…'):null,
        state.listing&&!docCount?h('div',{style:{padding:20}},icon(h,'search',24),h('h3',{style:{fontSize:18,fontWeight:500}},'这里暂时没有资料'),h('p',{style:muted},state.listing.query?'换一个关键词，或返回最近更新。':'可以选择其他知识库；同步状态见目录。')):null),
      docCount?h('div',{style:{borderTop:border,padding:'12px 20px',display:'flex',flexWrap:'wrap',alignItems:'center',gap:8}},state.listing?.offset>0?smallAction('上一页',()=>run(v=>loadList(state.source,Math.max(0,state.listing.offset-20),v)),{disabled:state.pending}):null,Number.isInteger(state.listing?.next_offset)?smallAction('下一页',()=>run(v=>loadList(state.source,state.listing.next_offset,v)),{disabled:state.pending}):null,h('span',{style:{...muted,fontSize:12}},`${docCount} 份`),h('details',{style:{marginLeft:'auto'}},h('summary',{style:{...muted,fontSize:12,cursor:'pointer',padding:8}},'缓存选项'),h('p',{style:{...muted,fontSize:12}},'读取缓存也需在线鉴权。'),smallAction('缓存本页正文',()=>run(async v=>{let count=0;for(const doc of state.listing.results){if(!valid(v))return;await service.read(id,{op:'get',source:state.source,id:doc.id},{signal:controller.current.signal});count++;}if(valid(v))patch({notice:`已缓存本页 ${count} 篇正文`});}),{disabled:state.pending||!online}))):null);
    const reading=h('section',{'aria-label':'正文阅读',style:{minWidth:0,minHeight:0,overflowY:'auto',padding:compact?20:wide?'32px 40px':28}},
      state.detail?h(React.Fragment,null,!wide?smallAction(h('span',{style:{display:'flex',alignItems:'center',gap:6}},icon(h,'arrow',16),'返回文档列表'),()=>patch({detail:null}),{disabled:state.pending,style:{marginBottom:24}}):null,h(Reader,{note:state.detail.note,cache:state.detail.cache,sourceName})):
        h('div',{style:{maxWidth:460,margin:'12vh auto',padding:24}},h('div',{style:{color:palette.muted,marginBottom:24}},icon(h,'book',36)),h('h2',{style:{fontSize:24,fontWeight:500,lineHeight:1.5,margin:'0 0 12px'}},'让工作资料成为可用的知识'),h('p',{style:{...muted,fontSize:16,lineHeight:1.8}},'从左侧选择一份会议、计划或研究。完整正文、来源与目录会在这里展开。'),h('p',{style:{...muted,fontSize:13,marginTop:32}},'你的 Agent 可以随时查询，无需保持此页打开。')));
    return h('main',{ref:root,'data-knowledge-v2':true,style:{width:'100%',height:'100%',minHeight:0,overflow:'hidden',boxSizing:'border-box',display:'flex',flexDirection:'column',color:palette.text,fontFamily:'inherit',fontSize:16}},
      h('header',{style:{padding:compact?'20px':'24px 32px',borderBottom:border,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16}},
        h('div',null,h('h1',{style:{fontSize:compact?24:28,fontWeight:600,lineHeight:1.3,margin:0}},'知识库'),h('p',{style:{...muted,margin:'6px 0 0'}},'公司的资料、计划与研究，一处查找与阅读')),
        h('div',{style:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}},state.connected?h('span',{style:{...muted,fontSize:12,paddingRight:8}},online?'已连接个人身份':'连接已离线'):null,state.connected?smallAction('刷新',()=>run(v=>boot(v)),{disabled:state.pending||!online}):null,smallAction(settings?'收起设置':'身份与缓存',()=>setSettings(!settings),{'aria-expanded':settings}))),
      h('div',{style:{flex:1,minHeight:0,display:'flex',flexDirection:'column',overflow:'auto'}},identityPanel,
        state.error?h('p',{role:'alert',style:{margin:'16px 24px',padding:'12px 16px',borderLeft:'3px solid var(--text-danger, #a33)',background:palette.inset}},state.error):null,
        state.notice?h('p',{role:'status',style:{...muted,margin:'12px 24px'}},state.notice):null,
        state.connected?h(React.Fragment,null,compact?h('label',{style:{...muted,padding:'16px 20px',borderBottom:border}},'当前知识库',h('select',{'aria-label':'选择知识库',value:state.source,disabled:state.pending,style:{...controlInput,marginTop:8},onChange:e=>void run(v=>loadList(e.target.value,0,v))},...state.catalog.map(s=>h('option',{key:s.source_id,value:s.source_id},s.display_name||SOURCES[s.source_id])))):null,
          h('div',{style:{display:'grid',gridTemplateColumns:wide?'208px 320px minmax(0,1fr)':compact?'minmax(0,1fr)':'196px minmax(0,1fr)',flex:1,minHeight:compact?420:0}},!compact?catalog:null,wide?listing:state.detail?null:listing,wide||state.detail?reading:null)):null));
  }
  ctx.pages.register({icon:"data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItYm9va3MiCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTUgNWExIDEgMCAwIDEgMSAtMWgyYTEgMSAwIDAgMSAxIDF2MTRhMSAxIDAgMCAxIC0xIDFoLTJhMSAxIDAgMCAxIC0xIC0xbDAgLTE0IiAvPgogIDxwYXRoIGQ9Ik05IDVhMSAxIDAgMCAxIDEgLTFoMmExIDEgMCAwIDEgMSAxdjE0YTEgMSAwIDAgMSAtMSAxaC0yYTEgMSAwIDAgMSAtMSAtMWwwIC0xNCIgLz4KICA8cGF0aCBkPSJNNSA4aDQiIC8+CiAgPHBhdGggZD0iTTkgMTZoNCIgLz4KICA8cGF0aCBkPSJNMTMuODAzIDQuNTZsMi4xODQgLS41M2MuNTYyIC0uMTM1IDEuMTMzIC4xOSAxLjI4MiAuNzMybDMuNjk1IDEzLjQxOGExLjAyIDEuMDIgMCAwIDEgLS42MzQgMS4yMTlsLS4xMzMgLjA0MWwtMi4xODQgLjUzYy0uNTYyIC4xMzUgLTEuMTMzIC0uMTkgLTEuMjgyIC0uNzMybC0zLjY5NSAtMTMuNDE4YTEuMDIgMS4wMiAwIDAgMSAuNjM0IC0xLjIxOWwuMTMzIC0uMDQxIiAvPgogIDxwYXRoIGQ9Ik0xNCA5bDQgLTEiIC8+CiAgPHBhdGggZD0iTTE2IDE2bDMuOTIzIC0uOTgiIC8+Cjwvc3ZnPg==",id:'knowledge',title:'知识库',primary:true,placement:'dock',layout:'workspace',component:Page});
}
