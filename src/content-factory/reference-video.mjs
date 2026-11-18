// Signed factory tickets are used only for this read, never persisted in Solo.
export function referenceSource(card) {
 let url;try{url=new URL(card.media_url);}catch{throw Error('模板参考视频尚未就绪，请刷新或上传原视频');}
 if(url.origin!=='https://staging.paolab.cn'||url.username||url.password||url.hash||!/^\/ins\/media\/[a-zA-Z0-9._/-]+$/.test(url.pathname)||url.pathname.includes('..')||!url.searchParams.get('opcb_media'))throw Error('模板参考视频地址无效');
 return url.href;
}
export async function loadReferenceVideo(ctx,card) {
 const url=referenceSource(card);
 if(!ctx.host?.requestBytes)throw Error('当前设备不支持自动同步视频，请在参考视频中上传原文件');
 let response;
 try{response=await ctx.host.requestBytes({url,maxBytes:16*1024*1024,timeoutMs:30000});}
 catch{throw Error('视频自动同步未完成（单次读取上限16MB），可重试或上传原文件，不会截短原片');}
 const type=(response.headers['content-type']||response.headers['Content-Type']||'').split(';')[0];
 if(response.status!==200||!['video/mp4','video/webm','video/quicktime','application/octet-stream'].includes(type)||!response.body?.byteLength)throw Error('视频读取未成功，请刷新模板后重试');
 const ext=url.split('?')[0].split('.').pop().toLowerCase();
 return new File([response.body],`reference.${['mp4','webm','mov'].includes(ext)?ext:'mp4'}`,{type:type==='application/octet-stream'?'video/mp4':type});
}
