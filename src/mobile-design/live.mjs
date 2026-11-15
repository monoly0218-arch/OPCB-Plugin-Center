export async function startLive(host,source,helper,signal,onEvent){
 let child,buffer='',resolve,reject,readyDone=false,stopped=false,queue=Promise.resolve();
 const ready=new Promise((yes,no)=>{resolve=yes;reject=no});ready.catch(()=>{});
 const stop=()=>{if(stopped)return;stopped=true;reject(Error('Preview closed'));if(child)void child.kill().catch(()=>{})};
 signal.addEventListener('abort',stop,{once:true});
 const timer=setTimeout(()=>{reject(Error('Preview startup timed out'));stop()},20000);
 try{
  signal.throwIfAborted();
  child=await host.spawn('preview',{onStdout(data){
   buffer+=data;if(buffer.length>256000){stop();return}
   let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const event=JSON.parse(line);if(!readyDone){if(!/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{43}\/$/.test(event.url))throw Error('Invalid preview URL');readyDone=true;resolve(event.url)}else onEvent(event)}catch(error){if(!readyDone)reject(error)}}
  }});signal.throwIfAborted();
  child.exited.then(()=>reject(Error('Preview process stopped')));
  await child.write(JSON.stringify(source)+'\n');await child.write(JSON.stringify({helper})+'\n');
  const url=await ready;
  const write=message=>{queue=queue.then(async()=>{signal.throwIfAborted();const line=JSON.stringify(message)+'\n';for(let i=0;i<line.length;i+=65536){signal.throwIfAborted();await child.write(line.slice(i,i+65536));}});return queue};
  return {url,close:stop,exited:child.exited,restore:review=>write({type:'checkpoint',review}),control:(action,value)=>write({type:'control',action,value}),update:(html,source)=>write({type:'document',html,source}),marks:notes=>write({type:'marks',notes}),ack:(id,error)=>write({type:'note-status',id,error})};
 }catch(error){stop();throw error}finally{clearTimeout(timer)}
}
