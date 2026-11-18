import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';

const publication=JSON.parse(await readFile(new URL('../releases/TEAM_CALENDAR_PUBLICATION.json',import.meta.url)));
const folder=new URL('../'+publication.sourcePath+'/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',folder)));
async function run(input,config){
 const child=spawn(process.execPath,manifest.host.commands[0].args,{env:{...process.env,CALENDAR_CONFIG:config},stdio:['pipe','pipe','pipe']});
 let output='',error='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>error+=x);
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code?reject(Error(error)):resolve(JSON.parse(output)));});
 const timer=setTimeout(()=>child.kill(),6000);child.stdin.end(JSON.stringify(input));
 try{return await done;}finally{clearTimeout(timer);}
}
test('cloud release ships portable native commands, update detection and the same embedded icon',async()=>{
 assert.equal(manifest.id,'opcb.team-calendar');assert.equal(manifest.updates.defaultEnabled,true);
 assert(!JSON.stringify(manifest).includes('/Users/'));
 for(const command of [...manifest.host.commands,...manifest.host.processes]){
  assert(command.args.length<=16);assert(command.args.every(arg=>Buffer.byteLength(arg)<=1024));
 }
 const code=await readFile(new URL('plugin.js',folder),'utf8');
 const icon='data:image/png;base64,'+(await readFile(new URL('icon.png',folder))).toString('base64');
 assert(code.includes(icon));assert(code.includes('设计团队日历插件'));
 assert((await readFile(new URL('CONNECT_CALENDAR.mjs',folder),'utf8')).includes('opcb-team-calendar'));
});
test('portable client follows sharedConfig, requires the current viewer and preserves source routing',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'cloud-calendar-release-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const viewer='a'.repeat(64);let calls=0;
 const server=createServer((req,res)=>{
  calls++;assert.equal(req.url,'/api/state');assert.equal(req.headers.authorization,'Bearer fixture-only');
  assert.equal(req.headers['x-calendar-viewer'],viewer);res.setHeader('content-type','application/json');res.end('{"revision":7}');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const config=join(dir,'client.json');
 await writeFile(config,JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,token:'fixture-only',pubkey:viewer}));
 assert.deepEqual(await run({action:'read',viewer},config),{ok:true,data:{revision:7}});
 assert.match((await run({action:'read',viewer:'b'.repeat(64)},config)).error,/尚未绑定/);
 assert.equal(calls,1);
 await writeFile(join(dir,'shared.json'),JSON.stringify({url:'https://calendar.example',transport:'wrong',pubkey:viewer}));
 await writeFile(config,JSON.stringify({sharedConfig:'shared.json'}));
 assert.match((await run({action:'read',viewer},config)).error,/不会退回本机库/);
 assert.equal(calls,1);
});
test('portable bridge uses the Supabase endpoint and refuses redirected device credentials',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'calendar-routing-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const config=join(dir,'client.json'),viewer='a'.repeat(64);
 await writeFile(config,JSON.stringify({url:'https://calendar.example',transport:'supabase',token:'fixture-only',pubkey:viewer}));
 const code=Buffer.from(manifest.host.commands[0].args.slice(3).join(''),'base64').toString();
 const stub=`globalThis.fetch=async(url,options)=>{if(url!=='https://calendar.example/functions/v1/opcb-team-calendar/api/state'||options.redirect!=='error'||options.headers['x-calendar-viewer']!==${JSON.stringify(viewer)})throw Error('invalid cloud route');return {ok:true,json:async()=>({revision:11})}};`;
 const child=spawn(process.execPath,['--input-type=module','-e',stub+code],{env:{...process.env,CALENDAR_CONFIG:config}});
 let out='';child.stdout.on('data',x=>out+=x);child.stdin.end(JSON.stringify({action:'read',viewer}));
 const status=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 assert.equal(status,0);assert.deepEqual(JSON.parse(out),{ok:true,data:{revision:11}});
});
