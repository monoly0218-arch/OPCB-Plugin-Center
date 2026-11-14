import {SOURCES} from './identity-client.mjs';

// Cross-library discovery uses the same signed, individually authorized reads.
export async function searchLibraries(service,id,catalog,query,{signal}={}) {
  const sources=[...new Map(catalog.filter(s=>Object.hasOwn(SOURCES,s.source_id)).map(s=>[s.source_id,s])).values()];
  const unavailable=sources.filter(source=>source.state!=='ready').map(source=>source.display_name||SOURCES[source.source_id]);
  const ready=sources.filter(source=>source.state==='ready');
  const settled=await Promise.allSettled(ready.map(source=>service.read(id,{op:'search',source:source.source_id,query,limit:10},{signal})));
  signal?.throwIfAborted();
  const denied=settled.find(result=>result.status==='rejected'&&result.reason?.denied);
  if(denied)throw denied.reason;
  const documents=[];
  settled.forEach((result,i)=>{
    if(result.status==='rejected')unavailable.push(ready[i].display_name||SOURCES[ready[i].source_id]);
    else for(const note of result.value.results)documents.push({...note,sourceId:ready[i].source_id});
  });
  if(sources.length&&unavailable.length===sources.length)throw Error(`以下知识库暂未返回结果，请检查同步或稍后重试：${unavailable.join('、')}`);
  return {query,documents,unavailable};
}
