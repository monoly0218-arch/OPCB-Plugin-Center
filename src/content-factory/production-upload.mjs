export async function postProductionFile(ctx, config, file, check) {
  const source=typeof OPCB_FACTORY_MEDIA_SOURCE==='string'?OPCB_FACTORY_MEDIA_SOURCE:'';
  if(!source||typeof ctx.host.spawn!=='function')throw Error('当前设备暂不支持提交制作文件');
  let output='';
  const child=await ctx.host.spawn('factory-media',{
    onStdout:chunk=>{if(output.length<256)output+=chunk;},
  });
  let timer;
  const expired=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('上传结果待核对，请刷新确认')),120000);
  });
  try {
    const transfer=async()=>{
      check();
      const settings=JSON.stringify({...config,operation:'upload',size:file.size,type:file.type,name:file.name});
      const begin=JSON.stringify(source)+'\n'+settings+'\n';
      for(let offset=0;offset<begin.length;offset+=16384){
        check();await child.write(begin.slice(offset,offset+16384));
      }
      for(let offset=0;offset<file.size;offset+=9000){
        check();
        const piece=new Uint8Array(await file.slice(offset,offset+9000).arrayBuffer());
        await child.write(btoa(String.fromCharCode(...piece))+'\n');
      }
      await child.exited;
    };
    try{await Promise.race([transfer(),expired]);}catch(error){
      // The server can reject the headers and close stdin before the final chunk.
      if(!output.includes('\n'))throw error;
    }
    check();
    const status=Number(JSON.parse(output.trim()).status);
    if(status<200||status>=300||!status)throw Error(`上传未确认（${status||'无回执'}），请刷新核对该版本`);
  } finally {
    clearTimeout(timer);
    await child.kill().catch(()=>{});
  }
}
