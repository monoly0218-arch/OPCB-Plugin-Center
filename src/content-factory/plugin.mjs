import {createProductionStore} from './production-store.mjs';
import {createProductionPanel} from './production-ui.mjs';
import {registerProductionAgent} from './production-agent.mjs';
import {STATUS} from './production-model.mjs';
import {roleBinding} from '../media-workspace/role-binding.mjs';
import {registerWorkspaceFonts} from '../media-workspace/fonts.mjs';
import {createExecutionPanel} from '../media-workspace/execution.mjs';
import {createSplitPane} from '../media-workspace/split-pane.mjs';
import {createFactoryPlayer} from './media-player.mjs';
import {createMediaUI} from '../media-workspace/ui.mjs';
import { FACTORY_STAGES, likes, inStage, materialRows, resultVersions } from './model.mjs';
export const inject = [
  "react",
  "pages",
  "browser",
  "relay",
  "conversation",
  "host",
  "agents",
];

// One in-memory owner for the page and the explicitly linked Solo. Website
// cookies and temporary media tickets never cross the agent-tool boundary.
export function createFactoryWorkspace(ctx) {
  const origin = "https://staging.paolab.cn";
  let connection;
  let token = "";
  let binding;
  let epoch = 0;
  let readVersion = 0;
  let linkVersion = 0;
  let writing = false;
  let disposed = false;
  let lastVote = null;
  let state = {
    data: null,
    selected: "",
    channel: "",
    proposal: null,
    website: false,
    loading: false,
    syncRequired: false,
    error: "",
  };
  const listeners = new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const notify of listeners) notify();
  };
  function same(a, b) {
    return (
      a &&
      b &&
      a.session === b.session &&
      a.session?.viewer === b.session?.viewer &&
      a.scope === b.scope &&
      a.generation === b.generation &&
      b.status === "ready" &&
      !b.cached
    );
  }
  function check(expected = connection, version = epoch) {
    if (disposed || version !== epoch || !same(expected, ctx.relay.snapshot()))
      throw new Error("账号或社区已变化，请重新连接工厂。");
  }
  function reset(next) {
    epoch++;
    readVersion++;
    linkVersion++;
    token = "";
    binding = undefined;
    lastVote = null;
    writing = false;
    connection = next;
    publish({
      data: null,
      selected: "",
      channel: "",
      proposal: null,
      website: false,
      loading: false,
      syncRequired: false,
      error: "",
    });
  }
  async function request(path, method = "GET", body) {
    const started = connection,
      version = epoch;
    check(started, version);
    const result = await ctx.host.request({
      url: `${origin}/ins${path}`,
      method,
      timeoutMs: 20000,
      headers: {
        Origin: "tauri://localhost",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    check(started, version);
    if (result.status === 401) {
      reset(started);
      publish({ error: "工厂连接已过期，请重新连接当前 Buzz 角色。" });
      throw new Error("工厂连接已过期，请重新连接当前 Buzz 角色。");
    }
    let value;
    try {
      value = JSON.parse(result.body);
    } catch {
      throw new Error("工厂没有返回有效数据，请重试。");
    }
    if (result.status < 200 || result.status >= 300)
      throw new Error(
        result.status === 409
          ? "素材已更新，请刷新后核对版本；未自动重试保存。"
          : typeof value?.error === "string"
            ? value.error
            : `工厂请求失败（${result.status}）`,
      );
    return value;
  }
  async function load() {
    const sequence = ++readVersion;
    const data = await request("/api/state");
    if (
      !data ||
      !["cards", "members", "reviews", "comments", "source_images"].every((k) =>
        Array.isArray(data[k]),
      ) ||
      !data.current_member ||
      typeof data.current_member.id !== "string" ||
      !data.cards.every(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          (c.note === undefined || typeof c.note === "string") &&
          typeof c.status === "string" &&
          Number.isSafeInteger(c.version) &&
          c.version >= 0,
      ) ||
      !data.members.every(
        (m) => m && typeof m.id === "string" && typeof m.name === "string",
      ) ||
      !data.reviews.every(
        (r) =>
          r && typeof r.card_id === "string" && typeof r.verdict === "string",
      ) ||
      !data.comments.every(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.card_id === "string" &&
          typeof c.text === "string",
      ) ||
      !data.source_images.every(
        (i) =>
          i &&
          typeof i.card_id === "string" &&
          Number.isFinite(i.position) &&
          typeof i.url === "string",
      )
    )
      throw new Error("素材数据不完整，请核对原服务。");
    if (sequence !== readVersion)
      throw new Error("有更新的读取正在进行，请重试。");
    const currentBinding = roleBinding(connection,'factory');
    const members = data.members.filter(m=>m.name===currentBinding.member);
    if(!binding || binding.owner!==currentBinding.owner || members.length!==1 || data.current_member.id!==members[0].id) {
      reset(connection);
      throw Error('工厂返回的成员与当前 Buzz 角色不一致，已停止连接');
    }
    const selected = data.cards.some((c) => c.id === state.selected)
      ? state.selected
      : "";
    const card = data.cards.find((c) => c.id === selected);
    const proposal =
      state.proposal &&
      card?.id === state.proposal.id &&
      card.version === state.proposal.version
        ? state.proposal
        : null;
    publish({ data, selected, proposal, syncRequired: false, error: "" });
    return data;
  }
  async function busy(action) {
    if (writing) throw new Error("上一项操作还未完成。");
    check();
    const version = epoch;
    writing = true;
    publish({ loading: true, error: "" });
    try {
      return await action();
    } catch (error) {
      if (version === epoch) publish({ error: error.message });
      throw error;
    } finally {
      if (version === epoch) {
        writing = false;
        publish({ loading: false });
      }
    }
  }
  function select(id) {
    check();
    if (id && !state.data?.cards.some((c) => c.id === id))
      throw new Error("素材已不在当前列表。");
    linkVersion++;
    publish({ selected: id, proposal: null, website: false });
  }
  function channel(id) {
    check();
    linkVersion++;
    publish({ channel: id, proposal: null });
  }
  function authorize(client, context, expectedLink) {
    check();
    if (state.website) throw new Error('原站操作中的选择不会传给助手；请返回原生素材并选择素材后再使用工具。');
    const agentConnection = ctx.agents.relay(client.key)?.snapshot();
    const roster = connection.session.channels.list();
    const chat = roster.channels.find(
      (c) => c.id === state.channel && c.id === context.channel,
    );
    if (
      !token ||
      writing ||
      state.syncRequired ||
      !state.data ||
      agentConnection?.status !== "ready" ||
      agentConnection.cached ||
      agentConnection.scope !== connection.scope ||
      expectedLink !== linkVersion ||
      client.owner !== connection.session.viewer ||
      roster.status !== "ready" ||
      !chat ||
      chat.creator !== client.owner ||
      chat.channelType !== "solo" ||
      chat.private !== true ||
      chat.archived ||
      chat.cached ||
      chat.pending ||
      chat.metadataPending ||
      chat.readOnly ||
      chat.members?.length !== 2 ||
      !chat.members.includes(client.owner) ||
      !chat.members.includes(client.pubkey)
    )
      throw new Error(
        "请在工厂页面连接本人 Buzz 角色并关联与本 Agent 的私人 Solo。",
      );
  }
  function publicCard(card) {
    return {
      id: card.id,
      title: card.title,
      note: card.note,
      version: card.version,
      status: card.status,
      platform: card.platform,
      source_url: factorySourceUrl(card.source_url),
      media_status: card.media_status,
      has_media: !!card.media_url,
      result_revision: card.result_revision,
    };
  }
  return {
    snapshot: () => state,
    subscribe(notify) {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    bind(next) {
      if (!same(connection, next)) reset(next);
    },
    valid(next) {
      return !disposed && same(connection, next);
    },
    dispose() {
      reset(undefined);
      disposed = true;
      listeners.clear();
    },
    logout() {
      reset(connection);
    },
    select,
    channel,
    website(open) {
      check();
      linkVersion++;
      publish({ website: open, selected: '', proposal: null });
    },
    refresh: () => busy(load),
    connect() {
      return busy(async () => {
        const next = roleBinding(connection,'factory');
        const value = await request('/api/opcb/login','POST',{name:next.member});
        if(typeof value?.token!=='string'||!value.token)throw Error('服务未提供工厂连接');
        binding=next; token=value.token;
        await load();
      });
    },
    async act(card, action, extra = {}) {
      const allowed = ['yes','no','undo','comment','confirm','start','approve','revise','return','archive','restore','retry'];
      if (!allowed.includes(action) || !card) throw new Error('未知素材操作。');
      if(state.syncRequired)throw new Error('上一项操作尚未回读，请先刷新核对。');
      return busy(async () => {
        const observed = (await load()).cards.find(c => c.id === card.id);
        if (!observed || observed.version !== card.version || (['approve','revise'].includes(action) && observed.result_revision !== card.result_revision))
          throw new Error('素材已更新，请核对最新版本后再操作。');
        const base = `/api/cards/${encodeURIComponent(card.id)}`;
        const write=async(...args)=>{publish({syncRequired:true});try{return await request(...args);}catch(e){throw new Error('操作结果待核对，请先刷新；未自动重试。'+e.message);}};
        if (['yes','no','undo'].includes(action)) {
          const old = state.data.reviews.find(r=>r.card_id===card.id && r.member_id===state.data.current_member.id)?.verdict;
          if(action==='undo' && (!lastVote || lastVote.id!==card.id || lastVote.next!==old)) throw new Error('没有可撤销的本次评审。');
          const next = action==='undo'?lastVote.old:old===action?undefined:action;
          lastVote = null;
          await write(base+'/review', next?'POST':'DELETE', next?{verdict:next}:undefined);
          if(action!=='undo') lastVote={id:card.id,old,next};
        } else if(action==='comment') {
          const text=typeof extra.text==='string'?extra.text.trim():'';
          if(!text || text.length>3000) throw new Error('评价须为1—3000字。');
          await write(base+'/comments','POST',{text});
        } else if(action==='retry') {
          await write(base+'/media','POST',{});
        } else {
          const body={action,version:card.version};
          if(['approve','revise'].includes(action))body.result_revision=card.result_revision;
          if(action==='revise') {
            if(typeof extra.note!=='string' || !extra.note.trim())throw new Error('请选择或填写修改意见。');
            body.note=extra.note.trim().slice(0,3000);
          }
          await write(base+'/workflow','POST',body);
        }
        // Lock mutations after an accepted write until the authoritative read succeeds.
        publish({syncRequired:true});
        try {await load();}catch {throw new Error('操作已提交，回读失败；请刷新核对，未重复提交。');}
      });
    },
    async collect(raw) {
      const urls=[...new Set((String(raw).match(/https?:\/\/[^\s<>"']+/g)||[]).map(s=>s.replace(/[，。；)）]+$/,'')))].slice(0,50);
      if(!urls.length)throw new Error('请粘贴素材链接。');
      if(state.syncRequired)throw new Error('上一项操作尚未回读，请先刷新核对。');
      return busy(async()=>{publish({syncRequired:true});const result=await request('/api/collect','POST',{urls});try{await load();}catch{throw new Error('收集已提交，回读失败；请刷新核对，未重复提交。');}return result;});
    },
    async save(proposal) {
      if(state.syncRequired)throw new Error('上一项操作尚未回读，请先刷新核对。');
      if (proposal !== state.proposal || proposal.id !== state.selected)
        throw new Error("修改建议已失效，请重新核对素材。");
      return busy(async () => {
        await load();
        const card = state.data.cards.find((c) => c.id === proposal.id);
        if (
          card?.version !== proposal.version ||
          proposal !== state.proposal ||
          card.id !== state.selected
        )
          throw new Error("素材已更新，请重新生成修改建议。");
        publish({ proposal: null });
        await request(`/api/cards/${encodeURIComponent(card.id)}`, "PATCH", {
          version: proposal.version,
          title: proposal.title,
          note: proposal.note,
        });
        // Invalidate suggestions even if the subsequent read fails. Never replay
        // an uncertain write; Retry is a read of the authoritative server state.
        const fresh = await load();
        const observed = fresh.cards.find((c) => c.id === proposal.id);
        if (
          !observed ||
          observed.version <= proposal.version ||
          observed.title !== proposal.title ||
          (observed.note ?? "") !== proposal.note
        )
          throw new Error(
            "服务器回读与建议不一致，请核对当前素材；未重试保存。",
          );
      });
    },
    dismiss() {
      publish({ proposal: null });
    },
    async tool(client, context, args) {
      const version = linkVersion,
        started = connection,
        generation = epoch;
      authorize(client, context, version);
      const data = await load();
      check(started, generation);
      authorize(client, context, version);
      const action = args.action ?? "read";
      const id = args.id || state.selected;
      if (action === "read") {
        const query =
          typeof args.query === "string"
            ? args.query.slice(0, 200).toLowerCase()
            : "";
        const cards = data.cards.filter(
          (c) =>
            (!args.id || c.id === args.id) &&
            (!query ||
              `${c.title} ${c.note ?? ""} ${c.platform ?? ""}`
                .toLowerCase()
                .includes(query)),
        );
        const selected = data.cards.find((c) => c.id === state.selected);
        return JSON.stringify({
          selected: selected ? publicCard(selected) : null,
          total: cards.length,
          cards: cards.slice(0, 60).map(publicCard),
          truncated: cards.length > 60,
        });
      }
      const card = data.cards.find((c) => c.id === id);
      if (!card) throw new Error("素材不存在，请先读取素材 ID。");
      if (action === "focus") {
        select(card.id);
        return JSON.stringify({ focused: publicCard(card) });
      }
      if (
        action !== "propose_edit" ||
        id !== state.selected ||
        args.version !== card.version ||
        typeof args.title !== "string" ||
        !args.title.trim() ||
        args.title.length > 200 ||
        typeof args.note !== "string" ||
        args.note.length > 5000
      )
        throw new Error("请先定位素材，按当前版本提供标题与备注修改建议。");
      publish({
        website: false,
        proposal: {
          id,
          version: card.version,
          title: args.title.trim(),
          note: args.note,
        },
      });
      return JSON.stringify({
        proposed: true,
        saved: false,
        id,
        version: card.version,
        next: "修改建议已显示在素材详情，等待用户点击保存。",
      });
    },
  };
}

export function factorySourceUrl(raw) {
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname !== "local.adflow.invalid" &&
      !url.searchParams.has("opcb_media") &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function factoryMediaUrl(raw) {
  try {
    const url = new URL(raw);
    return url.origin === "https://staging.paolab.cn" &&
      !url.username &&
      !url.password &&
      /^\/ins\/(media|results|images|posters)\/[a-zA-Z0-9._/-]+$/.test(
        url.pathname,
      ) &&
      !url.pathname.includes("..") &&
      url.searchParams.has("opcb_media")
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function apply(ctx) {
  const React = ctx.react;
  const h = React.createElement;
  const {Icon,Tool,Mark,Header,Pager}=createMediaUI(React);
  registerWorkspaceFonts(ctx);
  const Player=createFactoryPlayer(ctx),useSplitPane=createSplitPane(React);
  const column = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    minWidth: 0,
  };
  const inset = { padding: "var(--space-panel-inset)" };
  const row = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-2)",
    flexWrap: "wrap",
  };
  const workspace = createFactoryWorkspace(ctx);
  const production=createProductionStore(ctx);
  const ProductionPanel=createProductionPanel(ctx,production,id=>workspace.channel(id));
  registerProductionAgent(ctx,production);
  ctx.effect(() => {
    const changed = () => {const next=ctx.relay.snapshot();workspace.bind(next);production.bind(next);};
    const unsubscribe = ctx.relay.subscribe(changed);
    changed();
    return () => {
      unsubscribe();
      workspace.dispose();
      production.dispose();
    };
  });
  const button = (label, onClick, props = {}) =>
    h("button", { type: "button", onClick, ...props }, label);
  const status = (text, error = false) =>
    h(
      "p",
      {
        role: error ? "alert" : "status",
        className: "text-secondary",
        style: { margin: 0 },
      },
      text,
    );
  const stages = FACTORY_STAGES;
  const useState = () =>
    React.useSyncExternalStore(
      workspace.subscribe,
      workspace.snapshot,
      workspace.snapshot,
    );
  const run = (action) => {
    void action().catch(() => {});
  };
  const ExecutionPanel=createExecutionPanel(ctx,{pluginId:'opcb.content-factory',title:'内容工厂',onChannel:id=>workspace.channel(id)});

  function SignIn() {
    const state=useState();
    return h('section',{className:'fw-signin','aria-label':'当前 Buzz 角色连接'},
      h('h2',null,state.loading?'正在进入内容工厂':'内容工厂连接'),
      h('p',null,state.loading?'正在绑定当前 Buzz 角色…':'使用当前 Buzz 身份与已有工厂权限'),
      state.error&&status(state.error,true),
      !state.loading&&h('button',{type:'button',onClick:()=>run(()=>workspace.connect())},'重新连接'));
  }

  function Detail({card,data,stage,onLater}) {
    const state=useState(),[result,showResult]=React.useState(['review','ready'].includes(stage)?card.result_revision||0:0),[imageIndex,setImage]=React.useState(0);
    const [draft,setDraft]=React.useState(commentDrafts.get(card.id)||''),[revise,setRevise]=React.useState(false),[feedback,setFeedback]=React.useState('');
    const mine=data.reviews.find(r=>r.card_id===card.id&&r.member_id===data.current_member.id)?.verdict;
    const act=(action,extra)=>run(()=>workspace.act(card,action,extra));
    const versions=resultVersions(data,card),historical=versions.find(v=>v.revision===result);
    const selectedMedia=!result?card.media_url:result===card.result_revision?card.result_media_url:historical?.media_url;
    const preview=factoryMediaUrl(selectedMedia);
    const images=data.source_images.filter(i=>i.card_id===card.id).slice().sort((a,b)=>a.position-b.position).map(i=>factoryMediaUrl(i.url)).filter(Boolean);
    const comments=data.comments.filter(c=>c.card_id===card.id),source=factorySourceUrl(card.source_url);
    const proposal=state.proposal;
    const reviewers=data.reviews.filter(r=>r.card_id===card.id&&r.verdict==='yes').map(r=>data.members.find(m=>m.id===r.member_id)?.name||'团队成员');
    return h('article',{className:'mw-detail','aria-label':'素材详情'},
      h('div',{className:'mw-detail-top'},h(Tool,{label:'返回素材',icon:'left',className:'mw-tool mw-back',onClick:()=>workspace.select('')}),h('span',{className:'mw-eyebrow'},card.platform||'素材'),h('span',{className:'mw-spacer'}),h('span',{className:'mw-tag mw-numeric'},`v${card.version}`),source&&h('a',{className:'mw-tool',href:source,target:'_blank',rel:'noopener noreferrer','aria-label':'原始链接'},h(Icon,{name:'arrow'}))),
      h('h1',null,card.title.replace(/^(Instagram视频|小红书图文|小红书视频)\s*·\s*/,'')),
      h('div',{className:'mw-detail-attributes'},h('span',{className:'mw-tag mw-tag-green'},`${likes(data,card.id)} 人认可`),h('span',{className:'mw-tag'},stages.find(([id])=>id===stage)?.[1]||card.status)),
      h('div',{className:'mw-hero','data-media':!result&&images.length?'image':'video'},!result&&images.length?
        h('img',{src:images[Math.min(imageIndex,images.length-1)],alt:card.title,referrerPolicy:'no-referrer'}):
        preview?h(Player,{key:preview,source:preview,poster:factoryMediaUrl(card.poster_url),onOpenWebsite:()=>workspace.website(true)}):
        h('div',{className:'mw-media-unavailable'},h(Mark,{name:'rocket',size:50}),h('span',null,card.media_status==='ready'?'预览暂不可用':'媒体处理中'),source&&h('a',{href:source,target:'_blank',rel:'noopener noreferrer'},'打开原始链接'))),
      !result&&images.length>1&&h('div',{className:'mw-image-controls'},h(Tool,{label:'上一张图片',icon:'left',disabled:imageIndex===0,onClick:()=>setImage(i=>i-1)}),h('span',{className:'mw-numeric'},`${imageIndex+1} / ${images.length}`),h(Tool,{label:'下一张图片',icon:'right',disabled:imageIndex+1>=images.length,onClick:()=>setImage(i=>i+1)})),
      card.result_media_url&&h('div',{className:'mw-version-row'},h('button',{type:'button','aria-pressed':!result,onClick:()=>showResult(0)},'原素材'),h('select',{'aria-label':'选择成片版本',value:result,onChange:e=>showResult(Number(e.target.value))},h('option',{value:0},'成片版本'),!versions.some(v=>v.revision===card.result_revision)&&h('option',{value:card.result_revision},`第 ${card.result_revision} 版 · 当前`),versions.map(v=>h('option',{key:v.revision,value:v.revision},`第 ${v.revision} 版${v.revision===card.result_revision?' · 当前':''}`)))),
      h('section',{className:'mw-workflow','aria-label':'当前环节操作'},
        h('div',{className:'mw-workflow-heading'},h('strong',null,stages.find(([id])=>id===stage)?.[1]),h('span',{className:'mw-eyebrow'},data.members.find(m=>m.id===card.owner_id)?.name||'')),
        card.confirmation_member_id&&h('p',{className:'mw-eyebrow'},`指定确认：${data.members.find(m=>m.id===card.confirmation_member_id)?.name||'团队成员'}${card.confirmed_by?' · 已确认':''}`),
        card.review_feedback&&h('p',{className:'mw-feedback'},card.review_feedback),
        h('div',{className:'mw-action-row'},
          ['inbox','rank'].includes(stage)&&h(React.Fragment,null,button('认可',()=>act('yes'),{'aria-pressed':mine==='yes',disabled:state.loading||state.syncRequired,className:'mw-primary'}),button('不认可',()=>act('no'),{'aria-pressed':mine==='no',disabled:state.loading||state.syncRequired}),button('撤销上次评审',()=>act('undo'),{disabled:state.loading||state.syncRequired}),button('稍后看',onLater,{disabled:state.loading||state.syncRequired})),
          stage==='rank'&&button('进入素材确认',()=>act('confirm'),{disabled:state.loading||state.syncRequired,className:'mw-primary'}),
          stage==='confirm'&&button('开始制作',()=>act('start'),{disabled:state.loading||state.syncRequired,className:'mw-primary'}),
          stage==='progress'&&button(card.result_revision?'在原站提交新版本':'在原站上传成片',()=>workspace.website(true),{className:'mw-primary'}),
          stage==='review'&&h(React.Fragment,null,button('通过当前成片',()=>act('approve'),{disabled:state.loading||state.syncRequired||!result||result!==card.result_revision,className:'mw-primary'}),button('退回修改',()=>setRevise(!revise),{disabled:state.loading||state.syncRequired})),
          stage==='ready'&&button('在原站下载与交付',()=>workspace.website(true),{className:'mw-primary'}),
          stage==='discarded'&&button('恢复素材',()=>act('restore'),{disabled:state.loading||state.syncRequired,className:'mw-primary'}),
          stage==='downloads'&&button('重试媒体下载',()=>act('retry'),{disabled:state.loading||state.syncRequired||['queued','downloading'].includes(card.media_status)})),
        stage==='review'&&(!result||result!==card.result_revision)&&h('p',{className:'mw-eyebrow'},'切换至当前成片后可通过审核'),
        stage==='downloads'&&h('p',{className:'mw-eyebrow'},card.media_error||({queued:'等待下载',downloading:'下载中',failed:'下载失败'}[card.media_status]||card.media_status)),
        revise&&h('form',{className:'mw-form',onSubmit:e=>{e.preventDefault();act('revise',{note:feedback});}},h('div',{className:'mw-action-row'},['调整字幕','优化节奏','调整画面','改善音频','调整封面'].map(t=>button(t,()=>setFeedback(s=>s?s+'；'+t:t),{key:t}))),h('textarea',{'aria-label':'退回修改意见',rows:3,value:feedback,onChange:e=>setFeedback(e.target.value),placeholder:'补充具体修改意见'}),h('button',{type:'submit',disabled:state.loading||state.syncRequired||!feedback.trim(),className:'mw-button mw-primary'},'提交退改意见')),
        ['confirm','progress','review','ready'].includes(stage)&&h('details',{className:'mw-secondary-actions'},h('summary',null,'更多操作'),button('退回灵感收集',()=>act('return'),{disabled:state.loading||state.syncRequired}))),
      proposal&&h('section',{className:'mw-proposal','aria-label':'助手修改建议'},h('h2',null,'助手修改建议'),h('p',null,`基于素材 v${proposal.version}`),h('strong',null,proposal.title),h('p',null,proposal.note||'清空备注'),h('div',{className:'mw-action-row'},button('保存标题与备注',()=>run(()=>workspace.save(proposal)),{disabled:state.loading||state.syncRequired}),button('放弃建议',()=>workspace.dismiss(),{disabled:state.loading||state.syncRequired}))),
      reviewers.length>0&&h('details',{className:'mw-comments'},h('summary',null,`认可成员 · ${reviewers.length}`),h('p',null,reviewers.join('、'))),
      card.note&&h('section',{className:'mw-note'},h('h2',null,'Notes'),h('p',null,card.note)),
      h('details',{className:'mw-comments',open:true},h('summary',null,`团队评价 · ${comments.length}`),comments.length?comments.map(c=>h('div',{key:c.id,className:'mw-comment'},h('strong',null,data.members.find(m=>m.id===c.member_id)?.name||'团队成员'),h('p',null,c.text))):h('p',null,'还没有评价')),
      h('form',{className:'mw-form mw-comment-form',onSubmit:async e=>{e.preventDefault();try{await workspace.act(card,'comment',{text:draft});commentDrafts.delete(card.id);setDraft('');}catch{}}},h('textarea',{'aria-label':'评价内容',rows:2,maxLength:3000,value:draft,onChange:e=>{setDraft(e.target.value);commentDrafts.set(card.id,e.target.value);},placeholder:'说说你的想法…'}),h('button',{type:'submit',disabled:state.loading||state.syncRequired||!draft.trim(),className:'mw-button'},'发送评价')));

  }

  const commentDrafts=new Map();
  const groups = [
    {id:'collect',label:'灵感',icon:'collect',stages:['inbox','rank']},
    {id:'studio',label:'制作',icon:'studio',stages:['confirm','progress','review']},
    {id:'publish',label:'发布',icon:'publish',stages:['ready']},
  ];
  const stageNames={inbox:'Inspiration',rank:'Top picks',confirm:'Selected',progress:'In production',review:'Review',ready:'Ready to publish',downloads:'Downloads',discarded:'Archived'};
  const cleanTitle=title=>title.replace(/^(Instagram视频|小红书图文|小红书视频)\s*·\s*/,'');

  function Materials({connection,chat,showChat,theme,setTheme}) {
    const state=useState(),data=state.data;
    const productionState=React.useSyncExternalStore(production.subscribe,production.snapshot,production.snapshot);
    const [stage,setStage]=React.useState('inbox'),[query,search]=React.useState('');
    const [collecting,setCollecting]=React.useState(false),[links,setLinks]=React.useState(''),[collectResult,setCollectResult]=React.useState(null),[later,setLater]=React.useState([]);
    const [filter,setFilter]=React.useState('unseen'),[collector,setCollector]=React.useState('');
    const [density,setDensity]=React.useState('list'),[filters,showFilters]=React.useState(false);
    const [page,setPage]=React.useState(0),[size,setSize]=React.useState(4);
    const listRef=React.useRef(null);
    const cards=data?materialRows(data,{stage,query,filter,collector}).filter(c=>!later.includes(c.id)):[];
    const currentPage=Math.min(page,Math.max(0,Math.ceil(cards.length/size)-1));
    const visible=cards.slice(currentPage*size,(currentPage+1)*size);
    const selected=visible.find(c=>c.id===state.selected);
    const group=groups.find(g=>g.stages.includes(stage))||groups[0];
    React.useEffect(()=>{
      if(!listRef.current)return;
      const observer=new ResizeObserver(([entry])=>setSize(Math.max(2,Math.min(6,Math.floor((entry.contentRect.height-180)/104)))));
      observer.observe(listRef.current);return()=>observer.disconnect();
    },[Boolean(data)]);
    React.useEffect(()=>{setPage(0);},[stage,query,filter,collector]);
    React.useEffect(()=>{if(stage!=='progress'&&data&&visible[0]&&!selected&&listRef.current?.closest('.media-workspace')?.clientWidth>850)workspace.select(visible[0].id);},[Boolean(data),stage,query,filter,collector,currentPage,visible[0]?.id,selected?.id]);
    function changeStage(next){if(next==='progress')showChat(false);setCollecting(false);setLater([]);setStage(next);setFilter(next==='inbox'?'unseen':'all');setCollector('');workspace.select('');}
    const header=h(Header,{brand:'Factory',mark:'bulb',tabs:groups,active:group.id,onTab:id=>changeStage(groups.find(g=>g.id===id).stages[0]),query,onQuery:value=>{search(value);workspace.select('');},searchLabel:'搜索素材',tools:h(React.Fragment,null,
      h(Tool,{label:'刷新素材',icon:'refresh',disabled:state.loading||!data,onClick:()=>run(workspace.refresh)}),
      stage!=='progress'&&h(Tool,{label:chat?'收起执行会话':'打开执行会话',icon:'chat',pressed:chat,onClick:()=>showChat(!chat)}),
      h(Tool,{label:'切换明暗主题',icon:'moon',onClick:()=>setTheme(theme==='dark'?'light':'dark')}),
      h(Tool,{label:'完整工厂',icon:'arrow',onClick:()=>workspace.website(true),disabled:!ctx.browser.available}))});
    if(!data)return h(React.Fragment,null,header,h('div',{className:'mw-signin-page'},h(SignIn)));
    return h(React.Fragment,null,header,
      h('nav',{className:'mw-stage-navigation','aria-label':'工厂功能页'},groups.flatMap(g=>g.stages).map(id=>h('button',{type:'button',key:id,'aria-current':!collecting&&stage===id?'page':undefined,onClick:()=>changeStage(id)},stages.find(s=>s[0]===id)[1],h('small',{className:'mw-numeric'},data.cards.filter(c=>inStage(data,c,id)).length))),h('span',{className:'mw-spacer'}),h('button',{type:'button','aria-current':collecting?'page':undefined,onClick:()=>{setCollecting(true);workspace.select('');}},'＋ 收集'),h('button',{type:'button','aria-current':!collecting&&stage==='downloads'?'page':undefined,onClick:()=>changeStage('downloads')},'下载队列'),h('button',{type:'button','aria-current':!collecting&&stage==='discarded'?'page':undefined,onClick:()=>changeStage('discarded')},'已收起')),
      collecting?h('section',{className:'mw-panel mw-collection-page','aria-label':'收集灵感工作页'},h('div',{className:'mw-page-heading'},h('div',null,h('h1',null,'收集灵感'),h('span',{className:'mw-heading-meta'},'链接或本地文件，进入同一个素材流程'))),h('div',{className:'mw-collect-columns'},h('form',{className:'mw-form',onSubmit:async e=>{e.preventDefault();try{setCollectResult(await workspace.collect(links));}catch{}}},h(Mark,{name:'bulb',size:62}),h('h2',null,'从链接开始'),h('textarea',{'aria-label':'收集素材链接',rows:7,value:links,onChange:e=>setLinks(e.target.value),placeholder:'粘贴 Instagram 或小红书链接，可一次粘贴多条'}),h('div',{className:'mw-action-row'},h('button',{type:'submit',className:'mw-button mw-primary',disabled:state.loading||state.syncRequired||!links.trim()},'收集链接'),button('查看下载队列',()=>changeStage('downloads'))),collectResult&&h('section',{role:'status'},h('p',null,`新增 ${collectResult.added?.length||0} 条，失败 ${collectResult.errors?.length||0} 条`),(collectResult.errors||[]).map((e,i)=>h('p',{key:i},e.error))),state.error&&status(state.error,true)),h('section',{className:'mw-upload-zone'},h(Mark,{name:'rocket',size:62}),h('h2',null,'上传本地视频'),h('p',null,'原站保留文件队列、拖放和粘贴上传'),button('在原站选择文件',()=>workspace.website(true),{className:'mw-button'})))):
      h('div',{className:'mw-split','data-detail':Boolean(selected)?'open':'closed'},
        h('section',{className:'mw-panel mw-library',ref:listRef,'aria-label':'工厂素材'},
          h('div',{className:'mw-page-heading'},h('div',null,h('h1',null,stageNames[stage]),h('span',{className:'mw-heading-meta'},stages.find(s=>s[0]===stage)[1])),
            h('span',{className:'mw-count mw-numeric'},cards.length)),
          h('div',{className:'mw-filter-row'},

            ...(stage==='inbox'?[['unseen','待我评审'],['all','全部']]:[]).map(([id,label])=>h('button',{key:id,type:'button','aria-pressed':filter===id,onClick:()=>{setFilter(id);workspace.select('');}},label)),
            ['inbox','rank'].includes(stage)&&button('原站滑卡评审',()=>workspace.website(true)),later.length>0&&button(`恢复稍后看 · ${later.length}`,()=>setLater([])),h('span',{className:'mw-spacer'}),
            h(Tool,{label:'素材筛选',icon:'filter',pressed:filters,onClick:()=>showFilters(!filters)}),
            h(Tool,{label:'切换素材布局',icon:density==='list'?'grid':'list',onClick:()=>setDensity(density==='list'?'grid':'list')})),
          filters&&h('div',{className:'mw-expanded-filters'},h('select',{'aria-label':'按收集者筛选',value:collector,onChange:e=>{setCollector(e.target.value);workspace.select('');}},h('option',{value:''},'全部收集者'),data.members.map(m=>h('option',{key:m.id,value:m.id},m.name))),h('button',{type:'button',onClick:()=>{setCollector('');search('');}},'清空筛选')),
          state.error&&status(state.error,true),
          h('div',{className:'mw-material-list','data-layout':density,'aria-label':'素材列表'},visible.map((card,index)=>{
            const poster=factoryMediaUrl(card.poster_url)||factoryMediaUrl(data.source_images.find(i=>i.card_id===card.id)?.url);
            const count=likes(data,card.id);
            const pd=productionState.records[card.id]?.doc,pv=pd?.versions.find(v=>v.id===pd.currentVersion);
            return h('button',{type:'button',key:card.id,className:'mw-media-row',disabled:stage==='progress'&&productionState.pending,'aria-current':selected?.id===card.id?'true':undefined,'data-production-state':stage==='progress'?pv?.status:undefined,'aria-label':`查看素材：${card.title}`,onClick:()=>{workspace.select(card.id);if(stage==='progress')run(()=>production.open(card,currentPage*size+index+1));}},
              h('span',{className:'mw-thumbnail'},poster?h('img',{src:poster,alt:'',loading:'lazy',referrerPolicy:'no-referrer'}):h(Mark,{name:card.media_kind==='xhs_images'?'pin':'rocket',size:34}),h('span',{className:'mw-preview-button'},h(Icon,{name:card.media_kind==='xhs_images'?'image':'play',size:16}))),
              h('span',{className:'mw-row-copy'},h('span',{className:'mw-row-kicker mw-numeric'},`${String(currentPage*size+index+1).padStart(2,'0')} / ${card.platform||'素材'}`),h('strong',null,cleanTitle(card.title)),h('span',{className:'mw-row-meta'},data.members.find(m=>m.id===card.created_by)?.name||'',h('span',null,`v${card.version}`),stage==='progress'&&h('span',{className:'fp-row-status'},pv?STATUS[pv.status].text:'未开始'))),
              h('span',{className:'mw-like-count','aria-label':`${count} 人认可`},h(Icon,{name:'star',size:15}),h('b',{className:'mw-numeric'},count)));
          }),!cards.length&&h('div',{className:'mw-empty'},h(Mark,{name:'compass',size:58}),h('h2',null,'没有匹配的素材'),h('button',{type:'button',onClick:()=>{search('');setCollector('');setFilter('all');}},'查看全部'))),
          h(Pager,{page:currentPage,total:cards.length,size,onPage:next=>{setPage(next);workspace.select('');}})),
        h('section',{className:'mw-panel mw-current','data-production':stage==='progress'?'true':undefined,'aria-label':stage==='progress'?'执行规划':'当前素材详情'},
          stage==='progress'&&selected?h(ProductionPanel,{key:selected.id,card:selected,connection,onBack:()=>workspace.select('')}):selected?h(Detail,{key:selected.id+stage,card:selected,data,stage,onLater:()=>{setLater(ids=>[...ids,selected.id]);workspace.select('');}}):h('div',{className:'mw-empty'},h(Mark,{name:'compass',size:58}),h('h2',null,'Preview'),h('p',null,'选择一份素材')))));
  }

  function Workspace({connection}) {
    const [chat,showChat]=React.useState(false),[theme,setTheme]=React.useState('host'),[mobile,setMobile]=React.useState('content');
    const [visit,reloadWebsite]=React.useState(0);
    const state=useState(),{website}=state;
    const split=useSplitPane(`opcb.content-factory.split.v1:${connection.scope}:${connection.session.viewer}`,chat);
    const selected=state.data?.cards.find(c=>c.id===state.selected);
    const contextText=selected?`内容工厂素材：${selected.title}\n素材ID：${selected.id}\nversion: ${selected.version}\n来源：${factorySourceUrl(selected.source_url)||'内容工厂'}\n请先读取当前素材，再按我的要求处理。`:'内容工厂工作区：https://staging.paolab.cn/ins/';
    React.useEffect(()=>{void production.refresh();run(()=>workspace.connect());return()=>{commentDrafts.clear();workspace.logout();};},[]);
    React.useEffect(()=>{if(chat)setMobile('conversation');},[chat]);
    const content=website?h(React.Fragment,null,
        h(Header,{brand:'Factory',mark:'bulb',tools:h(React.Fragment,null,h(Tool,{label:'返回素材',icon:'left',onClick:()=>workspace.website(false)},'返回素材'),h(Tool,{label:'重新载入',icon:'refresh',onClick:()=>reloadWebsite(v=>v+1)}),h(Tool,{label:chat?'收起执行会话':'打开执行会话',icon:'chat',pressed:chat,onClick:()=>showChat(!chat)}))}),
        h('div',{className:'mw-site'},h(ctx.browser.View,{key:visit,url:'https://staging.paolab.cn/ins/',storage:'opcb.content-factory',label:'完整工厂 · 原站操作'})))
      :h(Materials,{connection,chat,showChat,theme,setTheme});
    return h('div',{className:'mw-execution-root','data-mobile-pane':mobile,'data-executing':chat?'true':'false'},
      h('style',null,typeof OPCB_FACTORY_ASSETS_UI_CSS==='string'?OPCB_FACTORY_ASSETS_UI_CSS:''),
      chat&&h('nav',{className:'mw-execution-tabs','aria-label':'执行工作区'},h('button',{type:'button','aria-pressed':mobile==='content',onClick:()=>setMobile('content')},'素材'),h('button',{type:'button','aria-pressed':mobile==='conversation',onClick:()=>setMobile('conversation')},'执行会话')),
      h('div',{className:'mw-execution-row',ref:split.row,style:split.style},
        h('div',{className:'opcb-v3 media-workspace mw-execution-content','data-language':'zh','data-theme':theme},content),
        chat&&h('div',{className:'mw-execution-splitter',...split.separator,'aria-label':'调整素材与执行会话宽度'}),
        chat&&h('section',{className:'mw-execution-capsule','aria-label':'执行会话'},
          h('header',null,h('strong',null,'执行会话'),h('button',{type:'button','aria-label':'收起执行会话',onClick:()=>showChat(false)},'×')),
          h(ExecutionPanel,{connection,contextText}))));
  }

  function Factory() {
    const connection = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
      ctx.relay.snapshot,
    );
    return connection.status === "ready" &&
      !connection.cached &&
      connection.session?.viewer &&
      workspace.valid(connection)
      ? h(Workspace, {
          key: `${connection.scope}:${connection.generation}:${connection.session.viewer}`,
          connection,
        })
      : h(
          "p",
          { style: inset, role: "status" },
          "连接当前账号的社区后可打开工厂和对话",
        );
  }
  ctx.pages.register({
    icon: "data:image/svg+xml;base64,PHN2ZwogIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICB3aWR0aD0iMjQiCiAgaGVpZ2h0PSIyNCIKICB2aWV3Qm94PSIwIDAgMjQgMjQiCiAgZmlsbD0ibm9uZSIKICBzdHJva2U9IiMyNjM0NDkiCiAgc3Ryb2tlLXdpZHRoPSIxLjgiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCiAgY2xhc3M9Imljb24gaWNvbi10YWJsZXIgaWNvbnMtdGFibGVyLW91dGxpbmUgaWNvbi10YWJsZXItbW92aWUiCj48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHJ4PSI1IiBmaWxsPSIjZjFmNGY4IiBzdHJva2U9Im5vbmUiLz4KICA8cGF0aCBzdHJva2U9Im5vbmUiIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiIC8+CiAgPHBhdGggZD0iTTQgNmEyIDIgMCAwIDEgMiAtMmgxMmEyIDIgMCAwIDEgMiAydjEyYTIgMiAwIDAgMSAtMiAyaC0xMmEyIDIgMCAwIDEgLTIgLTJsMCAtMTIiIC8+CiAgPHBhdGggZD0iTTggNGwwIDE2IiAvPgogIDxwYXRoIGQ9Ik0xNiA0bDAgMTYiIC8+CiAgPHBhdGggZD0iTTQgOGw0IDAiIC8+CiAgPHBhdGggZD0iTTQgMTZsNCAwIiAvPgogIDxwYXRoIGQ9Ik00IDEybDE2IDAiIC8+CiAgPHBhdGggZD0iTTE2IDhsNCAwIiAvPgogIDxwYXRoIGQ9Ik0xNiAxNmw0IDAiIC8+Cjwvc3ZnPg==",
    id: "factory",
    title: "内容工厂",
    primary: true,
    placement: "dock",
    layout: "workspace",
    component: Factory,
  });
  ctx.agents.addTool({
    name: "opcb_factory_materials",
    description:
      "在内容工厂页面明确关联的私人 Solo 中读取/搜索素材、定位素材或提出标题与备注修改建议。素材ID与版本由原工厂拥有。修改建议显示在详情，须用户点击保存；本工具不写业务数据、不返回署名token或媒体票据。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["read", "focus", "propose_edit"] },
        id: { type: "string" },
        query: { type: "string", maxLength: 200 },
        version: { type: "integer", minimum: 0 },
        title: { type: "string", maxLength: 200 },
        note: { type: "string", maxLength: 5000 },
      },
      additionalProperties: false,
    },
    call: (client, context, args) => workspace.tool(client, context, args),
  });
}
