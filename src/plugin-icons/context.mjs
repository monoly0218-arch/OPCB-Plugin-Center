// Keep the original plugin's context ownership and runtime services intact.
export function withPluginIcon(context,icon) {
 const services=new Map();
 return new Proxy(context,{get(target,key){
  const value=Reflect.get(target,key,target);
  if((key==='pages'||key==='panels')&&value){
   if(!services.has(key))services.set(key,new Proxy(value,{get(service,name){
    const method=Reflect.get(service,name,service);
    if(name==='register')return contribution=>method.call(service,key==='pages'?{...contribution,icon}:contribution.launcher?{...contribution,launcher:{...contribution.launcher,icon}}:contribution);
    return typeof method==='function'?method.bind(service):method;
   }}));
   return services.get(key);
  }
  return typeof value==='function'?value.bind(target):value;
 }});
}
