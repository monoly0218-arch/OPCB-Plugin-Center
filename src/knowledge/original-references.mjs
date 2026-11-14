// Do not silently fetch foreign media or export temporary authorization tickets.
export function originalURL(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.href.length>2000||[...u.searchParams.keys()].some(k=>/^(token|signature|expires|password|accesskeyid|x-amz-.+|x-oss-.+)$/i.test(k)))return null;return u.href;}catch{return null;}
}
export function createOriginalReferences(React){
 const h=React.createElement;
 return function Originals({items=[]}){
  const allowed=items.filter(item=>originalURL(item.url));
  if(!allowed.length)return null;
  return h('section',{className:'kn-originals','aria-label':'关联原件'},h('h3',null,'关联原件'),h('p',{className:'kn-description'},'已关联原始地址；访问仍由来源站验证。链接不代表原件已归档或转写。'),...allowed.map((item,i)=>h('a',{key:i,href:originalURL(item.url),target:'_blank',rel:'noopener noreferrer',className:'kn-original-link'},h('span',null,item.name),h('span',{className:'v2-meta'},String(item.kind).toUpperCase(),' · 打开来源 ↗'))));
 };
}
