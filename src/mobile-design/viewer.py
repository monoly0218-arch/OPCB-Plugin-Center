"""Memory-only live preview. Only annotations cross the isolated document boundary."""
import hashlib, json, queue, re, secrets, sys, threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
LIMIT = 50 * 1024 * 1024
config = json.loads(sys.stdin.readline(1024 * 1024))
helper = config['helper']
token = '/' + secrets.token_urlsafe(32) + '/'
csrf = secrets.token_urlsafe(32)
lock = threading.RLock()
clients = set()
current = None
versions = []
notes = []
last_control = None
checkpoint = None
documents = OrderedDict()

def emit(event):
    with lock:
        print(json.dumps(event, ensure_ascii=True), flush=True)

def broadcast(event):
    with lock:
        for client in list(clients):
            try:
                client.put_nowait(event)
            except queue.Full:
                clients.discard(client)

DOCUMENT_POLICY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline' blob: data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"

def prepare(html, source):
    raw = html.encode('utf-8')
    if not raw or len(raw) > LIMIT:
        raise ValueError('HTML must be between 1 byte and 50 MB')
    revision = hashlib.sha256(raw).hexdigest()
    # Keep the inner page on HTTP: Buzz validates every subframe navigation.
    # The opaque-origin sandbox and document CSP still deny host/network access.
    html = '<meta name="opcb-document" content="' + revision + '">' + html
    html += '<script>' + helper.replace('</script', '<\\/script') + '</script>'
    with lock:
        documents[revision] = html.encode('utf-8')
        documents.move_to_end(revision)
        while len(documents) > 3:
            documents.popitem(last=False)
    return dict(type='document', revision=revision, source=source)

