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
  const border='1px solid var(--border-standard, #dfe2e6)',muted={fontSize:14,lineHeight:1.6,color:'var(--text-subtle, #70747b)'};
  const button={minHeight:36,padding:'6px 12px',border,borderRadius:8,font:'inherit',color:'inherit',background:'var(--surface-panel, #fff)',cursor:'pointer'};
  const action=(label,fn,disabled=false)=>h('button',{type:'button',onClick:fn,disabled,style:button},label);
  function Page(){
    const [connection,setConnection]=React.useState(()=>ctx.relay.snapshot()),[policy,setPolicy]=React.useState(null),[bound,setBound]=React.useState(false),[pending,setPending]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
    const [channel,setChannel]=React.useState(''),[owner,setOwner]=React.useState(''),[people,setPeople]=React.useState([]),[library,setLibrary]=React.useState('company'),[libraryName,setLibraryName]=React.useState(''),[newId,setNewId]=React.useState(''),[newName,setNewName]=React.useState(''),[parent,setParent]=React.useState('company');
    const epoch=React.useRef(0),controller=React.useRef(new AbortController()),busy=React.useRef(false);
    let id;try{id=pageIdentity(connection);}catch{id=null;}
    const privateChannels=(connection.session?.channels?.list?.().channels||[]).filter(c=>(c.visibility==='private'||c.private)&&!c.readOnly&&!c.cached&&!c.archived);
    const names=connection.session?.profiles?.snapshot?.();
    const name=key=>names?.get(key)?.name||`${key.slice(0,10)}…${key.slice(-8)}`;
    const alive=v=>epoch.current===v&&!controller.current.signal.aborted;
    async function refresh(v){const value=await service.policy(id,{op:'snapshot'},{signal:controller.current.signal});if(alive(v))setPolicy(value);}
    React.useEffect(()=>ctx.relay.subscribe(()=>setConnection(ctx.relay.snapshot())),[]);
    React.useEffect(()=>{
      controller.current.abort();controller.current=new AbortController();const v=++epoch.current;setPolicy(null);setBound(false);setError('');busy.current=false;setPending(false);
      if(id)void service.status(id).then(async status=>{if(!alive(v))return;setBound(status.connected);if(status.connected)await refresh(v);}).catch(e=>{if(alive(v))setError(e.message);});
      return()=>{controller.current.abort();epoch.current++;};
    },[id?.partition,connection.generation]);
    async function run(fn){if(!id||busy.current)return;busy.current=true;setPending(true);setError('');setNotice('');const v=++epoch.current;try{await fn(v);}catch(e){if(alive(v)){setError(e.message);if(e.denied)setPolicy(null);}}finally{if(alive(v)){busy.current=false;setPending(false);}}}
    async function change(v,kind,payload){if(!policy)throw Error('请先载入当前权限');await service.policy(id,{op:'change',expected_revision:policy.revision,action:kind,payload},{signal:controller.current.signal});if(alive(v)){await refresh(v);setNotice('权限已保存，后续访问按新权限检查');}}
    const validOwner=/^[a-f0-9]{64}$/.test(owner);
    const owners=[...new Set([...people,...(policy?.grants||[]).map(g=>g.owner),...(policy?.disabled||[])])];
    const control={...button,minWidth:0,width:'100%',boxSizing:'border-box'};
    return h('main',{'data-knowledge-admin':true,style:{width:'100%',height:'100%',overflow:'auto',boxSizing:'border-box',padding:24,fontSize:16,color:'var(--text-standard, #20242a)',fontFamily:'inherit'}},
      h('header',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:16,marginBottom:24}},h('div',null,h('h1',{style:{fontSize:26,fontWeight:600,margin:0}},'知识库管理'),h('p',{style:{...muted,margin:'8px 0 0'}},'按个人开通知识库，所属 Agent 自动继承读取权限')),bound?action('刷新权限',()=>run(refresh),pending):null),
      !bound?h('section',{style:{border,borderRadius:12,padding:20,maxWidth:760}},h('h2',{style:{fontSize:20,marginTop:0}},'绑定管理员个人身份'),h('p',{style:muted},'管理员资格由服务器配置决定。原生签名绑定后无需知识库密码；Agent 的读取绑定不能用于管理权限。'),
        h('label',null,'保存绑定记录的私人对话',h('select',{'aria-label':'管理员绑定私人对话',style:{...control,display:'block',margin:'12px 0'},value:channel||privateChannels[0]?.id||'',onChange:e=>setChannel(e.target.value)},...privateChannels.map(c=>h('option',{key:c.id,value:c.id},c.name||'私人对话')))),
        action('绑定当前个人身份',()=>run(async v=>{if(connection.status!=='ready'||connection.cached)throw Error('请先连接 Buzz 社区');const selected=channel||privateChannels[0]?.id;if(!selected)throw Error('请选择你可写的私人对话');await service.bind(id,content=>publishPersonalBinding(connection.session,selected,content,{signal:controller.current.signal}),{signal:controller.current.signal});if(alive(v)){setBound(true);await refresh(v);}}),pending||!id||!privateChannels.length),h('p',{style:muted},'会保存一条仅含公钥与随机挑战的原生身份绑定记录，不含私钥或知识正文。')):null,
      error?h('p',{role:'alert',style:{borderLeft:'3px solid var(--text-danger, #a33)',padding:'12px 16px'}},error):null,
      notice?h('p',{role:'status',style:muted},notice):null,
      policy?h(React.Fragment,null,
        h('p',{style:muted},`当前权限版本 ${policy.revision} · 服务器逐次鉴权 · 关闭父库同时关闭子库访问`),
        h('section',{style:{maxWidth:1000,margin:'24px 0',borderTop:border,paddingTop:20}},h('h2',{style:{fontSize:20,margin:'0 0 12px'}},'人员权限'),
          action('载入 Buzz 身份',()=>run(async v=>{const events=await connection.session.read([{kinds:[0],limit:200}]);if(alive(v)){const keys=events.filter(e=>!e.tags.some(t=>t[0]==='auth')).map(e=>e.pubkey);setPeople([...new Set(keys)]);setNotice('已载入当前可见身份，最多 200 项；也可填写完整个人公钥。名字仅用于显示，授权绑定公钥。');}}),pending),
          h('label',{style:{display:'block',margin:'16px 0 8px'}},'选择个人（无需添加其 Agent）',h('input',{'aria-label':'个人公钥',list:'knowledge-people',placeholder:'选择身份或填写完整个人公钥',value:owner,onChange:e=>setOwner(e.target.value.trim()),style:{...control,marginTop:8}})),
          h('datalist',{id:'knowledge-people'},...owners.map(key=>h('option',{key,value:key,label:name(key)}))),
          validOwner?h('p',{style:muted},`${name(owner)} · ${policy.disabled.includes(owner)?'知识库访问已停用':'按下表知识库权限访问'}`):null,
          action(policy.disabled.includes(owner)?'恢复此人的知识库访问':'停用此人的全部知识库访问',()=>run(v=>change(v,'disable',{owner,disabled:!policy.disabled.includes(owner)})),pending||!validOwner),
          h('div',{style:{overflowX:'auto',marginTop:20}},h('table',{style:{borderCollapse:'collapse',width:'100%',minWidth:480}},h('thead',null,h('tr',null,h('th',{style:{textAlign:'left',padding:12,borderBottom:border}},'知识库 / 子库'),h('th',{style:{textAlign:'left',padding:12,borderBottom:border}},'当前设置'),h('th',{style:{textAlign:'left',padding:12,borderBottom:border}},'调整权限'))),
            h('tbody',null,...libraryRows(policy.libraries).map(lib=>{const rule=policy.grants.find(g=>g.owner===owner&&g.library===lib.id);return h('tr',{key:lib.id},h('td',{style:{padding:12,borderBottom:border}},h('strong',{style:{fontWeight:500,paddingLeft:lib.depth*12}},lib.name),h('div',{style:muted},lib.parent?`上级：${policy.libraries.find(p=>p.id===lib.parent)?.name||lib.parent}`:'顶层知识库')),h('td',{style:{padding:12,borderBottom:border}},h(React.Fragment,null,validOwner?h('strong',{style:{fontWeight:500}},effectiveAccess(policy,owner,lib.id)?'可读取':'已关闭'):null,h('div',{style:muted},rule?(rule.allow?'本库允许':'本库关闭'):'继承上级 / 默认关闭'))),h('td',{style:{padding:12,borderBottom:border}},h('div',{style:{display:'flex',flexWrap:'wrap',gap:8}},action('开通',()=>run(v=>change(v,'grant',{owner,library:lib.id,allow:true})),pending||!validOwner),action('关闭',()=>run(v=>change(v,'grant',{owner,library:lib.id,allow:false})),pending||!validOwner),action('继承上级',()=>run(v=>change(v,'inherit',{owner,library:lib.id})),pending||!validOwner))));}))))),
        h('section',{style:{maxWidth:760,borderTop:border,paddingTop:20,marginTop:32}},h('h2',{style:{fontSize:20,margin:'0 0 12px'}},'知识库命名与层级'),
          h('label',null,'现有知识库',h('select',{'aria-label':'待重命名知识库',value:library,onChange:e=>{setLibrary(e.target.value);setLibraryName('');},style:{...control,display:'block',margin:'8px 0 12px'}},...policy.libraries.map(lib=>h('option',{key:lib.id,value:lib.id},lib.name)))),
          h('input',{'aria-label':'知识库新名称',placeholder:'输入清楚的业务名称',value:libraryName,maxLength:80,onChange:e=>setLibraryName(e.target.value),style:{...control,marginBottom:12}}),
          action('保存名称',()=>run(v=>change(v,'library',{id:library,name:libraryName.trim(),parent:policy.libraries.find(l=>l.id===library)?.parent??null})),pending||!libraryName.trim()),
          h('details',{style:{marginTop:20}},h('summary',{style:{cursor:'pointer',...muted}},'新增子知识库'),h('p',{style:muted},'新增目录不会自动采集数据；需要再接入对应的知识源。'),h('input',{'aria-label':'新子库标识',placeholder:'稳定英文标识，例如 project-plans',value:newId,onChange:e=>setNewId(e.target.value),style:control}),h('input',{'aria-label':'新子库名称',placeholder:'子知识库名称',value:newName,maxLength:80,onChange:e=>setNewName(e.target.value),style:{...control,marginTop:12}}),h('select',{'aria-label':'新子库上级',value:parent,onChange:e=>setParent(e.target.value),style:{...control,margin:'12px 0'}},...policy.libraries.map(lib=>h('option',{key:lib.id,value:lib.id},lib.name))),action('创建子库',()=>run(v=>change(v,'library',{id:newId,name:newName.trim(),parent})),pending||!newId||!newName.trim()))),
        h('details',{style:{margin:'32px 0',borderTop:border,paddingTop:16}},h('summary',{style:{cursor:'pointer'}},'最近权限变更'),...policy.audit.map(row=>h('p',{key:row.revision,style:muted},`v${row.revision} · ${row.action} · ${new Date(row.at*1000).toLocaleString('zh-CN')}`)))):null);
  }
  ctx.pages.register({id:'admin',title:'知识库管理',primary:true,placement:'dock',layout:'document',component:Page});
}
