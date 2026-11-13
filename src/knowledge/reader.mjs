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
 const muted={color:'var(--text-subtle, #70747b)',fontSize:14,lineHeight:1.6};
 const border='1px solid var(--border-standard, #dfe2e6)';
 const btn={minHeight:36,border,borderRadius:8,padding:'6px 12px',font:'inherit',color:'inherit',background:'var(--surface-panel, #fff)',cursor:'pointer'};
 const action=(text,onClick,props={})=>h('button',{type:'button',onClick,style:btn,...props},text);
 const inline=text=>String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https:\/\/[^\s)]+\))/g).map((part,i)=>{
   if(part.startsWith('**')&&part.endsWith('**'))return h('strong',{key:i,style:{fontWeight:600}},part.slice(2,-2));
   if(part.startsWith('`')&&part.endsWith('`'))return h('code',{key:i,style:{fontSize:'0.9em',background:'var(--surface-inset, #f3f4f5)',padding:'2px 4px',borderRadius:4}},part.slice(1,-1));
   const link=/^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);return link&&safeURL(link[2])?h('a',{key:i,href:safeURL(link[2]),target:'_blank',rel:'noopener noreferrer'},link[1]):part;
 });
 const date=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleString('zh-CN',{hour12:false});};
  function Reader({ note, cache, sourceName }) {
    const blocks = React.useMemo(() => markdownBlocks(note.content), [note.content]);
    return h("article", { style: { maxWidth: 800, margin: "0 auto", width: "100%", overflowWrap: "anywhere" } },
      h("p", { style: muted }, `${sourceName || "知识资料"} · ${date(note.updated_at)}`),
      h("h1", { style: { fontSize: 28, lineHeight: 1.5, fontWeight: 600, margin: "12px 0 16px" } }, note.title || "未命名资料"),
      h("p", { role: "status", style: muted }, cache?.cached ? `本机缓存 · ${date(cache.savedAt)} 保存，可能不是最新版本` : cache?.saved ? "已从知识源读取 · 正文已加入本机缓存" : "已从知识源读取 · 本机缓存未保存"),
      safeURL(note.url) ? h("a", { href: safeURL(note.url), target: "_blank", rel: "noopener noreferrer", style: { fontSize: 14 } }, "打开原始来源") : null,
      blocks.some(b => b.kind === "heading") ? h("details", { style: { margin: "24px 0", borderTop: border, borderBottom: border, padding: "12px 0" } }, h("summary", { style: { cursor: "pointer", ...muted } }, "正文目录"), ...blocks.map((b, i) => b.kind === "heading" ? h("a", { key: i, href: `#knowledge-section-${i}`, style: { display: "block", padding: "4px 0", paddingLeft: (b.level - 1) * 12, fontSize: 14 } }, b.text) : null)) : null,
      h("div", { style: { fontSize: 18, lineHeight: 1.9, paddingBottom: 48 } }, ...blocks.map((b, i) => {
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
    const [state,setState]=React.useState({connected:false,catalog:[],source:'recordings',listing:null,detail:null,pending:false,error:'',notice:'',cachedDocuments:0});
    const [settings,setSettings]=React.useState(false),[channel,setChannel]=React.useState(''),[query,setQuery]=React.useState(''),[cacheMode,setCacheMode]=React.useState(false),[width,setWidth]=React.useState(1200);
    const root=React.useRef(null),epoch=React.useRef(0),controller=React.useRef(new AbortController()),busy=React.useRef(false);
    let id;try{id=pageIdentity(connection);}catch{id=null;}
    const identityKey=id?.partition,online=connection.status==='ready'&&!connection.cached;
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
      if(!online)throw Error('当前离线。需要先核对服务器权限，暂不展示缓存正文');
      const catalog=await service.read(id,{op:'catalog'},{signal:controller.current.signal});if(!valid(v))return;
      patch({catalog:catalog.sources,libraries:catalog.libraries});const source=catalog.sources.find(s=>s.source_id==='recordings')?.source_id||catalog.sources[0]?.source_id;
      if(source)await loadList(source,0,v,false);else patch({notice:'当前身份尚未开通知识库，请管理员在知识库管理面板授权'});
    }
    React.useEffect(()=>{
      controller.current.abort();controller.current=new AbortController();const v=++epoch.current;
      setState({connected:false,catalog:[],source:'recordings',listing:null,detail:null,pending:false,error:'',notice:'',cachedDocuments:0});setQuery('');setCacheMode(false);busy.current=false;
      if(id)void boot(v).catch(e=>{if(valid(v))patch({error:e.message});});
      return()=>{controller.current.abort();epoch.current++;};
    },[identityKey,connection.generation,online]);
    async function run(fn){
      if(!id||busy.current)return;busy.current=true;const v=++epoch.current;patch({pending:true,error:'',notice:''});
      try{await fn(v);if(valid(v))patch(await service.status(id));}
      catch(e){if(valid(v)){patch({error:e.message,...(e.denied?{catalog:[],listing:null,detail:null}: {})});}}
      finally{if(valid(v)){busy.current=false;patch({pending:false});}}
    }
    const controlStyle={...btn,width:'100%',boxSizing:'border-box'};
    const sourceMeta=state.catalog.find(s=>s.source_id===state.source),narrow=width<1000;
    return h('main',{ref:root,'data-knowledge-v2':true,style:{width:'100%',height:'100%',minHeight:0,overflow:'auto',boxSizing:'border-box',padding:24,color:'var(--text-standard, #20242a)',fontFamily:'inherit',fontSize:16}},
      h('header',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16,marginBottom:20}},
        h('div',null,h('h1',{style:{fontSize:26,fontWeight:600,margin:0}},'企业知识库'),h('p',{style:{...muted,margin:'8px 0 0'}},'工作资料、项目知识与计划，供你和 Agent 读取')),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:8}},state.connected?action('刷新',()=>run(v=>boot(v)),{disabled:state.pending||!online}):null,action(settings?'收起身份设置':'身份与缓存',()=>setSettings(!settings)))),
      h('div',{role:'status',style:{display:'flex',flexWrap:'wrap',gap:'8px 24px',borderTop:border,borderBottom:border,padding:'12px 0',...muted}},
        h('span',null,state.connected?'已绑定当前个人身份':'尚未绑定本机身份'),h('span',null,id?`身份 ${id.owner.slice(0,8)}…${id.owner.slice(-6)}`:'等待 Buzz 身份'),h('span',null,'Agent 继承个人读取权限'),h('span',null,`已缓存 ${state.cachedDocuments||0} 篇正文`)),
      (settings||!state.connected)?h('section',{'aria-label':'身份与缓存设置',style:{maxWidth:760,border,borderRadius:12,padding:20,margin:'20px 0'}},
        h('h2',{style:{fontSize:20,margin:'0 0 12px'}},'使用 Buzz 身份，无需知识库密码'),
        h('p',{style:muted},'首次在这台电脑绑定一次原生身份。之后自动验签，服务器按当前个人权限决定能读哪些知识库；新增 Agent 无需逐个登记。'),
        !state.connected?h(React.Fragment,null,
          h('p',{style:muted},'选择一个你可写的私人对话，保存一条只含公钥与随机挑战的原生身份绑定记录，不包含知识正文或私钥。也可以让本机 Agent 使用连接工具完成只读绑定。'),
          h('label',{style:{display:'block',margin:'12px 0'}},'保存绑定记录的私人对话',h('select',{'aria-label':'身份绑定私人对话',style:{...controlStyle,display:'block',marginTop:8},value:channel||privateChannels[0]?.id||'',onChange:e=>setChannel(e.target.value)},...privateChannels.map(c=>h('option',{key:c.id,value:c.id},c.name||'私人对话')))),
          action('绑定当前 Buzz 身份',()=>run(async v=>{if(!online)throw Error('请先连接 Buzz 社区');const selected=channel||privateChannels[0]?.id;if(!selected)throw Error('尚无可写的私人对话，请先在 Buzz 中建立一个');await service.bind(id,content=>publishPersonalBinding(connection.session,selected,content,{signal:controller.current.signal}),{signal:controller.current.signal});if(valid(v)){setSettings(false);await boot(v);}}),{disabled:state.pending||!online||!id||!privateChannels.length})):
          h('div',{style:{display:'flex',flexWrap:'wrap',gap:12}},action('清除正文缓存',()=>run(async()=>{await service.clearCache(id);patch({listing:null,detail:null,notice:'已清除本机正文缓存，身份绑定保留'});}),{disabled:state.pending}),action('移除本机身份绑定与缓存',()=>run(async()=>{await service.forget(id);patch({connected:false,catalog:[],listing:null,detail:null});setSettings(true);}),{disabled:state.pending})),
        h('p',{style:muted},'缓存只保存在本机并加密。读取缓存正文仍需核对服务器当前权限；离线不绕过鉴权。')):null,
      state.error?h('p',{role:'alert',style:{borderLeft:'3px solid var(--text-danger, #a33)',padding:'12px 16px',margin:'16px 0'}},state.error):null,
      state.notice?h('p',{role:'status',style:muted},state.notice):null,
      state.connected?h('div',{style:{display:'grid',gridTemplateColumns:narrow?'minmax(0,1fr)':'196px 280px minmax(0,1fr)',gap:24,alignItems:'start',marginTop:24}},
        h('aside',{'aria-label':'知识源目录'},h('h2',{style:{...muted,fontWeight:500,margin:'0 0 12px'}},'知识库目录'),h('nav',{style:{display:'flex',flexDirection:narrow?'row':'column',flexWrap:'wrap',gap:4}},...libraryRows(state.libraries).map(lib=>{const sources=state.catalog.filter(s=>s.library===lib.id);return sources.length?sources.map(s=>action(s.display_name||SOURCES[s.source_id]||s.source,()=>run(v=>loadList(s.source_id,0,v)),{key:s.source_id,disabled:state.pending,'aria-pressed':s.source_id===state.source,style:{...btn,textAlign:'left',paddingLeft:narrow?12:12+Math.max(0,lib.depth-1)*12,borderColor:'transparent',background:s.source_id===state.source?'var(--surface-inset, #f1f2f4)':'transparent'}})):h('p',{key:lib.id,style:{...muted,fontWeight:500,margin:'12px 0 4px',paddingLeft:Math.max(0,lib.depth-1)*12}},lib.name);})),
          sourceMeta?h('p',{style:{...muted,marginTop:16}},`${sourceMeta.documents} 篇 · ${sourceMeta.state==='ready'?'来源同步正常':'来源同步待检查'}`):null,
          h('label',{style:{...muted,display:'block',marginTop:20}},h('input',{type:'checkbox',checked:cacheMode,disabled:state.pending,onChange:e=>{const next=e.target.checked;setCacheMode(next);void run(v=>loadList(state.source,0,v,next));}}),' 使用本机缓存（仍需鉴权）')),
        h('section',{'aria-label':'文档列表',style:{minWidth:0}},h('form',{style:{display:'flex',gap:8,marginBottom:16},onSubmit:e=>{e.preventDefault();void run(async v=>{const listing=await service.read(id,{op:'search',source:state.source,query:query.trim(),limit:20},{signal:controller.current.signal,cacheOnly:cacheMode});if(valid(v))patch({listing,detail:null});});}},
          h('input',{type:'search','aria-label':'搜索知识库',placeholder:'搜索资料、计划或关键词',value:query,maxLength:100,onChange:e=>setQuery(e.target.value),style:{...controlStyle,minWidth:0}}),h('button',{type:'submit',style:btn,disabled:state.pending||!query.trim()},'搜索')),
          h('p',{style:muted},state.listing?.cache?.cached?`缓存于 ${date(state.listing.cache.savedAt)}`:state.listing?.query?`“${state.listing.query}”的结果`:'最近更新'),
          ...(state.listing?.results||[]).map(doc=>action(h(React.Fragment,null,h('strong',{style:{display:'block',fontSize:16,fontWeight:500,lineHeight:1.6}},doc.title||'未命名资料'),h('span',{style:{...muted,display:'block',margin:'8px 0',maxHeight:64,overflow:'hidden',whiteSpace:'pre-wrap'}},String(doc.excerpt||'').slice(0,100)),h('span',{style:{...muted,fontSize:12}},date(doc.updated_at))),()=>run(async v=>{const detail=await service.read(id,{op:'get',source:state.source,id:doc.id},{signal:controller.current.signal,cacheOnly:cacheMode});if(valid(v))patch({detail});}),{key:doc.id,disabled:state.pending,'aria-pressed':state.detail?.note?.id===doc.id,style:{...controlStyle,textAlign:'left',padding:'16px 12px',marginBottom:8,borderColor:state.detail?.note?.id===doc.id?'var(--text-standard, #34383e)':'var(--border-standard, #dfe2e6)',overflowWrap:'anywhere'}})),
          state.listing&&!state.listing.results.length?h('p',{style:muted},'没有匹配资料，试试其他关键词或知识库'):null,
          h('div',{style:{display:'flex',flexWrap:'wrap',gap:8,margin:'16px 0'}},state.listing?.offset>0?action('上一页',()=>run(v=>loadList(state.source,Math.max(0,state.listing.offset-20),v)),{disabled:state.pending}):null,Number.isInteger(state.listing?.next_offset)?action('下一页',()=>run(v=>loadList(state.source,state.listing.next_offset,v)),{disabled:state.pending}):null,
            state.listing?.results?.length?action('缓存本页正文',()=>run(async v=>{let count=0;for(const doc of state.listing.results){if(!valid(v))return;await service.read(id,{op:'get',source:state.source,id:doc.id},{signal:controller.current.signal});count++;}if(valid(v))patch({notice:`已缓存本页 ${count} 篇正文`});}),{disabled:state.pending||!online}):null)),
        h('section',{'aria-label':'正文阅读',style:{minWidth:0,padding:narrow?'20px 0':'0 8px 0 24px',borderLeft:narrow?undefined:border}},state.detail?h(Reader,{note:state.detail.note,cache:state.detail.cache,sourceName:sourceMeta?.display_name||SOURCES[state.source]}):h('div',{style:{padding:'32px 0',maxWidth:600}},h('h2',{style:{fontSize:22,fontWeight:500}},'选择一份资料开始阅读'),h('p',{style:muted},'标题、段落、计划清单和来源在这里完整呈现。Agent 可以直接查询，不需要这个页面保持打开。')))):null);
  }
  ctx.pages.register({icon:"data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItYm9va3MiCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTUgNWExIDEgMCAwIDEgMSAtMWgyYTEgMSAwIDAgMSAxIDF2MTRhMSAxIDAgMCAxIC0xIDFoLTJhMSAxIDAgMCAxIC0xIC0xbDAgLTE0IiAvPgogIDxwYXRoIGQ9Ik05IDVhMSAxIDAgMCAxIDEgLTFoMmExIDEgMCAwIDEgMSAxdjE0YTEgMSAwIDAgMSAtMSAxaC0yYTEgMSAwIDAgMSAtMSAtMWwwIC0xNCIgLz4KICA8cGF0aCBkPSJNNSA4aDQiIC8+CiAgPHBhdGggZD0iTTkgMTZoNCIgLz4KICA8cGF0aCBkPSJNMTMuODAzIDQuNTZsMi4xODQgLS41M2MuNTYyIC0uMTM1IDEuMTMzIC4xOSAxLjI4MiAuNzMybDMuNjk1IDEzLjQxOGExLjAyIDEuMDIgMCAwIDEgLS42MzQgMS4yMTlsLS4xMzMgLjA0MWwtMi4xODQgLjUzYy0uNTYyIC4xMzUgLTEuMTMzIC0uMTkgLTEuMjgyIC0uNzMybC0zLjY5NSAtMTMuNDE4YTEuMDIgMS4wMiAwIDAgMSAuNjM0IC0xLjIxOWwuMTMzIC0uMDQxIiAvPgogIDxwYXRoIGQ9Ik0xNCA5bDQgLTEiIC8+CiAgPHBhdGggZD0iTTE2IDE2bDMuOTIzIC0uOTgiIC8+Cjwvc3ZnPg==",id:'knowledge',title:'知识库',primary:true,placement:'dock',layout:'workspace',component:Page});
}