SHELL = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%;margin:0;background:#0d0c0f;font:18px system-ui;color:#fff}body{display:flex;flex-direction:column}header[hidden]{display:none}header{padding:10px 16px;display:flex;gap:16px;align-items:center}#retry{font:inherit;color:inherit;background:transparent;border:1px solid #777;border-radius:8px;padding:6px 12px}#status{margin-left:auto;font-size:16px;color:#b9d9bb}iframe{border:0;flex:1;min-height:0;width:100%}</style><header hidden><span>Live design</span><span id="status" role="status">Connecting…</span><button id="retry" hidden>Retry preview</button></header><iframe sandbox="allow-scripts allow-downloads" title="Mobile design preview"></iframe><script>
const base=location.pathname,csrf=__CSRF__,frame=document.querySelector('iframe'),status=document.querySelector('#status');let current=null,pending=null,state=null,notes=[],loading=false,timer,initialized='',review=null,lastCheckpoint='';const retry=document.querySelector('#retry');
const tell=m=>frame.contentWindow?.postMessage({opcbDesign:1,...m},'*');
async function load(doc){initialized='';loading=true;current=doc;retry.hidden=true;clearTimeout(timer);frame.src=base+'document/'+doc.revision;status.textContent='Applying latest design…';timer=setTimeout(()=>{status.textContent='Design did not open. Retry the preview.';retry.hidden=false;status.closest('header').hidden=false},15000)}
retry.onclick=()=>current&&load(current)
async function event(message){const response=await fetch(base+'event',{method:'POST',headers:{'Content-Type':'application/json','X-Design-Token':csrf},body:JSON.stringify(message)});if(!response.ok)throw Error('Annotation could not be saved')}
window.addEventListener('message',async e=>{if(e.source!==frame.contentWindow||e.data?.opcbDesign!==1)return;const m=e.data;
if(m.type==='ready'&&m.revision===current?.revision&&initialized!==m.revision){initialized=m.revision;tell({type:'init',revision:current.revision,notes,...state,review:state?.review||review})}
if(m.type==='applied'&&m.revision===current?.revision){clearTimeout(timer);retry.hidden=true;status.closest('header').hidden=true;loading=false;status.textContent='Live · '+m.revision.slice(0,8);if(pending)tell({type:'snapshot'})}
if(m.type==='busy')status.textContent='Update waits for your note';
if(m.type==='state'){state={state:m.state,viewer:m.viewer,scroll:m.scroll,theme:m.theme,review:m.review};review=m.review||review;if(pending){const next=pending;pending=null;load(next)}}
if(m.type==='checkpoint'){review=m.review;const json=JSON.stringify(review);if(json!==lastCheckpoint){lastCheckpoint=json;try{await event({type:'checkpoint',review})}catch{status.textContent='位置暂未保存'}}}
if(m.type==='note'){status.textContent='Saving note…';try{await event({type:'note',note:m.note})}catch{status.textContent='Could not save note · try again';tell({type:'note-status',id:m.note.id,error:'Could not save note. Try again.'})}}
});
const events=new EventSource(base+'events');events.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='document'){if(current?.revision===m.revision)return;pending=m;if(!current){pending=null;load(m)}else if(!loading)tell({type:'snapshot'})}if(m.type==='checkpoint'){review=m.review;lastCheckpoint=JSON.stringify(review)}if(m.type==='marks'){if(JSON.stringify(notes)!==JSON.stringify(m.notes)){notes=m.notes;tell(m)}}if(m.type==='control')tell(m);if(m.type==='note-status'){tell(m);status.textContent=m.error?'Note could not be saved':'Live · '+(current?.revision||'').slice(0,8)}};events.onerror=()=>status.textContent='Connection interrupted · reconnecting';
</script></html>'''.replace('__CSRF__', json.dumps(csrf))

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def valid(self):
        return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)
    def reply(self, status, body, kind='application/json', policy=None):
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.close_connection = True
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', policy or "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *")
        self.end_headers()
        self.wfile.write(body)
    def do_GET(self):
        if not self.valid():
            return self.reply(404, b'{}')
        if self.path == token:
            return self.reply(200, SHELL.encode(), 'text/html; charset=utf-8')
        if self.path.startswith(token + 'document/'):
            revision = self.path[len(token + 'document/'):]
            with lock:
                body = documents.get(revision) if re.fullmatch('[a-f0-9]{64}', revision) else None
            if body is None:
                return self.reply(404, b'{}')
            return self.reply(200, body, 'text/html; charset=utf-8', DOCUMENT_POLICY)
        if self.path != token + 'events':
            return self.reply(404, b'{}')
        stream = queue.Queue(maxsize=8)
        with lock:
            clients.add(stream)
            if checkpoint:
                stream.put(dict(type='checkpoint', review=checkpoint))
            if current:
                stream.put(current)
            stream.put(dict(type='marks', notes=notes))
            if last_control:
                stream.put(last_control)
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            while True:
                try:
                    event = stream.get(timeout=15)
                    self.wfile.write(('data: ' + json.dumps(event) + '\n\n').encode())
                except queue.Empty:
                    self.wfile.write(b': keepalive\n\n')
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with lock:
                clients.discard(stream)
    def do_POST(self):
        origin = 'http://127.0.0.1:' + str(self.server.server_port)
        if not self.valid() or self.path != token + 'event' or self.headers.get('X-Design-Token') != csrf or self.headers.get('Origin') != origin:
            return self.reply(403, b'{}')
        global checkpoint
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16000:
                raise ValueError('event too large')
            event = json.loads(self.rfile.read(size))
            if event.get('type') == 'checkpoint':
                value = event.get('review')
                if not isinstance(value, dict) or value.get('schema') != 1 or value.get('view') not in ['compare', 'gallery', 'sources', 'plan']:
                    raise ValueError('invalid review state')
                clean = dict(schema=1, view=value['view'], viewer=value.get('viewer') is True, annotate=value.get('annotate') is True, theme='dark' if value.get('theme') == 'dark' else 'light', scroll={})
                for key in ['current', 'compare']:
                    item = value.get(key, '')
                    clean[key] = item if isinstance(item, str) and re.fullmatch('[a-z][a-z0-9_]{0,59}', item) else ''
                for key in ['panel', 'viewer', 'index', 'message']:
                    pair = value.get('scroll', {}).get(key, [0, 0]) if isinstance(value.get('scroll'), dict) else [0, 0]
                    clean['scroll'][key] = [max(0, min(10000000, v)) if isinstance(v, (float, int)) and v == v else 0 for v in pair] if isinstance(pair, list) and len(pair) == 2 else [0, 0]
                with lock:
                    if checkpoint != clean:
                        checkpoint = clean
                        emit(dict(type='checkpoint', review=clean))
                return self.reply(200, b'{"ok":true}')
            note = event.get('note', {})
            if event.get('type') != 'note' or not isinstance(note, dict) or len(json.dumps(note)) > 12000:
                raise ValueError('invalid annotation')
            with lock:
                if note.get('revision') not in versions:
                    raise ValueError('document changed')
            emit(dict(type='note', note=note))
            self.reply(200, b'{"ok":true}')
        except (ValueError, TypeError):
            self.reply(400, b'{}')
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
emit(dict(url='http://127.0.0.1:' + str(server.server_port) + token))
try:
    while True:
        line = sys.stdin.readline(LIMIT * 6 + 4096)
        if not line:
            break
        if not line.endswith('\n'):
            raise ValueError('input exceeds limit')
        message = json.loads(line)
        if message.get('type') == 'document':
            revision = hashlib.sha256(message['html'].encode('utf-8')).hexdigest()
            with lock:
                unchanged = current is not None and current['revision'] == revision
            if unchanged:
                continue
            prepared = prepare(message['html'], message.get('source'))
            with lock:
                current = prepared
                versions.append(prepared['revision'])
                versions[:] = versions[-20:]
            broadcast(prepared)
            emit(dict(type='version', revision=prepared['revision']))
        elif message.get('type') == 'note-status':
            broadcast(dict(type='note-status', id=message['id'], error=message.get('error')))
        elif message.get('type') == 'control':
            action = message.get('action')
            if action in ['view', 'annotate', 'theme', 'flow']:
                control = dict(type='control', action=action, value=message.get('value'))
                if action == 'view':
                    last_control = control
                broadcast(control)
        elif message.get('type') == 'checkpoint':
            with lock:
                checkpoint = message.get('review')
            broadcast(dict(type='checkpoint', review=checkpoint))
        elif message.get('type') == 'marks':
            with lock:
                notes = message.get('notes', [])[:50]
            broadcast(dict(type='marks', notes=notes))
finally:
    server.shutdown()
    server.server_close()
