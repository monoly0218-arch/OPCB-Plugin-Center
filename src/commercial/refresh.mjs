/** One serialized read path for the button, live events and visible-page refresh. */
export function createReportRefresh({read,onState,visible=()=>true,schedule=setTimeout,cancel=clearTimeout,interval=30000}){
 let disposed=false,pending=null,again=false,timer=null;
 function arm(){if(disposed)return;cancel(timer);timer=schedule(()=>{if(visible())void refresh();else arm();},interval);}
 function refresh(){
  if(disposed)return Promise.resolve();
  if(pending){again=true;return pending;}
  cancel(timer);onState({loading:true});
  pending=(async()=>{try{const data=await Promise.resolve().then(read);if(!disposed)onState({data,loading:false});}catch(error){if(!disposed)onState({error:error.message||'读取失败',loading:false});}finally{pending=null;if(!disposed){if(again){again=false;void refresh();}else arm();}}})();
  return pending;
 }
 return {refresh,dispose(){disposed=true;again=false;cancel(timer);},get pending(){return !!pending;}};
}
