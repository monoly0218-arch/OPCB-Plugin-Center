import previewServer from './mobile-preview.py';

export async function openMobilePreview(host, html, signal) {
 let process, buffer='', url='', resolveURL, confirm, rejectURL, rejectLoaded;
 const listening=new Promise((resolve,reject)=>{resolveURL=resolve;rejectURL=reject;});
 const loaded=new Promise((resolve,reject)=>{confirm=resolve;rejectLoaded=reject;});
 const fail=error=>{rejectURL(error);rejectLoaded(error);};
 listening.catch(()=>{});loaded.catch(()=>{});
 const close=()=>{if(process)void process.kill().catch(()=>{});};
 const abort=()=>{fail(Error('手机版预览已关闭'));close();};
 signal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{fail(Error('手机版预览启动超时'));close();},15000);
 try {
  signal.throwIfAborted();
  process=await host.spawn('mobile-preview',{onStdout(data){
   buffer+=data;
   if(buffer.length>8192){fail(Error('手机版预览响应无效'));close();return;}
   let end;
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    try {
     const event=JSON.parse(line);
     if(!url&&/^http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{43}\/$/.test(event.url)){
      url=event.url;resolveURL(url);
     }else if(url&&event.ready===true)confirm(url);
     else throw Error('手机版预览响应无效');
    }catch(error){fail(error);close();}
   }
  }});
  signal.throwIfAborted();
  void process.exited.then(()=>fail(Error('手机版预览进程已退出')),fail);
  await process.write(JSON.stringify(previewServer)+'\n');
  await listening;
  const payload=JSON.stringify(html)+'\n';
  for(let i=0;i<payload.length;){
   signal.throwIfAborted();
   let end=Math.min(i+65536,payload.length);
   const last=payload.charCodeAt(end-1);
   if(last>=0xd800&&last<=0xdbff)end--;
   await process.write(payload.slice(i,end));i=end;
  }
  await loaded;
  signal.throwIfAborted();
  return {url,close,exited:process.exited};
 }catch(error){close();throw error;}
 finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
