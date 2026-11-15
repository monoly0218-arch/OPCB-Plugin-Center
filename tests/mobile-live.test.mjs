import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {validateNote,formatNotes,appendToComposer,submitNotes} from '../src/mobile-design/annotations.mjs';
import {startLive} from '../src/mobile-design/live.mjs';
const note={id:'note-1',page:'ready',selector:'button[data-action="generate"]',rect:[.1,.2,.4,.3],comment:'Raise this button',revision:'a'.repeat(64),source:{url:'https://example.com/old.html',message:'b'.repeat(64)}};
test('annotation prompt preserves exact normalized location, version and original source',()=>{const prompt=formatNotes([note,{...note,id:'n2',page:'invite',comment:'Larger field'}],{url:'https://example.com/new.html'});assert.match(prompt,/1\. Page: ready/);assert.match(prompt,/2\. Page: invite/);assert.match(prompt,/0.1, 0.2, 0.4, 0.3/);assert.match(prompt,/old\.html/);assert.match(prompt,/a{64}/);for(const patch of [{rect:[0,0,2,1]},{rect:[.9,0,.4,1]},{rect:[0,0,0,1]},{comment:''},{revision:'latest'}])assert.throws(()=>validateNote({...note,...patch}));});
test('draft append targets one matching enabled channel composer, preserves existing text and rejects other threads/scopes/identities',()=>{let text='Existing draft';const connection={scope:'community-a',session:{viewer:'owner'}};const editor={session:{viewer:'owner'},scope:'community-a',channelId:'bound',disabled:false,insertText:s=>{text+=s;return true}};const map=new Map([[1,editor]]);appendToComposer(map,connection,'bound','Location');assert.equal(text,'Existing draft\nLocation\n');for(const patch of [{channelId:'other'},{scope:'other'},{threadRootId:'thread'},{disabled:true},{session:{viewer:'other'}}])assert.throws(()=>appendToComposer(new Map([[1,{...editor,...patch}]]),connection,'bound','No'));assert.throws(()=>appendToComposer(new Map([[1,editor],[2,editor]]),connection,'bound','No'));assert.throws(()=>appendToComposer(new Map([[1,{...editor,insertText:()=>false}]]),connection,'bound','No'));});
test('batch submission makes one native send, checks access at invocation and reports queued id rather than delivery',async()=>{const calls=[];const session={messages:{send:async(...args)=>{calls.push(args);return 'c'.repeat(64)}}};const prompt=formatNotes([note],note.source);assert.equal(await submitNotes(session,'bound',prompt,()=>{}),'c'.repeat(64));assert.deepEqual(calls,[['bound',prompt]]);await assert.rejects(submitNotes(session,'other',prompt,()=>{throw Error('revoked')}),/revoked/);assert.equal(calls.length,1);});
test('live transport handles split stdout, keeps one process for updates and retires it on abort',async()=>{let out,killed=0,writes=[],exit;const exited=new Promise(r=>exit=r),controller=new AbortController();const host={async spawn(_,options){out=options.onStdout;queueMicrotask(()=>{out('{"url":"http://127.0.0.1:1234/');out('a'.repeat(43)+'/"}\n')});return {write:async v=>writes.push(v),kill:async()=>{killed++;exit()},exited}}};const events=[],preview=await startLive(host,'worker','helper',controller.signal,e=>events.push(e));await preview.update('<p>first</p>',null);await preview.update('<p>second</p>',null);out('{"type":"note","note":{}}\n');assert.equal(events.length,1);assert.equal(writes.filter(v=>v.includes('"type":"document"')).length,2);controller.abort();assert.equal(killed,1);});
test('worker isolates HTML, streams new versions on the same URL and accepts a note from the still visible prior version',{timeout:15000},async()=>{
 const child=spawn('python3',['-I','-u',new URL('../src/mobile-design/viewer.py',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});const lines=createInterface({input:child.stdout});const it=lines[Symbol.asyncIterator]();const send=x=>child.stdin.write(JSON.stringify(x)+'\n');let reader;
 try{
 send({helper:await readFile(new URL('../src/mobile-design/annotate.js',import.meta.url),'utf8')});const {url}=JSON.parse((await it.next()).value);send({type:'document',html:'<html><body>First</body></html>'});const first=JSON.parse((await it.next()).value);
 const shell=await(await fetch(url)).text();assert.match(shell,/sandbox="allow-scripts allow-downloads"/);assert(!shell.includes('allow-same-origin'));const csrf=JSON.parse(shell.match(/csrf=("[^"]+")/)[1]);
 assert.equal((await fetch(url+'event',{method:'POST',body:'{}'})).status,403);assert.equal((await fetch(url+'unknown')).status,404);
 const controller=new AbortController();reader=(await fetch(url+'events',{signal:controller.signal})).body.getReader();let buffer='';const event=async()=>{while(!buffer.includes('\n\n')){const chunk=await reader.read();if(chunk.done)throw Error('SSE ended early');buffer+=new TextDecoder().decode(chunk.value);}const i=buffer.indexOf('\n\n'),raw=buffer.slice(0,i);buffer=buffer.slice(i+2);return JSON.parse(raw.slice(6))};
 const doc=await event();assert.equal(doc.revision,first.revision);assert(!('html' in doc));const page=await fetch(url+'document/'+doc.revision);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src blob:/);assert.match(await page.text(),/First/);assert(!shell.includes('frame.srcdoc='));assert(shell.includes("frame.src=base+'document/'"));assert.equal((await fetch(url+'document/not-a-revision')).status,404);await event();
 send({type:'document',html:'<html><body>Second</body></html>'});const second=JSON.parse((await it.next()).value);assert.notEqual(first.revision,second.revision);assert.equal((await event()).revision,second.revision);
 const response=await fetch(url+'event',{method:'POST',headers:{'Origin':new URL(url).origin,'Content-Type':'application/json','X-Design-Token':csrf},body:JSON.stringify({type:'note',note:{...note,revision:first.revision}})});assert.equal(response.status,200);assert.equal(JSON.parse((await it.next()).value).type,'note');
 send({type:'note-status',id:note.id});assert.equal((await event()).type,'note-status');controller.abort();
 }finally{child.stdin.end();child.kill();lines.close();void reader?.cancel().catch(()=>{});}
});

// Run the actual macOS engine with Buzz's HTTP/HTTPS-only subframe admission.
// The window stays hidden, the store is ephemeral, and no real chat is used.
test('macOS WebKit loads the isolated HTTP revision under the native Buzz navigation policy',{skip:process.platform!=='darwin',timeout:30000},async()=>{
 const run=promisify(execFile),folder=await mkdtemp(join(tmpdir(),'mobile-webkit-test-'));
 let child,lines;
 try{
  const binary=join(folder,'probe');await run('swiftc',['-swift-version','5',new URL('./fixtures/mobile_webkit.swift',import.meta.url).pathname,'-o',binary],{timeout:15000});
  child=spawn('python3',['-I','-u',new URL('../src/mobile-design/viewer.py',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});lines=createInterface({input:child.stdout});const it=lines[Symbol.asyncIterator]();
  child.stdin.write(JSON.stringify({helper:await readFile(new URL('../src/mobile-design/annotate.js',import.meta.url),'utf8')})+'\n');const {url}=JSON.parse((await it.next()).value);
  child.stdin.write(JSON.stringify({type:'document',html:'<!doctype html><html lang="en"><body><div class="phone-screen"><button>Start</button></div></body></html>'})+'\n');await it.next();
  const {stdout}=await run(binary,[url],{timeout:10000});const result=JSON.parse(stdout.trim());assert.equal(result.error,'');assert.match(JSON.parse(result.state).status,/^Live · /);assert(result.navigation.some(n=>!n.main&&n.allowed&&n.url.startsWith(url+'document/')));assert(result.diagnostics.some(n=>n.startsWith('applied ')));
 }finally{child?.stdin.end();child?.kill();lines?.close();await rm(folder,{recursive:true,force:true})}
});
