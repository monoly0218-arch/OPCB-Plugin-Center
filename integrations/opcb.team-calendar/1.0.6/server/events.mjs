import {readFileSync} from 'node:fs';
import {runtimeOptions} from './runtime.mjs';
const path=runtimeOptions().configPath;
let failures=0;
for(;;){
  try{
    const c=JSON.parse(readFileSync(path,'utf8')),url=new URL(c.url);
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new Error('HTTPS required');
    const response=await fetch(c.url+'/api/events',{headers:{authorization:'Bearer '+c.token},redirect:'error'});
    if(!response.ok)throw new Error('Connection failed');
    const decoder=new TextDecoder();let buffer='';failures=0;
    for await(const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});let end;while((end=buffer.indexOf('\n\n'))!==-1){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);if(event.startsWith('data: '))console.log(event.slice(6));}if(buffer.length>8192)throw new Error('Event too large');}
  }catch{failures++;}
  await new Promise(r=>setTimeout(r,Math.min(30000,1000*2**Math.min(failures,5))+Math.random()*500));
}
