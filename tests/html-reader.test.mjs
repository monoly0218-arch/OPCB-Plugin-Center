import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { isHtml, readSource, startPreview, validateFile } from '../plugins/opcb.html-reader/0.1.0-rc.1/plugin.js';

const source = await readFile(new URL('../plugins/opcb.html-reader/0.1.0-rc.1/source/viewer.py', import.meta.url), 'utf8');

test('attachment identification accepts HTML metadata but refuses an ordinary document', () => {
  assert(isHtml({ url: 'https://relay.test/media/hash.html' }));
  assert(isHtml({ mime: 'text/html; charset=utf-8' }));
  assert(isHtml({ name: '设计稿.HTM' }));
  assert(!isHtml({ name: 'report.pdf', mime: 'application/pdf' }));
  assert.throws(() => validateFile({ name: 'report.txt', size: 5 }), /html/);
  assert.throws(() => validateFile({ name: 'report.html', size: 0 }), /50 MB/);
  assert.throws(() => validateFile({ name: 'report.html', size: 52428801 }), /50 MB/);
});

test('attachment reads preserve Chinese and refuse denied, empty and oversized sources', async () => {
  const signal = new AbortController().signal;
  const result = await readSource('source', signal, async () => new Response('<h1>中文</h1>'));
  assert.equal(result.html, '<h1>中文</h1>');
  assert.equal(result.size, 15);
  for (const status of [401, 403]) await assert.rejects(readSource('source', signal, async () => new Response('private', { status })), /无权/);
  await assert.rejects(readSource('source', signal, async () => new Response('')), /为空/);
  await assert.rejects(readSource('source', signal, async () => new Response('x', { headers: { 'content-length': '52428801' } })), /50 MB/);
  await assert.rejects(readSource('source', signal, async () => new Response(new Uint8Array([0xff]))), TypeError);
});

test('streamed bodies are bounded even when no content length is supplied', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(52428801)); }, cancel() { cancelled = true; } }));
  await assert.rejects(readSource('source', new AbortController().signal, async () => response), /50 MB/);
  assert(cancelled);
});

test('cancelling while spawn is pending still kills the later process', async () => {
  let resolve, killed = 0;
  const controller = new AbortController();
  const pending = startPreview({ spawn: () => new Promise(done => { resolve = done; }) }, 'x', source, controller.signal);
  controller.abort();
  resolve({ kill: async () => { killed++; }, exited: new Promise(() => {}), write: async () => {} });
  await assert.rejects(pending, /关闭/);
  assert.equal(killed, 1);
});

test('worker serves only its random loopback path, blocks external resources, retires on EOF', async t => {
  const child = spawn('python3', ['-I', '-u', '-c', 'import json,sys;exec(json.loads(sys.stdin.readline()))'], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const lines = createInterface({ input: child.stdout });
  const output = once(lines, 'line');
  const html = '<!doctype html><h1>实际内容</h1><script>document.title="交互可用";</script>';
  child.stdin.write(JSON.stringify(source) + '\n' + JSON.stringify({ html }) + '\n');
  const [line] = await output;
  const { url } = JSON.parse(line);
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]{43}\/$/);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), html);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'unsafe-inline'/);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(new URL('/etc/passwd', url))).status, 404);
  const wrongHost = await new Promise((resolve, reject) => { const req = httpRequest(url, { headers: { Host: 'attacker.test' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
  assert.equal(wrongHost, 404);
  const done = once(child, 'exit'); child.stdin.end();
  const [code] = await done; assert.equal(code, 0);
  await assert.rejects(fetch(url));
});
