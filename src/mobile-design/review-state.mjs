// Navigation only: never persist uploaded media, form text or chat drafts here.
export function reviewState(value){
 if(!value||value.schema!==1||!['compare','gallery','sources','plan'].includes(value.view))return null;
 const page=v=>typeof v==='string'&&/^[a-z][a-z0-9_]{0,59}$/.test(v)?v:'';
 const scroll={};for(const key of ['panel','viewer','index','message']){const pair=value.scroll?.[key];scroll[key]=Array.isArray(pair)&&pair.length===2?pair.map(v=>Number.isFinite(v)?Math.max(0,Math.min(1e7,v)):0):[0,0];}
 return {schema:1,view:value.view,current:page(value.current),compare:page(value.compare),viewer:value.viewer===true,annotate:value.annotate===true,theme:value.theme==='dark'?'dark':'light',scroll};
}
