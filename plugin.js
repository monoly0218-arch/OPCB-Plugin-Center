export const inject = ["react", "pages", "panels", "relay", "host", "agents"];

export function parseNotes(events, author) {
  const heads = new Map();
  for (const event of [...events].sort((a,b) => b.created_at-a.created_at || a.id.localeCompare(b.id))) {
    const name = event.tags?.find(t => t[0] === "d")?.[1];
    if (event.kind !== 30023 || event.pubkey !== author || !/^higgsfield-account-pool(?:-\d{3,}-\d{3,})?$/.test(name || "")) continue;
    if (!heads.has(name)) heads.set(name,event);
  }
  const rows = new Map();
  const email = text => text?.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  for (const note of heads.values()) {
    const blocks = note.content.split(/^##\s+(?=HF-\d{3,}\b)/m).slice(1);
    for (const block of blocks) {
      const id = block.match(/^HF-\d{3,}/)?.[0];
      if (!id || rows.has(id)) throw new Error("号池存在重复编号，请核对原笔记");
      const field = regex => block.split("\n").find(line => regex.test(line)) || "";
      const login = email(field(/^-\s*邮箱[：:]/)) || email(block.split("\n")[0]);
      const passwordLine = field(/^-\s*(?:提供的)?密码[：:]/);
      const password = passwordLine.match(/`([^`]+)`/)?.[1] || "";
      const aux = email(field(/^-\s*(?:第三方收码邮箱(?:／辅助邮箱)?|辅助邮箱)[：:]/));
      const status = field(/^-\s*Higgsfield\s*状态[：:]/).replace(/^-.*?[：:]\s*/,"").replace(/\*\*/g,"");
      const legacy = field(/^-\s*对应邮箱收码链接[：:]/).match(/https:\/\/s\.77youxiang\.com\/m\/[A-Za-z0-9_-]+/)?.[0] || "";
      const temp = aux && /Temp\s*Mail|temp-mail\.io/i.test(block);
      rows.set(id,{id,login,password,aux,status,legacy,provider:temp?"temp-mail":legacy?"legacy":"recovery",
        source:note.id,updated:note.created_at,note:note.tags.find(t=>t[0]==="d")[1]});
    }
  }
  return [...rows.values()].sort((a,b)=>a.id.localeCompare(b.id));
}

export async function readPoolNotes(session,author,options={}) {
  const limit=100, combined=new Map();
  let cursor;
  for(let pageNumber=0;pageNumber<100;pageNumber++) {
    options.signal?.throwIfAborted();
    const page=await session.readPage([{kinds:[30023],authors:[author],limit,...cursor}],options);
    options.signal?.throwIfAborted();
    if(!Number.isInteger(page.relayCount) || page.relayCount<0)throw new Error("当前 Buzz 缺少笔记分页计数，无法确认完整号池");
    const events=page.events.filter(e=>e.kind===30023 && e.pubkey===author && (!cursor || e.created_at<cursor.until || (e.created_at===cursor.until && e.id>cursor.before_id)))
      .sort((a,b)=>b.created_at-a.created_at || a.id.localeCompare(b.id));
    if(page.relayCount>0 && !events.length)throw new Error("号池笔记分页未推进，请刷新后重试");
    for(const event of events) {
      const name=event.tags?.find(t=>t[0]==="d")?.[1] || "";
      if(/^higgsfield-account-pool(?:-\d{3,}-\d{3,})?$/.test(name))combined.set(event.id,event);
    }
    if(page.relayCount<limit)return [...combined.values()];
    const last=events.at(-1);
    cursor={until:last.created_at,before_id:last.id};
  }
  throw new Error("号池笔记分页超过上限，未将不完整结果作为库存");
}

export function plainText(html) {
  return String(html || "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi," ")
    .replace(/<[^>]*>/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/\s+/g," ").trim();
}

export function normalizeMessages(payload) {
  const list = Array.isArray(payload) ? payload : payload?.messages;
  if (!Array.isArray(list)) throw new Error("邮箱接口格式变化，未读取验证码");
  return list.map(item => {
    const subject=String(item.subject || "");
    const body=plainText(item.body_text || item.body_html || item.body || "");
    const stamp=item.created_at ?? item.date ?? item.timestamp;
    const time=typeof stamp === "number" ? stamp*(stamp<1e12?1000:1) : Date.parse(stamp);
    return {id:String(item.id || item.message_id || subject+"|"+body),subject,body,
      from:String(item.from?.address || item.from || ""),to:String(item.to?.address || item.to || ""),time};
  });
}

export function mailboxURL(address) {
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(address)) throw new Error("辅助邮箱地址格式不正确");
  // The provider treats %40 as literal path text instead of decoding it.
  // Keep the separator as @ while escaping other path-sensitive characters.
  return "https://api.internal.temp-mail.io/api/v3/email/"+encodeURIComponent(address).replace(/%40/gi,"@")+"/messages";
}

export function legacyMessages(html) {
  const body=plainText(html);
  const codes=[...body.matchAll(/(?:安全代码|安全碼|验证码|驗證碼|一次性代码|一次性代碼|security code|verification code|single.use code|one.time code|code is)\s*(?:为|為|是|is)?\s*[:：]?\s*(\d{4,8})\b/gi)].map(m=>m[1]);
  // These pages have no trustworthy message IDs/timestamps. Each code value
  // has its own stable identity; a changing page must never revive old codes.
  return [...new Set(codes)].map(code=>({id:"legacy-code:"+code,subject:"",body,from:"",to:"",time:NaN,legacyCode:code}));
}

export function selectCodes(messages, baseline, account, nowMs=Date.now()) {
  if (!baseline || baseline.account !== account.id || nowMs-baseline.started > 10*60*1000)
    throw new Error("请先开始本次收码，再向登录页面请求验证码（收码窗口10分钟）");
  const codes=[];
  for (const message of messages) {
    if (baseline.ids.includes(message.id)) continue;
    if (Number.isFinite(message.time) && message.time < baseline.started-5000) continue;
    if (message.to && !message.to.toLowerCase().includes((account.aux || account.login).toLowerCase())) continue;
    const text=message.subject+" "+message.body;
    if (!/microsoft|微软|higgsfield/i.test(message.from+" "+text)) continue;
    // The source binds this inbox to the account. If an account is named in
    // the mail, require that visible (possibly masked) account to match too.
    const mentioned=[...message.body.matchAll(/[A-Z0-9*._%+-]+@(?:outlook|hotmail|live)\.com/gi)].map(m=>m[0]);
    if (mentioned.length && !mentioned.some(value=>new RegExp("^"+value.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*")+"$","i").test(account.login))) continue;
    const match=message.legacyCode ? [null,message.legacyCode] : text.match(/(?:安全代码|安全碼|验证码|驗證碼|一次性代码|一次性代碼|security code|verification code|single.use code|one.time code|code is|code:)\s*(?:为|為|是|is)?\s*[:：]?\s*(\d{4,8})\b/i)
      || message.subject.match(/\b(\d{6})\b/);
    if (match) codes.push({id:message.id,code:match[1],subject:message.subject,time:Number.isFinite(message.time)?message.time:null});
  }
  return codes;
}

export function shareText(account, withPassword=false) {
  const safe=value=>String(value).replace(/[\r\n]/g," ");
  return ["Higgsfield 账号卡 · "+account.id,"账号："+safe(account.login),
    ...(withPassword?["密码："+safe(account.password)]:[]),
    "辅助邮箱："+safe(account.aux || "未提供"),
    "[查询邮箱验证码](higgsfield-mailbox:"+account.id+")",
    "领取只代表占用；登录、额度和收码需现场核对。"].join("\n");
}

export function registerAccountTools(ctx,{pool,readInbox},options={}) {
  const author=options.author || "9903103630d49a6693cbc4ddc65c94dcdf12a3bfebef42c8bd46340b8b602608";
  const localOwner="5770c1ebb2a1d76ccd7fc7231036f74bb9ee13d95b5e0070b55d2b5b0a234f48";
  const now=options.now || (()=>Date.now()),windows=new Map();
  ctx.effect(()=>()=>windows.clear());
  const validate=(args,allowed)=>{
    if(!args || typeof args!=="object" || Array.isArray(args) || Object.keys(args).some(k=>!allowed.includes(k)))throw new Error("工具参数不正确");
  };
  const identity=(client,context)=>{
    if(!client.owner || !client.key || !client.relayAuthor || !context.channel || typeof client.query!=="function")throw new Error("无法确认当前对话的 Agent 身份与社区，请在 Buzz 对话内调用");
    return JSON.stringify([client.owner,client.key,client.relayAuthor,context.channel,context.root || ""]);
  };
  const accountId=args=>{
    if(typeof args.account_id!=="string" || !/^HF-\d{3,8}$/.test(args.account_id))throw new Error("请提供完整账号编号，例如 HF-020");
    return args.account_id;
  };
  async function accountFor(client,context,id) {
    identity(client,context);
    // Query with the calling agent's signed client, never the desktop viewer.
    // The established ten-account volume is a fast path, not a source limit.
    const number=Number(id.slice(3)),start=14+Math.floor((number-14)/10)*10;
    const names=["higgsfield-account-pool"];
    if(number>=14)names.push("higgsfield-account-pool-"+String(start).padStart(3,"0")+"-"+String(start+9).padStart(3,"0"));
    let events=await client.query([{kinds:[30023],authors:[author],"#d":names,limit:100}]);
    let found=parseNotes(events,author).find(a=>a.id===id);
    if(found)return found;
    let cursor;
    const collected=new Map(events.map(e=>[e.id,e]));
    for(let pageNumber=0;pageNumber<100;pageNumber++) {
      const page=await client.query([{kinds:[30023],authors:[author],limit:100,...cursor}]);
      const advancing=page.filter(e=>e.kind===30023 && e.pubkey===author && (!cursor || e.created_at<cursor.until || (e.created_at===cursor.until && e.id>cursor.before_id)))
        .sort((a,b)=>b.created_at-a.created_at || a.id.localeCompare(b.id));
      if(!advancing.length)break;
      for(const e of advancing)collected.set(e.id,e);
      events=[...collected.values()];found=parseNotes(events,author).find(a=>a.id===id);
      if(found)return found;
      const last=advancing.at(-1);cursor={until:last.created_at,before_id:last.id};
    }
    throw new Error("当前对话未读到该账号的授权原记录，请核对编号和笔记访问权限");
  }
  const schema=properties=>({type:"object",properties,additionalProperties:false});
  const idProperty={type:"string",pattern:"^HF-\\d{3,8}$",description:"账号编号，例如 HF-020"};
  const add=(name,description,inputSchema,call)=>ctx.agents.addTool({name,description,inputSchema,call:async(client,context,args)=>JSON.stringify(await call(client,context,args))});
  add("higgsfield_account_get","读取 higgsfiled号池1.4 的指定账号与辅助邮箱，按当前 Agent 的原笔记权限读取。默认不返回密码；任务确需密码时显式 include_password=true。结果只供当前任务使用，不自动发布凭据。无需打开插件页面。",
    {...schema({account_id:idProperty,include_password:{type:"boolean",description:"明确需要登录密码时才设为 true"}}),required:["account_id"]},async(client,context,args)=>{
      validate(args,["account_id","include_password"]);
      if(args.include_password!==undefined && typeof args.include_password!=="boolean")throw new Error("include_password 须为布尔值");
      const a=await accountFor(client,context,accountId(args));
      return {account_id:a.id,login:a.login,auxiliary_email:a.aux || null,password_available:!!a.password,
        ...(args.include_password===true?{password:a.password || null}:{}),mailbox_provider:a.provider,
        mailbox_url:a.provider==="temp-mail"?"https://temp-mail.io/zh":a.legacy || null,
        mailbox_api:a.provider==="temp-mail"?mailboxURL(a.aux):null,source_note:a.note,source_event:a.source,
        source_status:a.status,detail_link:"higgsfield-mailbox:"+a.id,
        scope:"current agent's readable source records; login and mailbox delivery require verification"};
    });
  add("higgsfield_pool_status","只读查询 Moo 本机号池是否开放、状态数量或指定账号的占用状态。不会领取账号。仅限同一设备上 Moo 的 Agent 且当前社区可读取原号池记录。",
    schema({account_id:idProperty}),async(client,context,args)=>{
      validate(args,["account_id"]);identity(client,context);
      if(client.owner!==localOwner)throw new Error("本机库存只供 Moo 的 Agent 查询；其他设备需连接自己的分配服务");
      const id=args.account_id===undefined?null:accountId(args);
      if(id)await accountFor(client,context,id);
      else{
        const records=await client.query([{kinds:[30023],authors:[author],"#d":["higgsfield-account-pool"],limit:100}]);
        if(!records.some(e=>e.kind===30023&&e.pubkey===author&&e.tags?.some(t=>t[0]==="d"&&t[1]==="higgsfield-account-pool")))throw new Error("当前社区无法读取授权号池记录");
      }
      const result=await pool("status"),counts={};
      for(const a of result.accounts)counts[a.state]=(counts[a.state] || 0)+1;
      const selected=id?result.accounts.find(a=>a.id===id):null;
      return {claiming:result.claiming,total:result.accounts.length,counts,account:id?(selected || {id,state:"not_in_local_inventory"}):null,scope:"Moo's local allocator only; no cross-device lock"};
    });
  add("higgsfield_mailbox_begin","为当前对话的指定账号建立新验证码窗口，记录已有邮件后返回 window_id。然后才在登录网页请求新验证码，再调用 higgsfield_mailbox_query。只读取邮箱，不发送验证码、不登录、不领取。窗口10分钟，不能跨对话或跨 Agent 复用。",
    {...schema({account_id:idProperty}),required:["account_id"]},async(client,context,args)=>{
      validate(args,["account_id"]);const binding=identity(client,context),a=await accountFor(client,context,accountId(args));
      const messages=await readInbox(a),started=now();
      for(const [id,w] of windows)if(started-w.started>600000)windows.delete(id);
      if(windows.size>=100)throw new Error("当前收码窗口过多，请待旧窗口过期后重试");
      const window_id=crypto.randomUUID();
      windows.set(window_id,{binding,account:a.id,source:a.source,login:a.login,aux:a.aux,ids:messages.map(m=>m.id),started});
      return {account_id:a.id,window_id,baseline_messages:messages.length,expires_at:new Date(started+600000).toISOString(),next:"现在在正确账号的登录页面请求一次新验证码，再用此 window_id 查询。此操作未发送验证码。"};
    });
  add("higgsfield_mailbox_query","读取本对话 higgsfield_mailbox_begin 之后匹配的新验证码。需要原 window_id；重新核对原笔记权限和账号来源。只返回匹配的新码，不返回整封邮件，不发送验证码，不登录。缺邮件时间的旧专属入口按码值保守去重。",
    {...schema({account_id:idProperty,window_id:{type:"string",description:"同一对话 begin 返回的 window_id"}}),required:["account_id","window_id"]},async(client,context,args)=>{
      validate(args,["account_id","window_id"]);const binding=identity(client,context),id=accountId(args),window=windows.get(args.window_id);
      if(!window || window.binding!==binding || window.account!==id)throw new Error("当前对话没有这个收码窗口，请先调用 higgsfield_mailbox_begin");
      if(now()-window.started>600000){windows.delete(args.window_id);throw new Error("本次收码窗口已过期，请重新开始");}
      const a=await accountFor(client,context,id);
      if(a.source!==window.source || a.login!==window.login || a.aux!==window.aux){windows.delete(args.window_id);throw new Error("账号原记录已变化，请重新开始本次收码");}
      const codes=selectCodes(await readInbox(a),window,a,now());
      return {account_id:id,status:codes.length?"received":"waiting",code_count:codes.length,
        codes:codes.map(c=>({code:c.code,received_at:c.time===null?null:new Date(c.time).toISOString()})),
        ...(a.provider==="legacy"?{limitation:"原专属页面无可靠邮件时间；同值重发会被排除，请核对本次请求。"}:{})};
    });
}

export function apply(ctx) {
  const R=ctx.react, h=R.createElement;
  const AUTHOR="9903103630d49a6693cbc4ddc65c94dcdf12a3bfebef42c8bd46340b8b602608";
  const OWNER="5770c1ebb2a1d76ccd7fc7231036f74bb9ee13d95b5e0070b55d2b5b0a234f48";
  const box={padding:"var(--space-panel-inset, 16px)",display:"grid",gap:"var(--space-4, 16px)",minWidth:0};
  const stack={display:"grid",gap:"var(--space-2, 8px)",minWidth:0};
  const actions={display:"flex",gap:"var(--space-2, 8px)",flexWrap:"wrap",alignItems:"center"};
  const button=(text,click,disabled=false,extra={})=>h("button",{type:"button",onClick:click,disabled,style:{minHeight:40},...extra},text);
  const field=(label,props)=>h("label",{style:stack},h("span",null,label),h("input",{...props,style:{width:"100%",minHeight:40,...props.style}}));
  const live=(snapshot)=>{const current=ctx.relay.snapshot();if(current.status!=="ready" || current.cached || current.scope!==snapshot.scope || current.session!==snapshot.session)throw new Error("社区连接已变化，请刷新后重试");return current;};
  async function pool(operation,payload={}) {
    const raw=await ctx.host.runCommand("pool",JSON.stringify({operation,payload}));
    if (!raw) throw new Error("本机号池不可达，请确认插件安装在 Moo 的 Mac 上");
    const response=JSON.parse(raw);
    if (!response.ok) throw new Error(response.error || "号池操作失败");
    return response.result;
  }
  async function readInbox(account) {
    let url;
    if(account.provider==="temp-mail") url=mailboxURL(account.aux);
    else if(account.provider==="legacy") url=account.legacy;
    else throw new Error("该邮箱缺可查询的恢复入口，请补齐原收件资料");
    const result=await ctx.host.request({url,method:"GET",timeoutMs:12000});
    if(result.status!==200)throw new Error(result.status===400 || result.status===404 ? "原收件箱未恢复或已不可用，请先在原平台恢复完整地址" : "邮箱查询失败（HTTP "+result.status+"），请稍后手动重试");
    if(account.provider==="temp-mail") {
      try{return normalizeMessages(JSON.parse(result.body));}catch(error){throw new Error(error instanceof SyntaxError?"邮箱返回非JSON内容，未读取验证码":error.message);}
    }
    return legacyMessages(result.body);
  }

  registerAccountTools(ctx,{pool,readInbox});

  function Icon(name) {
    const paths={copy:["M8 8h11v11H8z","M5 15H4V4h11v1"],eye:["M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z","M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"],"eye-off":["m3 3 18 18","M9 5c7-2 13 7 13 7s-2 4-5 6M6 6c-3 2-4 6-4 6s3 7 10 7c2 0 3 0 4-1"],mail:["M3 5h18v14H3z","m3 6 9 7 9-7"],refresh:["M20 7v5h-5","M4 17v-5h5","M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15"],share:["M12 16V3m-5 5 5-5 5 5","M5 12v9h14v-9"],plus:["M12 5v14M5 12h14"],close:["m6 6 12 12M6 18 18 6"]};
    return h("svg",{width:18,height:18,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":true},...(paths[name] || paths.mail).map((d,i)=>h("path",{key:i,d})));
  }
  function Card({account,snapshot,destination,refresh}) {
    const [reveal,setReveal]=R.useState(false),[busy,setBusy]=R.useState("");
    const [notice,setNotice]=R.useState(""),[error,setError]=R.useState("");
    const [baseline,setBaseline]=R.useState(null),[codes,setCodes]=R.useState([]);
    const [preview,setPreview]=R.useState(false),[includePassword,setIncludePassword]=R.useState(false);
    const alive=R.useRef(true),pending=R.useRef(false);
    R.useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
    R.useEffect(()=>{if(!codes.length)return;const timer=setTimeout(()=>setCodes([]),180000);return()=>clearTimeout(timer);},[codes]);
    async function run(name,work) {
      if(pending.current)return;
      pending.current=true;setBusy(name);setError("");setNotice("");
      try {live(snapshot);await work();} catch(e) {if(alive.current)setError(e.message || "操作未完成，请重试");}
      finally{pending.current=false;if(alive.current)setBusy("");}
    }
    async function copy(value){if(!navigator.clipboard?.writeText)throw new Error("系统剪贴板不可用，请选择文本复制");await navigator.clipboard.writeText(value);if(alive.current)setNotice("已复制");}
    const stateLabel={available:"待领",reserved:"已占用",uncertain:"提交待核查",used:"已使用",blocked:"资料待修复"}[account.local?.state] || "待核对";
    const textStyle={overflowWrap:"anywhere",margin:0};
    const quietButton={border:0,background:"transparent",minHeight:36,minWidth:36,padding:8};
    const line=(label,value,copyLabel,extra)=>h("div",{style:{display:"grid",gridTemplateColumns:"64px minmax(0,1fr) auto",gap:12,alignItems:"center",padding:"12px 0",borderBottom:"1px solid var(--border-standard)"}},
      h("span",{className:"text-subtle text-caption"},label),h("span",{style:{overflowWrap:"anywhere",fontFamily:label==="密码"?"monospace":undefined}},value),
      h("div",{style:{...actions,gap:0}},extra,button(Icon("copy"),()=>run("copy",()=>copy(label==="密码"?account.password:label==="账号"?account.login:account.aux)),!!busy || !value,{"aria-label":copyLabel,title:copyLabel,style:quietButton})));
    async function begin(){const messages=await readInbox(account);live(snapshot);if(alive.current){setBaseline({account:account.id,ids:messages.map(x=>x.id),started:Date.now()});setCodes([]);setNotice("旧邮件已排除。现在到登录页面请求验证码，再点查询。");}}
    async function queryCode(){const found=selectCodes(await readInbox(account),baseline,account);live(snapshot);if(alive.current){setCodes(found);setNotice(found.length?(found.length===1?"已收到新验证码，复制后填入登录页面":"收到多封新验证码，请核对请求时间后选择"):"尚未发现本次新验证码，稍后手动查询即可");}}
    return h("section",{style:{...box,gap:20,padding:24},"aria-label":account.id+" 账号"},
      h("header",{style:{...actions,justifyContent:"space-between"}},
        h("div",{style:{...actions,gap:10}},h("span",{style:{display:"grid",placeItems:"center",width:40,height:40,borderRadius:12,background:"var(--surface-navigation-selected)",color:"var(--text-standard)"}},Icon("mail")),
          h("div",null,h("h3",{style:{margin:0,fontSize:"1.15rem"}},account.id),h("span",{className:"text-subtle text-caption"},account.provider==="temp-mail"?"Temp Mail 辅助邮箱":account.provider==="legacy"?"原账号专属邮箱":"收码资料待补齐"))),
        h("span",{className:"text-caption",style:{padding:"4px 10px",borderRadius:20,background:"var(--surface-navigation-selected)"}},stateLabel)),
      h("div",null,line("账号",account.login || "未提供","复制账号"),
        line("密码",account.password?(reveal?account.password:"••••••••"):"未提供","复制密码",button(Icon(reveal?"eye-off":"eye"),()=>setReveal(!reveal),!account.password,{"aria-label":reveal?"隐藏密码":"显示密码",title:reveal?"隐藏密码":"显示密码",style:quietButton})),
        line("辅助邮箱",account.aux || "未保存完整地址","复制邮箱")),
      h("section",{"aria-label":"验证码",style:{display:"grid",gap:16,padding:20,borderRadius:14,background:"var(--surface-navigation-selected)"}},
        h("div",{style:{...actions,justifyContent:"space-between"}},h("strong",null,"邮箱验证码"),h("span",{className:"text-subtle text-caption"},codes.length?"已收到新邮件":baseline?"等待新邮件":"尚未开始")),
        h("div",{style:{minHeight:68,display:"grid",alignItems:"center",justifyItems:"center",gap:10}},
          codes.length?codes.map((code,i)=>h("div",{key:code.id+"-"+i,style:actions},h("code",{style:{fontSize:"2rem",letterSpacing:"0.2em",fontWeight:600}},code.code),button(Icon("copy"),()=>run("copy",()=>copy(code.code)),!!busy,{"aria-label":"复制验证码",title:"复制验证码",style:quietButton}))):h("span",{"aria-label":"尚无验证码",style:{fontSize:"1.7rem",letterSpacing:"0.18em",color:"var(--text-subtle)",fontFamily:"monospace"}},"— — — — — —")),
        h("div",{style:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}},...["1 准备邮箱","2 请求验证码","3 查询并复制"].map((label,i)=>h("span",{key:label,className:"text-caption",style:{color:i===(codes.length?2:baseline?1:0)?"var(--text-standard)":"var(--text-subtle)",fontWeight:i===(codes.length?2:baseline?1:0)?600:400}},label))),
        button(h("span",{style:{...actions,justifyContent:"center"}},Icon(baseline?"refresh":"mail"),busy==="baseline"?"准备邮箱…":busy==="query"?"查询中…":baseline?"查询验证码":"开始本次收码"),()=>run(baseline?"query":"baseline",baseline?queryCode:begin),!!busy || account.provider==="recovery",{style:{minHeight:44,width:"100%",background:"var(--text-standard)",color:"var(--surface-panel)",border:"1px solid var(--text-standard)",borderRadius:10}}),
        baseline?button("重新开始本次收码",()=>run("baseline",begin),!!busy,{style:{...quietButton,fontSize:"0.85rem"}}):h("p",{className:"text-subtle text-caption",style:{...textStyle,textAlign:"center"}},"先准备邮箱，再到登录页面请求新验证码")),
      notice?h("p",{role:"status",className:"text-caption",style:textStyle},notice):null,
      error?h("p",{role:"alert",className:"text-danger",style:textStyle},error):null,
      account.provider==="temp-mail"?h("details",null,h("summary",{className:"text-subtle text-caption"},"收不到验证码？"),h("p",{className:"text-subtle text-caption",style:{...textStyle,marginTop:8}},"复制完整辅助邮箱，在 ",h("a",{href:"https://temp-mail.io/zh",target:"_blank",rel:"noreferrer noopener"},"Temp Mail")," 的「改变」中粘贴，核对原地址后重新开始。接口收码仍需实际新邮件验证。")):null,
      account.provider==="legacy"?h("p",{className:"text-subtle text-caption",style:textStyle},"专属邮箱缺少可靠邮件时间，按码值排除旧码；同值重发不会显示为新码。请核对本次请求，不能代替微软辅助邮箱验证。"):null,
      account.provider==="recovery"?h("p",{className:"text-subtle text-caption",style:textStyle},"缺少恢复入口，补齐原收件资料后才能查码。"):null,
      h("footer",{style:{...actions,justifyContent:"space-between",paddingTop:4}},
        button(h("span",{style:actions},Icon("share"),"分享账号卡"),()=>{setPreview(!preview);setIncludePassword(false);},!!busy || !destination),
        button("复制全部资料",()=>run("copy",()=>copy(shareText(account,false))),!!busy,{"aria-label":"复制账号卡"})),
      !destination?h("p",{className:"text-subtle text-caption",style:textStyle},"在频道内打开，可直接分享给频道成员。"):null,
      preview?h("section",{style:{...stack,padding:16,border:"1px solid var(--border-standard)",borderRadius:12},"aria-label":"分享预览"},
        h("strong",null,"分享至 "+destination.channelName),
        h("label",{style:actions},h("input",{type:"checkbox",checked:includePassword,onChange:e=>setIncludePassword(e.target.checked)}),"包含密码（频道成员均可见）"),
        h("pre",{style:{whiteSpace:"pre-wrap",overflowWrap:"anywhere",font:"inherit",fontSize:"0.85rem",margin:0}},shareText(account,includePassword)),
        button(busy==="share"?"加入发件队列…":"确认发送到此频道",()=>run("share",async()=>{const current=live(snapshot);if(destination.scope!==current.scope || destination.viewer!==current.viewer || !current.session.channels.canWrite(destination.channelId))throw new Error("当前频道不可发送，请重新打开面板");await current.session.messages.send(destination.channelId,shareText(account,includePassword));if(alive.current){setPreview(false);setIncludePassword(false);setNotice("已加入 Buzz 发件队列，请以消息投递状态为准");}}),!!busy)):null);
  }

  function Workspace({target="",channelContext}) {
    const snapshot=R.useSyncExternalStore(ctx.relay.subscribe,ctx.relay.snapshot,ctx.relay.snapshot);
    return h(SessionView,{key:snapshot.scope+":"+snapshot.generation,snapshot,target,channelContext});
  }
  function SessionView({snapshot,target,channelContext}) {
    const [rows,setRows]=R.useState([]),[inventory,setInventory]=R.useState(null);
    const [loading,setLoading]=R.useState(false),[error,setError]=R.useState("");
    const [showClaim,setShowClaim]=R.useState(false),[compact,setCompact]=R.useState(true);
    const surface=R.useRef(null);
    R.useEffect(()=>{if(!surface.current)return;const observer=new ResizeObserver(entries=>setCompact(entries[0].contentRect.width<700));observer.observe(surface.current);return()=>observer.disconnect();},[snapshot.status]);
    const [query,setQuery]=R.useState(""),[selected,setSelected]=R.useState(target.match(/^higgsfield-mailbox:(HF-\d{3,})$/)?.[1] || "");
    const [project,setProject]=R.useState(""),[template,setTemplate]=R.useState(""),[count,setCount]=R.useState("1");
    const [receipt,setReceipt]=R.useState(null),[claimBusy,setClaimBusy]=R.useState(false),[claimError,setClaimError]=R.useState("");
    const active=R.useRef(true),claimLock=R.useRef(false),reload=R.useRef(0);
    const requestController=R.useRef(null);
    R.useEffect(()=>{active.current=true;return()=>{active.current=false;reload.current++;requestController.current?.abort();};},[]);
    async function refresh(){
      const generation=++reload.current;
      const controller=new AbortController();
      requestController.current?.abort();requestController.current=controller;
      setLoading(true);setError("");
      try {
        live(snapshot);
        if(typeof snapshot.session.readPage!=="function")throw new Error("当前 Buzz 未提供共享笔记读取接口");
        const notes=await readPoolNotes(snapshot.session,AUTHOR,{fresh:true,signal:controller.signal});
        live(snapshot);
        const parsed=parseNotes(notes,AUTHOR);
        if(!parsed.length)throw new Error("未读到授权号池，请核对当前社区和笔记权限");
        let local=null;
        if(snapshot.viewer===OWNER){try{local=await pool("status",{scope:snapshot.scope,owner:snapshot.viewer});}catch{/* Notes remain readable if the local pool is unavailable. */}}
        live(snapshot);
        if(active.current && generation===reload.current){
          setRows(parsed);setInventory(local);setSelected(current=>current || parsed.find(a=>local?.accounts?.find(x=>x.id===a.id)?.state==="available")?.id || parsed[0]?.id || "");
          if(local?.claim?.payload){setProject(local.claim.payload.project);setTemplate(local.claim.payload.template);setCount(String(local.claim.payload.count));setReceipt(local.claim.receipt);if(local.claim.state==="pending")setShowClaim(true);}
          else setReceipt(null);
        }
      } catch(e){if(active.current && generation===reload.current){setError(e.message || "号池读取失败");setRows([]);setInventory(null);}}
      finally{if(active.current && generation===reload.current)setLoading(false);}
    }
    R.useEffect(()=>{void refresh();},[]);
    const dest=channelContext?.scope===snapshot.scope?channelContext:null;
    const localRows=new Map((inventory?.accounts || []).map(a=>[a.id,a]));
    const all=rows.map(a=>({...a,local:localRows.get(a.id)}));
    const filtered=all.filter(a=>(a.id+" "+a.login+" "+a.aux).toLowerCase().includes(query.toLowerCase()));
    const account=all.find(a=>a.id===selected);
    const available=inventory?.accounts?.filter(a=>a.state==="available").length;
    async function claim(){
      if(claimLock.current)return;
      if(!project.trim() || !template.trim() || !/^\d+$/.test(count) || +count<1 || +count>30){setClaimError("填写项目、模板版本和1～30的整数数量");return;}
      claimLock.current=true;setClaimBusy(true);setClaimError("");
      const payload={scope:snapshot.scope,epoch:inventory?.claim?.epoch,owner:snapshot.viewer,executor:snapshot.viewer,project:project.trim(),template:template.trim(),count:+count};
      try{
        live(snapshot);
        if(snapshot.viewer!==OWNER || !inventory?.claiming.enabled || !payload.epoch)throw new Error("本机领取暂不可用，请刷新状态");
        // Conservatively exclude source-used and source-reserved entries too.
        const excluded=all.filter(a=>/used|已使用|reserved|已认领|资料待补/.test(a.status)).map(a=>a.id).sort();
        const result=await pool("claim",{...payload,exclude_accounts:excluded});
        live(snapshot);
        if(active.current){setReceipt(result);if(result.accounts[0])setSelected(result.accounts[0]);await refresh();}
      }catch(e){if(active.current){setClaimError(e.message || "领取结果不明，请恢复原申请");await refresh();}}
      finally{claimLock.current=false;if(active.current)setClaimBusy(false);}
    }
    async function newClaim(){
      if(claimLock.current)return;
      claimLock.current=true;setClaimBusy(true);setClaimError("");
      try{
        live(snapshot);
        const next=await pool("new_claim",{scope:snapshot.scope,owner:snapshot.viewer,epoch:inventory.claim.epoch});
        live(snapshot);
        if(active.current){setInventory(previous=>({...previous,claim:next}));setReceipt(null);}
      }catch(e){if(active.current)setClaimError(e.message || "无法新建申请，请先恢复上次结果");}
      finally{claimLock.current=false;if(active.current)setClaimBusy(false);}
    }
    if(snapshot.status!=="ready" || snapshot.cached)return h("section",{style:box},h("p",{role:"status"},"连接当前社区后读取号池。"));
    return h("main",{ref:surface,style:{...box,padding:compact?16:24,gap:20,maxWidth:1080,margin:"0 auto"}},
      h("header",{style:{...actions,justifyContent:"space-between",gap:12}},
        h("div",null,h("h2",{style:{margin:0,fontSize:"1.4rem",letterSpacing:"-0.03em"}},"higgsfiled号池1.4"),h("p",{className:"text-subtle text-caption",style:{margin:"4px 0 0"}},"选账号，复制资料，查新验证码。")),
        h("div",{style:actions},button(Icon("refresh"),refresh,loading,{"aria-label":"刷新号池",title:"刷新号池",style:{minHeight:40,width:40,padding:8}}),
          inventory?button(h("span",{style:actions},Icon("plus"),"领取新账号"),()=>setShowClaim(!showClaim),false,{"aria-expanded":showClaim,style:{minHeight:40,background:"var(--text-standard)",color:"var(--surface-panel)",borderRadius:10}}):null)),
      h("div",{className:"text-caption",style:{...actions,gap:20,color:"var(--text-subtle)"}},
        h("span",null,"全部 ",h("strong",{style:{color:"var(--text-standard)"}},all.length)),
        inventory?h("span",null,"待领 ",h("strong",{style:{color:"var(--text-standard)"}},available)):null,
        inventory?h("span",null,"已占用 ",h("strong",{style:{color:"var(--text-standard)"}},inventory.accounts.filter(a=>a.state==="reserved"||a.state==="uncertain").length)):null,
        h("span",null,loading?"同步中…":"来自共享号池")),
      error?h("p",{role:"alert",className:"text-danger"},error):null,
      showClaim&&inventory?h("section",{"aria-label":"领取表单",className:"ui-card",style:box},
        h("div",{style:{...actions,justifyContent:"space-between"}},h("strong",null,"领取账号"),button(Icon("close"),()=>setShowClaim(false),claimBusy,{"aria-label":"关闭领取表单",style:{border:0,background:"transparent"}})),
        h("div",{style:{display:"grid",gridTemplateColumns:compact?"1fr":"1fr 1fr 100px",gap:12}},
          field("项目",{value:project,disabled:claimBusy || inventory.claim?.state!=="empty",onChange:e=>{setProject(e.target.value);setReceipt(null);},placeholder:"例如：洗衣机换装"}),
          field("模板版本",{value:template,disabled:claimBusy || inventory.claim?.state!=="empty",onChange:e=>{setTemplate(e.target.value);setReceipt(null);},placeholder:"例如：V1"}),
          field("数量（每次最多30个）",{type:"number",min:1,max:30,value:count,disabled:claimBusy || inventory.claim?.state!=="empty",onChange:e=>{setCount(e.target.value);setReceipt(null);}})),
        h("div",{style:actions},button(claimBusy?"领取中…":receipt?"查看本次领取结果":inventory.claim?.state==="pending"?"恢复上次领取":"确认领取",claim,claimBusy || inventory.claiming.enabled!==true || !inventory.claim?.epoch),
          receipt?button("新建另一批申请",newClaim,claimBusy):null),
        inventory.claim?.state==="pending"?h("p",{role:"status",className:"text-caption"},"上次申请已保存，恢复将核对同一批结果，不会另领一批。"):null,
        inventory.claiming.enabled!==true?h("p",null,"领取暂停，请刷新状态"):null,
        receipt?h("p",{role:"status",className:"text-caption"},"本次已领 "+receipt.allocated+" / "+receipt.requested+" 个："+receipt.accounts.join("、")+"；缺口 "+receipt.shortfall):null,
        claimError?h("p",{role:"alert",className:"text-danger"},claimError):null):null,
      h("div",{className:"ui-card",style:{display:"grid",gridTemplateColumns:compact?"minmax(0,1fr)":"260px minmax(0,1fr)",overflow:"hidden"}},
        h("aside",{style:{padding:16,borderRight:compact?0:"1px solid var(--border-standard)",borderBottom:compact?"1px solid var(--border-standard)":0,display:"grid",gap:12,alignContent:"start"}},
          field("搜索账号",{type:"search",value:query,onChange:e=>setQuery(e.target.value),placeholder:"编号 / 邮箱","aria-label":"搜索编号或邮箱"}),
          compact?h("label",{style:stack},h("span",{className:"text-subtle text-caption"},"当前账号"),h("select",{"aria-label":"选择账号",value:selected,onChange:e=>setSelected(e.target.value),style:{width:"100%",minHeight:42}},...filtered.map(a=>h("option",{key:a.id,value:a.id},a.id+" · "+({available:"待领",reserved:"已占用",used:"已使用",uncertain:"待查",blocked:"待修复"}[a.local?.state] || "未核验"))))):
          h("nav",{"aria-label":"账号列表",style:{display:"grid",gap:4,maxHeight:"min(65vh,600px)",overflowY:"auto",padding:3,margin:-3}},...filtered.map(a=>button(
            h("span",{style:{display:"grid",gap:4,textAlign:"left",minWidth:0}},h("span",{style:{...actions,justifyContent:"space-between",gap:8}},h("strong",null,a.id),h("span",{className:"text-caption text-subtle"},({available:"待领",reserved:"已占用",used:"已使用",uncertain:"待查",blocked:"待修复"}[a.local?.state] || "未核验"))),h("span",{className:"text-subtle text-caption",style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},a.login)),
            ()=>setSelected(a.id),false,{key:a.id,"aria-label":a.id+" 选择账号","aria-pressed":a.id===selected,style:{width:"100%",padding:"12px",border:a.id===selected?"1px solid var(--border-prominent)":"1px solid transparent",background:a.id===selected?"var(--surface-navigation-selected)":"transparent",borderRadius:10}}))),
          !filtered.length&&!loading?h("p",{className:"text-subtle text-caption"},"没有匹配账号"):null),
        account?h(Card,{key:snapshot.scope+":"+account.id+":"+account.source,account,snapshot,destination:dest,refresh}):h("p",{style:box,className:"text-subtle"},loading?"读取账号中…":"选择账号以查看收码资料")),
      h("p",{className:"text-subtle text-caption",style:{margin:0}},"领取 ≠ 登录或额度可用 · 凭据与验证码不写入插件日志 · 本机领取"));
  }

  ctx.pages.register({id:"main",title:"higgsfiled号池1.4",primary:true,component:Workspace});
  ctx.panels.register({id:"mailbox",title:"higgsfiled号池1.4",matches:target=>/^higgsfield-mailbox:(?:pool|HF-\d{3,})$/.test(target),component:Workspace,
    channelPlacement:"side",channelLauncher:({toggle})=>button("号池邮箱",()=>toggle("higgsfield-mailbox:pool"))});
}
