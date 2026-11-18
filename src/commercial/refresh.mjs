/** Serialize explicit reads and one follow-up if a save occurs mid-read. */
export function createReportRefresh({read,onState}){
 let disposed=false,pending=null,again=false;
 function refresh({afterWrite=false}={}){
  if(disposed)return Promise.resolve();
  if(pending){if(afterWrite){again=true;return pending.then(()=>pending);}return pending;}
  onState({loading:true});
  pending=(async()=>{
   try{const data=await Promise.resolve().then(read);if(!disposed)onState({data,loading:false});}
   catch(error){if(!disposed)onState({error:error.message||'读取失败',loading:false});}
   finally{
    pending=null;
    if(!disposed&&again){again=false;void refresh();}
   }
  })();
  return pending;
 }
 return {refresh,dispose(){disposed=true;again=false;},get pending(){return !!pending;}};
}
