// The owner-scoped source descriptor stays in Artifact preferences, never in the bundle.
export const MOBILE_PREF='review-mobile-source';
export function validateMobileBinding(value,owner){if(value==null)return null;if(value.schema!==1||value.owner!==owner||!Number.isInteger(value.revision)||value.revision<1||typeof value.channel!=='string'||!value.channel||!/^[a-f0-9]{64}$/.test(value.message)||!/^https:\/\/[^\s]+\.html?(?:[?#]|$)/i.test(value.url))throw Error('手机稿来源无效');const u=new URL(value.url);if(u.username||u.password)throw Error('手机稿来源无效');return value;}
export async function readMobileMessage(session,binding,check){check();const roster=session.channels.list(),channel=roster.channels.find(c=>c.id===binding.channel);if(roster.status!=='ready'||!channel||channel.archived||channel.cached||channel.pending||channel.metadataCached||channel.metadataPending||!channel.members?.includes(session.viewer))throw Error('当前身份无权读取手机稿');const thread=session.thread(binding.channel,binding.message,{exact:true});try{await thread.refresh();check();const s=thread.snapshot(),row=s.target;if(s.targetStatus!=='ready'||row?.id!==binding.message||row.channelId!==binding.channel||row.edited||row.delivery&&!['accepted','seen'].includes(row.delivery))throw Error('手机稿原消息不可用');const urls=[...(row.attachments||[]).map(a=>a.url),...String(row.content||'').matchAll(/https:\/\/[^\s<>"'()]+/g)].map(v=>typeof v==='string'?v:v[0]);if(!urls.includes(binding.url))throw Error('手机稿不是该消息的附件');return row;}finally{thread.dispose();}}
export const phoneScreens=[
 ['invite','活动邀请'],['discover','小红书／发现'],['template','选择模板'],
 ['upload','上传与制作'],['generating','生成中'],['result','作品结果'],
 ['save_choice','领取与保存'],['register','注册保存'],['ios','iPhone 保存'],['android','Android 保存']
];

export function embeddedMobileHTML(html){
 if(typeof html!=='string'||html.length>50*1024*1024||!/<html[\s>]/i.test(html))throw Error('手机稿HTML无效或过大');
 // This is an embedded viewer. The original standalone gallery makes a second full DOM.
 const viewer=html.replace('renderMain();const query=new URLSearchParams(location.search);','const query=new URLSearchParams(location.search);');
 const css=`html[data-report-embed] body{margin:0;background:transparent}
html[data-report-embed] body>:not(#viewer):not(#report-flow){display:none!important}
html[data-report-embed] .viewer{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important}
html[data-report-embed] .viewer::backdrop{background:transparent}
html[data-report-embed] .viewer-bar,html[data-report-embed] .viewer-info{display:none!important}
html[data-report-embed] .viewer-layout{display:flex!important;justify-content:center!important;align-items:center!important;padding:0!important;width:100%;height:100%!important;background:transparent}
html[data-report-embed] #viewerStage{display:flex;justify-content:center;align-items:center;width:100%;height:100%}
#report-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,175px),1fr));gap:14px;padding:8px;align-items:start;color:var(--ink,#222)}
#report-flow article{min-width:0;padding:8px;background:#f2f3f6;border-radius:12px}
#report-flow button{display:block;margin:0 0 8px;padding:4px;font:inherit;text-align:left;color:#222}`;
 const screenList=JSON.stringify(phoneScreens);
 const script=`(() => {
  const screens=${screenList};
  const flat=document.createElement('div');flat.id='report-flow';flat.hidden=true;document.body.append(flat);
  const reportScreen=()=>{
   const key=location.hash.slice(1)||'invite';
   if (key==='flat' && typeof device==='function' && typeof pageByKey==='function') {
    if(typeof closeViewer==='function'&&document.querySelector('#viewer').open)closeViewer();
    if(!flat.childElementCount){
     for(const [screen,title] of screens){
      if(!pageByKey(screen))continue;
      const article=document.createElement('article'),button=document.createElement('button');
      button.type='button';button.textContent=title;
      button.addEventListener('click',()=>{location.hash=screen});
      article.append(button);article.insertAdjacentHTML('beforeend',device(screen,true));flat.append(article);
     }
    }
    flat.hidden=false;
    if(typeof fitDevices==='function')fitDevices();
   } else {
    flat.hidden=true;
    if(screens.some(([screen])=>screen===key)&&typeof openPage==='function')openPage(key);
   }
  };
  addEventListener('hashchange',reportScreen);reportScreen();
 })();`;
 return viewer.replace(/<\/body>/i,`<script>${script}</script></body>`).replace(/<head([^>]*)>/i,`<head$1><style>${css}#report-flow[hidden]{display:none}</style><script>document.documentElement.dataset.reportEmbed='1';</script>`);
}
