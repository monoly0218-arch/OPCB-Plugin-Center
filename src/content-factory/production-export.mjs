const encode=value=>new TextEncoder().encode(value);
const crcTable=Array.from({length:256},(_,i)=>{let n=i;for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
export function storeZip(files){
 const chunks=[],directory=[];let offset=0;
 const header=size=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
 const names=new Set();
 for(const file of files){
  if(!file.name||file.name.startsWith('/')||file.name.split('/').some(p=>p==='..'||p==='.')||names.has(file.name))throw Error('打包文件名无效');names.add(file.name);
  const name=encode(file.name),data=file.bytes,crc=crc32(data),local=header(30),v=local.view;
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
  chunks.push(local.bytes,name,data);
  const central=header(46),c=central.view;c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);directory.push(central.bytes,name);offset+=30+name.length+data.length;
 }
 const size=directory.reduce((n,b)=>n+b.length,0),end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,size,true);end.view.setUint32(16,offset,true);
 return new Blob([...chunks,...directory,end.bytes],{type:'application/zip'});
}
const safe=name=>name.replace(/[\\/\u0000-\u001f:*?"<>|]/g,'_').slice(0,160)||'file';
export async function exportProduction({doc,version,session,channel,check,signal,fetchBytes}){
 check();if(version.status!=='accepted'||!version.result)throw Error('仅验收通过的绿色版本可打包交付');
 const manifest={schema:1,cardId:doc.cardId,title:doc.title,version:version.number,versionId:version.id,acceptedBy:version.acceptedBy,acceptedAt:version.acceptedAt,materials:version.materials,result:version.result};
 const files=[{name:'PROMPT.md',bytes:encode(version.prompt)},{name:'PLAN.md',bytes:encode(version.plan)},{name:'MANIFEST.json',bytes:encode(JSON.stringify(manifest,null,2))}];
 if(version.revisedPrompt)files.push({name:'NEXT_PROMPT.md',bytes:encode(version.revisedPrompt)});
 let total=0;
 for(const [i,item]of [...version.materials,version.result].entries()){
  check();signal.throwIfAborted();
  const url=session.media(item.url);if(!url)throw Error('当前身份不可读取交付物料');
  const data=fetchBytes?await fetchBytes(url,signal):await (async()=>{const r=await fetch(url,{signal});if(!r.ok)throw Error('物料下载失败');return new Uint8Array(await r.arrayBuffer());})();check();
  total+=data.byteLength;if(total>128*1024*1024)throw Error('物料合计超过128MB，请按版本拆分交付');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==item.sha256||data.byteLength!==item.size)throw Error('物料内容与归档指纹不一致，未生成缺失文件包');
  files.push({name:`${i<version.materials.length?'materials':'result'}/${String(i+1).padStart(2,'0')}_${safe(item.name)}`,bytes:data});
 }
 const blob=storeZip(files);check();
 return session.attachments.upload(new File([blob],`production-v${version.number}.zip`,{type:'application/zip'}),channel,signal);
}
