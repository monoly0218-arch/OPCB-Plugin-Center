// Read-only projection of the deployed asset taxonomy. Never reclassifies data.
export const ASSET_COLLECTIONS=[
  {id:'visual',name:'视觉资产',icon:'star'},
  {id:'brand',name:'品牌资料',icon:'briefcase'},
  {id:'images',name:'图片素材',icon:'pin'},
  {id:'videos',name:'视频素材',icon:'rocket'},
];
export function assetFiles(asset,files,version=asset.versions?.at(-1)) {
  if(!version)return [];
  const ids=version.mediaItems?.flatMap(item=>[item.image,item.video,item.document].filter(Boolean))||version.fileIds||[];
  return ids.map(id=>files.find(file=>file.id===id)).filter(Boolean);
}
export function assetCollection(asset,files) {
  if(ASSET_COLLECTIONS.some(c=>c.id===asset.category))return asset.category;
  if(!['product-knowledge','product','store','brand-content','activities','principal'].includes(asset.category))return '';
  if(asset.category==='product-knowledge')return 'brand';
  const kind=assetFiles(asset,files)[0]?.kind;
  return kind==='video'?'videos':['pdf','presentation','document'].includes(kind)?'brand':'images';
}
export function assetMediaUrl(raw) {
  if(typeof raw!=='string'||!raw)return undefined;
  try {const path=raw.startsWith('/api/assets/')?'/assets'+raw:raw;const url=new URL(path,'https://staging.paolab.cn/assets/');return url.origin==='https://staging.paolab.cn'&&!url.username&&!url.password&&url.pathname.startsWith('/assets/')?url.href:undefined;}catch{return undefined;}
}
export function assetRows(data,{query='',collection='',kind='',mine=false}={}) {
  const q=query.trim().toLocaleLowerCase();
  return data.assets.filter(a=>!a.trashed&&(!collection||assetCollection(a,data.files)===collection)&&(!mine||a.createdById===data.user.id)&&(!kind||assetFiles(a,data.files).some(f=>f.kind===kind))&&(!q||[a.title,a.project,a.subject,a.caption,...a.tags||[]].join(' ').toLocaleLowerCase().includes(q)))
    .slice().sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
}

export const ASSET_TOPICS={
  visual:[['logo','标识'],['visual-guide','视觉手册'],['graphic','图形元素']],
  brand:[['brand-guide','品牌手册'],['product-guide','产品手册'],['qualification','资质'],['endorsement','背书']],
  images:[['product','产品'],['origin','溯源'],['activity','活动'],['store','门店图']],
  videos:[['product','产品'],['origin','溯源'],['activity','活动']],
};
export const ASSET_PLATFORMS=[['xhs','小红书'],['douyin','抖音'],['taobao','淘宝'],['pdd','拼多多'],['channels','视频号']];
export function assetTopic(asset,files){
  const topics=ASSET_TOPICS[assetCollection(asset,files)]||[];
  const topic=Object.hasOwn(asset,'topic')?asset.topic:({'product-knowledge':'product-guide',product:'product',store:'store',activities:'activity'}[asset.category]||'');
  return topics.some(([id])=>id===topic)?topic:'';
}
export function assetKind(asset,files){
  const version=asset.versions?.at(-1),items=version?.mediaItems;
  if(items?.some(i=>i.kind==='live'))return 'live';
  const resolved=assetFiles(asset,files),kind=resolved[0]?.kind||'';
  return kind==='image'&&resolved.length>1?'gallery':kind;
}
export const assetDate=asset=>asset.assetDate||asset.createdAt;
export function assetAllowed(data,key,asset,collection=''){
  const user=data?.user;
  if(!user)return false;
  if(user.role==='admin')return true;
  const right=user.folderRights?.[(asset?assetCollection(asset,data.files):collection)||'unclassified']||'inherit';
  if(right==='none')return false;
  return key==='view'||Boolean(user.capabilities?.[key]&&(key==='download'||user.role!=='viewer'&&right!=='viewer'));
}
export function browseAssets(data,{scope='all',query='',collection='',topic='',kind='',platform='',published='',tag='',sort='new',from='',to='',now=Date.now()}={}){
  const q=query.trim().toLocaleLowerCase(),platformName=ASSET_PLATFORMS.find(([key,name])=>key===platform||name===platform)?.[1];
  return data.assets.filter(a=>{
    if(!assetAllowed(data,'view',a)||Boolean(a.trashed)!==(scope==='trash'))return false;
    if(collection&&assetCollection(a,data.files)!==collection||topic&&assetTopic(a,data.files)!==topic)return false;
    if(scope==='pending'&&assetCollection(a,data.files))return false;
    if(scope==='mine'&&(a.createdById?a.createdById!==data.user.id:a.createdBy!==data.user.name))return false;
    const date=Date.parse(assetDate(a));
    if(scope==='recent'&&(!Number.isFinite(date)||date<now-7*86400000||date>now))return false;
    if(from&&(!Number.isFinite(date)||date<Date.parse(from+'T00:00:00+08:00')))return false;
    if(to&&(!Number.isFinite(date)||date>=Date.parse(to+'T00:00:00+08:00')+86400000))return false;
    const k=assetKind(a,data.files);
    if(kind&&!(kind==='pictures'?['image','gallery','live'].includes(k):kind==='documents'?['pdf','presentation','document'].includes(k):k===kind))return false;
    if(tag&&!a.tags?.includes(tag))return false;
    const posts=(a.publications||[]).filter(p=>!platformName||p.platform===platformName);
    if(platformName&&published!=='no'&&!posts.length)return false;
    if(published==='yes'&&!posts.length||published==='no'&&posts.length)return false;
    return !q||[a.title,a.caption,a.subject,a.project,a.source?.url,a.source?.noteId,...a.tags||[]].join(' ').toLocaleLowerCase().includes(q);
  }).slice().sort((a,b)=>sort==='name'?a.title.localeCompare(b.title,'zh'):((Date.parse(assetDate(a))||0)-(Date.parse(assetDate(b))||0))*(sort==='old'?1:-1));
}
// The deployed workspace declares this roster and role defaults; governance
// contains overrides, rather than a complete list of members.
export function assetMembers(data){
  const people=[['pantao','潘涛'],['keo','KEO'],['xiaolu','小芦'],['liangchen','良辰'],['xiaopao','小跑'],['yangzi','杨子'],['lingzhi','灵芝']];
  const defaults={download:true,delete:false,tags:true,upload:true,editCopy:true};
  const g=data.governance||{};
  return people.map(([id,name])=>({id,name,role:['pantao','keo'].includes(id)?'admin':g.roles?.[id]||'editor',capabilities:{...defaults,...g.memberCapabilities?.[id]},folderRights:Object.fromEntries([...ASSET_COLLECTIONS.map(c=>c.id),'unclassified'].map(scope=>[scope,g.folderRights?.[scope]?.[id]||'inherit']))}));
}
