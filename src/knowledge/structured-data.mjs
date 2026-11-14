// Preserve original labels, nulls and units; never calculate new business metrics.
export function createStructuredData(React){
 const h=React.createElement;
 return function StructuredData({value,preview=false}){
  const cell=(v,depth=0)=>{
   if(v===null)return h('span',{className:'kn-null'},'未提供');
   if(typeof v!=='object')return String(v).slice(0,20000);
   if(depth>5)return h('code',null,JSON.stringify(v).slice(0,2000));
   if(Array.isArray(v)){
    const max=preview?8:200,part=v.slice(0,max);
    if(!v.length)return '空列表';
    const objects=part.every(r=>r&&typeof r==='object'&&!Array.isArray(r));
    const keys=objects?[...new Set(part.flatMap(Object.keys))].slice(0,12):[];
    return h('div',{className:'kn-data-array'},keys.length?h('div',{className:'kn-table-wrap'},h('table',null,h('thead',null,h('tr',null,...keys.map(k=>h('th',{key:k},k)))),h('tbody',null,...part.map((r,i)=>h('tr',{key:i},...keys.map(k=>h('td',{key:k},Object.hasOwn(r,k)?cell(r[k],depth+1):h('span',{className:'kn-null'},'未提供')))))))):h('ul',null,...part.map((r,i)=>h('li',{key:i},cell(r,depth+1)))),v.length>max?h('p',{className:'kn-description'},`此处显示前 ${max} 项；完整结构保留在原始数据中。`):null);
   }
   return h('dl',{className:'kn-data-fields'},...Object.entries(v).slice(0,preview?20:100).flatMap(([key,v])=>[h('dt',{key:key+'-label'},key),h('dd',{key:key+'-value'},v&&typeof v==='object'?h('details',null,h('summary',null,Array.isArray(v)?`${v.length} 项`:Object.keys(v).slice(0,3).join(' / ')),cell(v,depth+1)):cell(v,depth+1))]));
  };
  return h('section',{className:'kn-structured','aria-label':'原始结构化资料'},h('p',{className:'kn-description'},'保留来源字段、时间和口径；空值显示为未提供。'),cell(value),!preview?h('details',{className:'kn-raw-data'},h('summary',null,'查看完整原始结构'),h('pre',null,JSON.stringify(value,null,2))):null);
 };
}
