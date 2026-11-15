export async function startReader(host,source,helper,signal,onEvent){
 let child,buffer='',resolve,reject,readyDone=false,stopped=false,queue=Promise.resolve();
 const ready=new Promise((yes,no)=>{resolve=yes;reject=no});ready.catch(()=>{});
 const close=()=>{if(stopped)return;stopped=true;reject(Error('预览已关闭'));if(child)void child.kill().catch(()=>{});};
 signal.addEventListener('abort',close,{once:true});
 const timer=setTimeout(()=>{reject(Error('预览启动超时，请检查 Python 3'));close();},20000);
 try{
  signal.throwIfAborted();child=await host.spawn('preview',{onStdout(data){buffer+=data;if(buffer.length>256000){close();return;}let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const e=JSON.parse(line);if(!readyDone){if(!/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{43}\/$/.test(e.url))throw Error('预览地址无效');readyDone=true;resolve(e.url);}else onEvent(e);}catch(e){if(!readyDone)reject(e);}}}});
  signal.throwIfAborted();child.exited.then(close,close);
  const write=async value=>{const text=JSON.stringify(value)+'\n';for(let i=0;i<text.length;i+=65536){signal.throwIfAborted();await child.write(text.slice(i,i+65536));}};
  await write(source);await write({helper});const url=await ready;
  const send=value=>{queue=queue.then(()=>write(value));return queue;};
  return {url,close,exited:child.exited,send};
 }catch(e){close();throw e;}finally{clearTimeout(timer);}
}
