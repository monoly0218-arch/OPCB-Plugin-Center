import {palette,quiet,button,input,shortKey} from './presentation.mjs';
import {createIdentityClient,pageIdentity,publishPersonalBinding,libraryRows} from './identity-client.mjs';
export const inject=['react','pages','relay','host'];
export function effectiveAccess(policy,owner,library){
  if(policy.disabled.includes(owner))return false;
  let granted=false;const seen=new Set();
  while(library!==null){if(seen.has(library))return false;seen.add(library);const lib=policy.libraries.find(l=>l.id===library);if(!lib)return false;const rule=policy.grants.find(g=>g.owner===owner&&g.library===library);if(rule){if(!rule.allow)return false;granted=true;}library=lib.parent;}
  return granted;
}
export function apply(ctx){
  const React=ctx.react,h=React.createElement,service=createIdentityClient(ctx.host,{role:'manage'});
  ctx.effect(()=>()=>service.dispose());
  const border=palette.border,muted=quiet;
  const action=(label,fn,disabled=false,style={})=>h('button',{type:'button',onClick:fn,disabled,style:{...button,...style}},label);
  function Page(){
    const [connection,setConnection]=React.useState(()=>ctx.relay.snapshot()),[policy,setPolicy]=React.useState(null),[bound,setBound]=React.useState(false),[pending,setPending]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
    const [channel,setChannel]=React.useState(''),[owner,setOwner]=React.useState(''),[people,setPeople]=React.useState([]),[loadedNames,setLoadedNames]=React.useState({}),[query,setQuery]=React.useState(''),[manual,setManual]=React.useState(''),[library,setLibrary]=React.useState('company'),[libraryName,setLibraryName]=React.useState(''),[newId,setNewId]=React.useState(''),[newName,setNewName]=React.useState(''),[parent,setParent]=React.useState('company'),[tab,setTab]=React.useState('people'),[width,setWidth]=React.useState(1200),[,renderNames]=React.useReducer(x=>x+1,0);
    const root=React.useRef(null),epoch=React.useRef(0),controller=React.useRef(new AbortController()),busy=React.useRef(false);
    let id;try{id=pageIdentity(connection);}catch{id=null;}
    const online=connection.status==='ready'&&!connection.cached,compact=width<820;
    const privateChannels=(connection.session?.channels?.list?.().channels||[]).filter(c=>(c.visibility==='private'||c.private)&&!c.readOnly&&!c.cached&&!c.archived);
    const profiles=connection.session?.profiles?.snapshot?.();
    const name=key=>profiles?.get(key)?.name||loadedNames[key]||shortKey(key);
    const alive=v=>epoch.current===v&&!controller.current.signal.aborted;
    async function refresh(v){const value=await service.policy(id,{op:'snapshot'},{signal:controller.current.signal});if(alive(v))setPolicy(value);}
    async function loadPeople(v){
      const events=await connection.session.read([{kinds:[0],limit:200}],{signal:controller.current.signal});if(!alive(v))return;
      const visible=events.filter(e=>/^[a-f0-9]{64}$/.test(e.pubkey)&&!e.tags.some(t=>t[0]==='auth')),names={};
      for(const event of visible){try{const value=JSON.parse(event.content);const label=value.display_name||value.name;if(typeof label==='string'&&label.trim())names[event.pubkey]=label.trim().slice(0,80);}catch{}}
      setPeople([...new Set(visible.map(e=>e.pubkey))]);setLoadedNames(names);
    }
    React.useEffect(()=>ctx.relay.subscribe(()=>setConnection(ctx.relay.snapshot())),[]);
    React.useEffect(()=>connection.session?.profiles?.subscribe?.(()=>renderNames()),[connection.session]);
    React.useEffect(()=>{const o=new ResizeObserver(e=>setWidth(e[0].contentRect.width));if(root.current)o.observe(root.current);return()=>o.disconnect();},[]);
    React.useEffect(()=>{
      controller.current.abort();controller.current=new AbortController();const v=++epoch.current;
      setPolicy(null);setBound(false);setError('');setNotice('');setPeople([]);setLoadedNames({});setQuery('');setOwner(id?.owner||'');busy.current=false;setPending(!!id);
      if(id)void service.status(id).then(async status=>{if(!alive(v))return;setBound(status.connected);if(status.connected){await refresh(v);if(online)await loadPeople(v).catch(()=>{});}}).catch(e=>{if(alive(v))setError(e.message);}).finally(()=>{if(alive(v))setPending(false);});
      return()=>{controller.current.abort();epoch.current++;};
    },[id?.partition,connection.generation]);
    async function run(fn){if(!id||busy.current)return;busy.current=true;setPending(true);setError('');setNotice('');const v=++epoch.current;try{await fn(v);}catch(e){if(alive(v)){setError(e.message);if(e.denied)setPolicy(null);}}finally{if(alive(v)){busy.current=false;setPending(false);}}}
    async function change(v,kind,payload){if(!policy)throw Error('请先载入当前权限');await service.policy(id,{op:'change',expected_revision:policy.revision,action:kind,payload},{signal:controller.current.signal});if(alive(v)){await refresh(v);setNotice('权限已保存，后续访问按新权限检查');}}
    const validOwner=/^[a-f0-9]{64}$/.test(owner),configured=new Set([...(policy?.grants||[]).map(g=>g.owner),...(policy?.disabled||[])]);
    const owners=[...new Set([...configured,...people])].sort((a,b)=>Number(configured.has(b))-Number(configured.has(a))||name(a).localeCompare(name(b),'zh-CN')||a.localeCompare(b));
    const matches=owners.filter(key=>`${name(key)} ${key}`.toLowerCase().includes(query.toLowerCase()));
    const active=policy&&validOwner?policy.libraries.filter(lib=>effectiveAccess(policy,owner,lib.id)).length:0,disabled=policy?.disabled.includes(owner);
    const heading=(title,description)=>h('div',{style:{marginBottom:24}},h('h2',{style:{fontSize:24,fontWeight:500,lineHeight:1.4,margin:'0 0 8px'}},title),h('p',{style:{...muted,margin:0}},description));
    const libraries=policy?libraryRows(policy.libraries):[];
    const roster=h('aside',{'aria-label':'人员列表',style:{minWidth:0,overflowY:'auto',padding:compact?20:24,background:palette.inset,borderRight:compact?undefined:border,borderBottom:compact?border:undefined}},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:16}},h('h2',{style:{fontSize:16,fontWeight:500,margin:0}},`人员 · ${owners.length}`),h('span',{style:{...muted,fontSize:12}},`${configured.size} 位已配置`)),
      h('input',{type:'search','aria-label':'搜索人员',placeholder:'搜索姓名或公钥',value:query,onChange:e=>setQuery(e.target.value),style:{...input,background:palette.surface,marginBottom:16}}),
      compact?h('select',{'aria-label':'选择个人',value:owner,disabled:pending,onChange:e=>setOwner(e.target.value),style:{...input,marginBottom:16}},...matches.map(key=>h('option',{key,value:key},`${name(key)} · ${shortKey(key)}`))):
        h('div',null,...matches.map(key=>h('button',{key,type:'button','aria-pressed':key===owner,disabled:pending,onClick:()=>setOwner(key),style:{...button,width:'100%',whiteSpace:'normal',textAlign:'left',display:'flex',alignItems:'center',gap:12,borderColor:'transparent',background:key===owner?palette.surface:'transparent',padding:12,marginBottom:4}},
          h('span',{style:{height:36,width:36,flexShrink:0,border,borderRadius:10,display:'grid',placeItems:'center',fontSize:16}},name(key).slice(0,1)),h('span',{style:{minWidth:0,flex:1}},h('span',{style:{display:'block',fontWeight:key===owner?500:400,fontSize:15,overflowWrap:'anywhere'}},name(key)),h('span',{style:{...muted,fontSize:12,display:'block',fontVariantNumeric:'tabular-nums'}},shortKey(key))),policy?.disabled.includes(key)?h('span',{style:{...muted,fontSize:12}},'已停用'):null))),
      !matches.length?h('p',{style:muted},'没有匹配身份。可刷新可见身份，或用公钥添加。'):null,
      h('details',{style:{marginTop:20}},h('summary',{style:{...muted,fontSize:13,cursor:'pointer'}},'按公钥查找'),h('p',{style:{...muted,fontSize:12}},'姓名仅作显示；权限绑定完整个人公钥。'),h('input',{'aria-label':'个人公钥',value:manual,placeholder:'完整的个人公钥',onChange:e=>setManual(e.target.value.trim()),style:input}),action('选择此身份',()=>{setOwner(manual);setPeople(p=>[...new Set([...p,manual])]);setManual('');},!/^[a-f0-9]{64}$/.test(manual),{marginTop:12})),
      action('刷新可见身份',()=>run(async v=>{await loadPeople(v);if(alive(v))setNotice('已刷新当前社区可见身份，未更改权限');}),pending||!online,{width:'100%',marginTop:20}),h('p',{style:{...muted,fontSize:12}},'已配置人员始终保留。其他可见身份最多载入 200 项。'));
    const person=h('section',{'aria-label':'个人知识库权限',style:{minWidth:0,overflowY:'auto',padding:compact?20:32}},
      validOwner&&policy?h(React.Fragment,null,
        h('div',{style:{display:'flex',alignItems:'start',justifyContent:'space-between',flexWrap:'wrap',gap:16,marginBottom:24}},h('div',null,h('h2',{style:{fontSize:26,fontWeight:500,margin:'0 0 8px'}},name(owner)),h('p',{style:{...muted,margin:0}},disabled?'此人的知识库访问已停用':`${active} / ${policy.libraries.length} 个目录可读取 · Agent 自动继承`)),
          h('details',null,h('summary',{style:{...muted,cursor:'pointer',padding:8}},'个人操作'),h('p',{style:{...muted,fontSize:13,maxWidth:300}},disabled?'恢复后按下方各库权限访问。':'停用会关闭本人及其 Agent 的后续知识库访问。'),action(disabled?'恢复此人的知识库访问':'停用此人的全部知识库访问',()=>run(v=>change(v,'disable',{owner,disabled:!disabled})),pending))),
        h('details',{style:{marginBottom:24}},h('summary',{style:{...muted,fontSize:12,cursor:'pointer'}},`身份 ${shortKey(owner)}`),h('code',{style:{display:'block',fontSize:12,overflowWrap:'anywhere',marginTop:8}},owner)),
        h('div',{style:{border,borderRadius:12,overflow:'hidden'}},...libraries.map((lib,i)=>{const rule=policy.grants.find(g=>g.owner===owner&&g.library===lib.id),allowed=effectiveAccess(policy,owner,lib.id);return h('div',{key:lib.id,style:{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16,padding:20,borderTop:i?border:undefined}},
          h('div',{style:{minWidth:0,flex:'1 1 220px',paddingLeft:Math.max(0,lib.depth-1)*16}},h('p',{style:{fontSize:16,fontWeight:500,lineHeight:1.5,margin:'0 0 4px'}},lib.name),h('p',{style:{...muted,fontSize:13,margin:0}},`${allowed?'可读取':'已关闭'} · ${lib.parent?`上级：${policy.libraries.find(p=>p.id===lib.parent)?.name||lib.parent}`:'顶层知识库'}`)),
          h('select',{'aria-label':`${lib.name}权限设置`,value:rule?(rule.allow?'allow':'deny'):'inherit',disabled:pending||!online,style:{...input,width:148,flexShrink:0},onChange:e=>{const value=e.target.value;void run(v=>value==='inherit'?change(v,'inherit',{owner,library:lib.id}):change(v,'grant',{owner,library:lib.id,allow:value==='allow'}));}},h('option',{value:'allow'},'允许读取'),h('option',{value:'deny'},'关闭读取'),h('option',{value:'inherit'},'继承上级'))); })),
        h('p',{style:{...muted,fontSize:13,marginTop:20}},'关闭父库会同时关闭子库访问。这里管理的是资料读取权限，个人的 Agent 无需重复配置。')):heading('选择一个人','先从人员列表选择身份，再调整知识库权限。'));
    const structure=h('section',{style:{overflowY:'auto',padding:compact?20:32,minHeight:0}},heading('知识库名称与层级','名称会同步到阅读页；不会改动原数据源或自动导入资料。'),
      h('div',{style:{maxWidth:720,border,borderRadius:12,padding:24}},h('label',{style:{...muted,display:'block'}},'现有知识库',h('select',{'aria-label':'待重命名知识库',value:library,onChange:e=>{setLibrary(e.target.value);setLibraryName('');},style:{...input,display:'block',margin:'8px 0 20px'}},...libraries.map(lib=>h('option',{key:lib.id,value:lib.id},`${'　'.repeat(lib.depth)}${lib.name}`)))),h('label',{style:{...muted,display:'block'}},'新名称',h('input',{'aria-label':'知识库新名称',placeholder:'输入清楚的业务名称',value:libraryName,maxLength:80,onChange:e=>setLibraryName(e.target.value),style:{...input,marginTop:8}})),action('保存名称',()=>run(v=>change(v,'library',{id:library,name:libraryName.trim(),parent:policy.libraries.find(l=>l.id===library)?.parent??null})),pending||!libraryName.trim(),{marginTop:20})),
      h('details',{style:{maxWidth:720,borderTop:border,paddingTop:24,marginTop:32}},h('summary',{style:{fontSize:18,cursor:'pointer'}},'新增子知识库'),h('p',{style:muted},'新增目录后仍需接入知识源，才会出现资料。'),h('input',{'aria-label':'新子库标识',placeholder:'英文标识，例如 project-plans',value:newId,onChange:e=>setNewId(e.target.value),style:input}),h('input',{'aria-label':'新子库名称',placeholder:'子知识库名称',value:newName,maxLength:80,onChange:e=>setNewName(e.target.value),style:{...input,marginTop:12}}),h('select',{'aria-label':'新子库上级',value:parent,onChange:e=>setParent(e.target.value),style:{...input,margin:'12px 0'}},...libraries.map(lib=>h('option',{key:lib.id,value:lib.id},lib.name))),action('创建子库',()=>run(v=>change(v,'library',{id:newId,name:newName.trim(),parent})),pending||!newId||!newName.trim())));
    const audit=h('section',{style:{overflowY:'auto',padding:compact?20:32}},heading('权限变更记录','来自服务器审计；每次保存都核对当前权限版本。'),...(policy?.audit||[]).map(row=>h('div',{key:row.revision,style:{padding:'20px 0',borderBottom:border,maxWidth:900}},h('p',{style:{margin:'0 0 8px',fontWeight:500}},({grant:'调整读取权限',inherit:'恢复继承权限',disable:'调整个人访问',library:'修改知识库目录'})[row.action]||row.action),h('p',{style:{...muted,margin:0}},`版本 ${row.revision} · ${new Date(row.at*1000).toLocaleString('zh-CN')}`))),!policy?.audit?.length?h('p',{style:muted},'尚无变更记录'):null);
    return h('main',{ref:root,'data-knowledge-admin':true,style:{width:'100%',height:'100%',minHeight:0,display:'flex',flexDirection:'column',overflow:'hidden',color:palette.text,fontFamily:'inherit',fontSize:16}},
      h('header',{style:{padding:compact?20:'24px 32px',borderBottom:border,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16}},h('div',null,h('h1',{style:{fontSize:compact?24:28,fontWeight:600,margin:0,lineHeight:1.3}},'知识库管理'),h('p',{style:{...muted,margin:'6px 0 0'}},'按个人管理访问，Agent 继承读取')),bound?action('刷新权限',()=>run(refresh),pending||!online):null),
      !bound?h('section',{style:{padding:compact?20:32,overflowY:'auto'}},h('div',{style:{maxWidth:720}},heading('连接管理员身份','使用你当前 Buzz 的个人身份，无需知识库密码。'),h('label',{style:muted},'保存连接记录的私人对话',h('select',{'aria-label':'管理员绑定私人对话',style:{...input,display:'block',margin:'8px 0 20px'},value:channel||privateChannels[0]?.id||'',onChange:e=>setChannel(e.target.value)},...privateChannels.map(c=>h('option',{key:c.id,value:c.id},c.name||'私人对话')))),action('绑定当前个人身份',()=>run(async v=>{if(!online)throw Error('请先连接 Buzz 社区');const selected=channel||privateChannels[0]?.id;if(!selected)throw Error('请选择你可写的私人对话');await service.bind(id,content=>publishPersonalBinding(connection.session,selected,content,{signal:controller.current.signal}),{signal:controller.current.signal});if(alive(v)){setBound(true);await refresh(v);await loadPeople(v).catch(()=>{});}}),pending||!id||!online||!privateChannels.length),h('p',{style:{...muted,fontSize:13}},'保存的原生记录仅含设备公钥与随机挑战。管理员资格由服务器配置决定，Agent 不继承管理权限。'))):null,
      error?h('p',{role:'alert',style:{borderLeft:'3px solid var(--text-danger, #a33)',margin:'16px 24px',padding:'12px 16px',background:palette.inset}},error):null,
      notice?h('p',{role:'status',style:{...muted,margin:'12px 24px'}},notice):null,
      policy?h(React.Fragment,null,h('div',{style:{display:'flex',alignItems:'center',gap:8,padding:'12px 24px',borderBottom:border,flexWrap:'wrap'}},...[['people','人员权限'],['structure','知识库目录'],['audit','变更记录']].map(([key,label])=>h('button',{key,type:'button','aria-pressed':tab===key,onClick:()=>setTab(key),style:{...button,borderColor:'transparent',background:tab===key?palette.inset:'transparent',fontWeight:tab===key?500:400}},label)),h('span',{style:{...muted,fontSize:12,marginLeft:'auto'}},`权限版本 ${policy.revision}`)),
        tab==='people'?h('div',{style:{display:'grid',gridTemplateColumns:compact?'minmax(0,1fr)':'300px minmax(0,1fr)',flex:1,minHeight:0,overflow:compact?'auto':'hidden'}},roster,person):tab==='structure'?structure:audit):bound&&pending?h('p',{role:'status',style:{...muted,padding:24}},'正在读取权限…'):null);
  }
  ctx.pages.register({id:'admin',title:'知识库管理',primary:true,placement:'dock',layout:'workspace',component:Page});
}
