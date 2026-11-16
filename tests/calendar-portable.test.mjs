import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';

const base = new URL('../plugins/opcb.team-calendar/1.0.6-portable.1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base)));
function request(input, config) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, manifest.host.commands[0].args, {
      env: {...process.env, CALENDAR_CONFIG: config}, stdio: ['pipe', 'pipe', 'pipe']});
    let out = '', err = '';
    const timer = setTimeout(() => {child.kill(); reject(Error('client timeout'));}, 6000);
    child.stdout.on('data', chunk => out += chunk); child.stderr.on('data', chunk => err += chunk);
    child.on('error', reject); child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(Error(err || 'client exit '+code));
      else {try {resolve(JSON.parse(out));} catch (e) {reject(e);}}
    });
    child.stdin.end(JSON.stringify(input));
  });
}
test('calendar native package preserves page code and has no fixed machine paths', async () => {
  assert.equal(await readFile(new URL('plugin.js', base), 'utf8'),
    await readFile(new URL('../integrations/opcb.team-calendar/1.0.6/plugin/plugin.js', import.meta.url), 'utf8'));
  const json = JSON.stringify(manifest);
  assert(!json.includes('/Users/'));
  assert(!json.includes('OUTBOX/'));
  for (const entry of [...manifest.host.commands, ...manifest.host.processes]) {
    assert(entry.args.length <= 16);
    assert(entry.args.every(arg => Buffer.byteLength(arg) <= 1024));
    assert(Buffer.from(entry.args.slice(3).join(''), 'base64').toString().includes('CALENDAR_CONFIG'));
  }
  assert.equal(manifest.host.commands[0].program, 'node');
  assert.equal(manifest.host.processes[0].program, 'node');
});
test('portable calendar client preserves owner binding, request authorization and failed-config behavior', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'calendar-portable-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  let calls = 0;
  const viewer = 'a'.repeat(64), server = createServer((req, res) => {
    calls++; assert.equal(req.headers.authorization, 'Bearer fixture-token');
    assert.equal(req.headers['x-calendar-viewer'], viewer); assert.equal(req.url, '/api/state');
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({revision:7}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const config = join(dir, 'client.json');
  await writeFile(config, JSON.stringify({url:`http://127.0.0.1:${server.address().port}`, token:'fixture-token', pubkey:viewer}));
  assert.deepEqual(await request({action:'read', viewer}, config), {ok:true,data:{revision:7}});
  assert.match((await request({action:'read',viewer:'b'.repeat(64)}, config)).error, /尚未绑定/);
  assert.match((await request({action:'read',viewer:'invalid'}, config)).error, /无法确认/);
  assert.equal(calls, 1);
  assert.equal((await request({action:'read',viewer}, join(dir,'missing.json'))).ok, false);
  await writeFile(config, JSON.stringify({url:'http://example.com', token:'fixture-token', pubkey:viewer}));
  assert.match((await request({action:'read',viewer}, config)).error, /HTTPS/);
});
test('portable calendar event process streams from the configured local service', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'calendar-events-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  const server = createServer((req,res) => {
    assert.equal(req.url, '/api/events'); assert.equal(req.headers.authorization, 'Bearer fixture-events');
    res.writeHead(200, {'content-type':'text/event-stream'});
    res.write('data: {"revision":9}\n\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const config=join(dir,'client.json');
  await writeFile(config,JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,token:'fixture-events'}));
  const child=spawn(process.execPath,manifest.host.processes[0].args,{env:{...process.env,CALENDAR_CONFIG:config},stdio:['ignore','pipe','pipe']});
  try {
    const message=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('event timeout')),5000);
      child.stdout.once('data',chunk=>{clearTimeout(timer);resolve(String(chunk));});
      child.once('error',reject);
    });
    assert.equal(JSON.parse(message).revision,9);
  } finally {
    child.kill(); await new Promise(resolve=>child.once('close',resolve));
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
  }
});
