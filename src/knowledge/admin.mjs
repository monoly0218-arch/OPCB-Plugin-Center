import {createAdminWorkspace} from './admin-ui.mjs';
export {effectiveAccess} from './admin-access.mjs';
import {shortKey} from './presentation.mjs';
import {createIdentityClient,pageIdentity,publishPersonalBinding,libraryRows} from './identity-client.mjs';
export const inject=['react','pages','relay','host'];
export function apply(ctx){
  const React=ctx.react,h=React.createElement,service=createIdentityClient(ctx.host,{role:'manage'});
  ctx.effect(()=>()=>service.dispose());
  const AdminWorkspace=createAdminWorkspace(React);
  function Page(){
    const [connection,setConnection]=React.useState(()=>ctx.relay.snapshot()),[policy,setPolicy]=React.useState(null),[bound,setBound]=React.useState(false),[pending,setPending]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
    const [channel,setChannel]=React.useState(''),[owner,setOwner]=React.useState(''),[people,setPeople]=React.useState([]),[loadedNames,setLoadedNames]=React.useState({}),[query,setQuery]=React.useState(''),[manual,setManual]=React.useState(''),[library,setLibrary]=React.useState('company'),[libraryName,setLibraryName]=React.useState(''),[newId,setNewId]=React.useState(''),[newName,setNewName]=React.useState(''),[parent,setParent]=React.useState('company'),[tab,setTab]=React.useState('people'),[detailMode,setDetailMode]=React.useState(''),[onlyConfigured,setOnlyConfigured]=React.useState(true),[width,setWidth]=React.useState(1200),[,renderNames]=React.useReducer(x=>x+1,0);
    const scroller=React.useRef(null),positions=React.useRef({}),root=React.useRef(null),epoch=React.useRef(0),controller=React.useRef(new AbortController()),busy=React.useRef(false);
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
      setPolicy(null);setBound(false);setError('');setNotice('');setPeople([]);setLoadedNames({});setQuery('');setOwner(id?.owner||'');setDetailMode('');setTab('people');busy.current=false;setPending(!!id);
      if(id)void service.status(id).then(async status=>{if(!alive(v))return;setBound(status.connected);if(status.connected){await refresh(v);if(online)await loadPeople(v).catch(()=>{});}}).catch(e=>{if(alive(v))setError(e.message);}).finally(()=>{if(alive(v))setPending(false);});
      return()=>{controller.current.abort();epoch.current++;};
    },[id?.partition,connection.generation,online]);
    const viewKey=`${tab}:${detailMode}:${detailMode==='person'?owner:detailMode==='library'?library:''}`;
    React.useLayoutEffect(()=>{const element=scroller.current;if(!element)return;element.scrollTop=positions.current[viewKey]||0;return()=>{positions.current[viewKey]=element.scrollTop;};},[viewKey]);
    async function run(fn){if(!id||busy.current)return;busy.current=true;setPending(true);setError('');setNotice('');const v=++epoch.current;try{await fn(v);}catch(e){if(alive(v)){setError(e.message);if(e.denied)setPolicy(null);}}finally{if(alive(v)){busy.current=false;setPending(false);}}}
    async function change(v,kind,payload){if(!policy)throw Error('请先载入当前权限');await service.policy(id,{op:'change',expected_revision:policy.revision,action:kind,payload},{signal:controller.current.signal});if(alive(v)){await refresh(v);setNotice('权限已保存，后续访问按新权限检查');}}
    const configured=new Set([...(policy?.grants||[]).map(g=>g.owner),...(policy?.disabled||[])]);
    const owners=[...new Set([...configured,...people])].sort((a,b)=>Number(configured.has(b))-Number(configured.has(a))||name(a).localeCompare(name(b),'zh-CN')||a.localeCompare(b));
    const libraries=policy?libraryRows(policy.libraries):[];
    const connect=()=>run(async v=>{if(!online)throw Error('请先连接 Buzz 社区');const selected=channel||privateChannels[0]?.id;if(!selected)throw Error('请选择可写的私人对话');await service.bind(id,content=>publishPersonalBinding(connection.session,selected,content,{signal:controller.current.signal}),{signal:controller.current.signal});if(alive(v)){setBound(true);await refresh(v);await loadPeople(v).catch(()=>{});}});
    return h(AdminWorkspace,{policy,bound,pending,error,notice,online,compact,root,scroller,tab,setTab,detailMode,setDetailMode,owner,setOwner,library,setLibrary,query,setQuery,onlyConfigured,setOnlyConfigured,owners,configured,name,libraries,run,change,refresh,loadPeople,alive,manual,setManual,channel,setChannel,privateChannels,connect,id,libraryName,setLibraryName,newId,setNewId,newName,setNewName,parent,setParent,setNotice,setPeople});
  }
  ctx.pages.register({id:'admin',title:'知识库管理',primary:true,placement:'dock',layout:'workspace',component:Page});
}
