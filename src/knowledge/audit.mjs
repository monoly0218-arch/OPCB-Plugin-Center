const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
export function auditDetails(row, name, libraries) {
 const payload=parse(row.payload)||{};
 const target=payload.owner?name(payload.owner):payload.id||'系统配置';
 const library=payload.library||(['library'].includes(row.action)?payload.id:null);
 const value=input=>{
  if(input===null||input===undefined)return '历史未记录';
  const data=parse(input);
  if(data===null)return '无显式记录';
  if(data===null||typeof data!=='object')return '未记录';
  if('rule' in data)return ({inherit:'继承上级',allow:'允许读取',deny:'关闭读取'})[data.rule]||'未记录';
  if('disabled' in data)return data.disabled?'已停用':'正常访问';
  return data.name||data.library||'无记录';
 };
 return {actor:row.actor==='server-bootstrap'?'服务初始化':(row.actor?name(row.actor):'历史未记录'),target,library:library?(libraries.find(lib=>lib.id===library)?.name||library):'—',before:value(row.before_value),after:row.after_value==null?(row.action==='grant'?(payload.allow?'允许读取':'关闭读取'):row.action==='inherit'?'继承上级':row.action==='disable'?(payload.disabled?'已停用':'正常访问'):payload.name||'未记录'):value(row.after_value),payload};
}
