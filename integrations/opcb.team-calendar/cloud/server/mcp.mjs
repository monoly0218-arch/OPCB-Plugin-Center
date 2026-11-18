import {createInterface} from 'node:readline';
import {request} from './client.mjs';
import {toolDefinitions} from '../src/tools.mjs';
import {version} from './runtime.mjs';
export async function callTool(name,args){
  if(name==='team_calendar_read')return request('read');
  if(name==='team_calendar_write')return request('write',args);
  if(name==='team_calendar_operation')return request('operation',args);
  throw new Error('工具不存在');
}
async function handle(message){
  const {id,method,params}=message;
  if(method?.startsWith('notifications/'))return;
  try {
    let result;
    if(method==='initialize')result={protocolVersion:['2024-11-05','2025-03-26','2025-06-18'].includes(params?.protocolVersion)?params.protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'opcb-team-calendar',version}};
    else if(method==='ping')result={};
    else if(method==='tools/list')result={tools:toolDefinitions};
    else if(method==='tools/call'){
      try{result={content:[{type:'text',text:JSON.stringify(await callTool(params.name,params.arguments||{}))}]};}
      catch(error){result={isError:true,content:[{type:'text',text:error.message}]};}
    }else throw new Error('不支持的方法');
    console.log(JSON.stringify({jsonrpc:'2.0',id,result}));
  }catch(error){console.log(JSON.stringify({jsonrpc:'2.0',id:id??null,error:{code:-32601,message:error.message}}));}
}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
let queue=Promise.resolve();
lines.on('line',line=>{queue=queue.then(()=>{try{return handle(JSON.parse(line));}catch{console.log(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}}));}});});
