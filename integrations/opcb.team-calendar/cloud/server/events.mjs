import {runtimeOptions} from './runtime.mjs';
import {connectionEndpoint,readConnection} from './connection.mjs';
const path=runtimeOptions().configPath;
let failures=0,lastRevision,reportedFailure=false;
for(;;){
  const controller=new AbortController();let watchdog,polling=false,success=false;
  try{
    const c=readConnection(path);polling=c.transport==='supabase';
    watchdog=setTimeout(()=>controller.abort(),10000);
    const response=await fetch(connectionEndpoint(c,polling?'/api/revision':'/api/events'),{headers:{authorization:'Bearer '+c.token,...(c.pubkey?{'x-calendar-viewer':c.pubkey}:{})},redirect:'error',signal:controller.signal});
    if(!response.ok)throw new Error('Connection failed');
    failures=0;
    if(polling){const data=await response.json();if(!Number.isSafeInteger(data.revision))throw new Error('Invalid revision');if(data.revision!==lastRevision||reportedFailure)console.log(JSON.stringify(data));lastRevision=data.revision;reportedFailure=false;success=true;}
    else{
    const decoder=new TextDecoder();let buffer='';reportedFailure=false;
    clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),45000);
    for await(const chunk of response.body){clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),45000);buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n\n'))!==-1){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);if(event.startsWith('data: '))console.log(event.slice(6));}if(buffer.length>8192)throw new Error('Event too large');}
    }
  }catch{failures++;if(!reportedFailure)console.log(JSON.stringify({connectionError:true}));reportedFailure=true;}finally{clearTimeout(watchdog);controller.abort();}
  await new Promise(r=>setTimeout(r,polling&&success?5000:Math.min(30000,1000*2**Math.min(failures,5))+Math.random()*500));
}
