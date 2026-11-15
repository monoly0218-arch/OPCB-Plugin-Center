"""Private memory-only gallery, with opaque document frames and contain fitting."""
import hashlib, json, queue, re, secrets, sys, threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LIMIT = 50 * 1024 * 1024
TOTAL_LIMIT = 160 * 1024 * 1024
config = json.loads(sys.stdin.readline(1024 * 1024))
helper = config['helper']
token = '/' + secrets.token_urlsafe(32) + '/'
csrf = secrets.token_urlsafe(32)
lock = threading.RLock()
clients = set()
documents = OrderedDict()
catalog = dict(type='catalog', entries=[], selected=None, gallery=True)
ID = re.compile(r'^[a-f0-9]{64}$')

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

SHELL = r'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTML 阅读器</title>
<style>*{box-sizing:border-box}html,body{height:100%;margin:0;font:18px system-ui,sans-serif;color:#242328;background:#f7f6f5}body{overflow:hidden}#gallery{height:100%;overflow:auto;padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:24px;align-content:start;align-items:start}#gallery[hidden],#stage[hidden]{display:none}article{min-width:0;position:relative;display:flex;flex-direction:column;gap:12px;border-radius:24px;background:#fff;padding:12px;box-shadow:0 3px 20px #17151b08}article .canvas{aspect-ratio:16/10;position:relative;overflow:hidden;border-radius:0;background:#fff}article h2{font:600 18px/1.4 system-ui;margin:0 4px 4px;overflow-wrap:anywhere}article .hit{position:absolute;inset:0;background:transparent;border:0;border-radius:24px;cursor:pointer;color:transparent}article .hit:focus-visible{outline:3px solid #fa543c;outline-offset:2px}#stage{height:100%;padding:16px;position:relative;background:#f4f2ef}#stage .canvas{height:100%;width:100%;position:relative;overflow:hidden}iframe{border:0;position:absolute;transform-origin:top left;background:transparent}article iframe{pointer-events:none}.empty{height:100%;display:grid;place-content:center;padding:32px;text-align:center;color:#737078;font-size:20px}.card-status{position:absolute;inset:0;display:grid;place-content:center;text-align:center;font-size:18px;padding:24px;color:#737078}.card-status[hidden]{display:none}@media(prefers-color-scheme:dark){html,body{background:#202024;color:#f7f5f3}article{background:#2b292e;box-shadow:none}article .canvas{background:#f7f6f5}.empty{color:#b7b2bd}}@media(max-width:520px){#gallery{padding:16px;gap:16px;grid-template-columns:1fr}#stage{padding:8px}}</style>
<main id="gallery"></main><main id="stage" hidden></main><div id="empty" class="empty" hidden>在聊天中打开 HTML</div>
<script>
const base=location.pathname,csrf=__CSRF__,gallery=document.querySelector('#gallery'),stage=document.querySelector('#stage'),empty=document.querySelector('#empty');let state={entries:[],gallery:true,selected:null},ready=new Set(),sizes=new Map(),frames=new Map();
const event=m=>fetch(base+'event',{method:'POST',headers:{'Content-Type':'application/json','X-Reader-Token':csrf},body:JSON.stringify(m)});
function fit(frame){const canvas=frame.parentElement,s=sizes.get(frame.dataset.id);if(!s)return;const width=canvas.clientWidth,height=canvas.clientHeight,scale=Math.min(width/s.width,height/s.height,1);frame.style.width=s.width+'px';frame.style.height=s.height+'px';frame.style.transform='scale('+scale+')';frame.style.left=Math.max(0,(width-s.width*scale)/2)+'px';frame.style.top=Math.max(0,(height-s.height*scale)/2)+'px';frame.dataset.fit=JSON.stringify({...s,scale});}
const observe=new ResizeObserver(entries=>{for(const e of entries){const frame=e.target.querySelector('iframe');if(frame)fit(frame);}});
function frameFor(item,canvas){const frame=document.createElement('iframe');frame.dataset.id=item.id;frame.sandbox='allow-scripts';frame.title=item.name;frame.style.width='1280px';frame.style.height='800px';canvas.append(frame);frames.set(item.id,frame);observe.observe(canvas);if(ready.has(item.id))frame.src=base+'document/'+item.id;return frame;}
function status(canvas,text){let label=canvas.querySelector('.card-status');if(!label){label=document.createElement('div');label.className='card-status';label.setAttribute('role','status');canvas.append(label);}label.hidden=!text;label.textContent=text||'';}
function render(){observe.disconnect();frames.clear();gallery.replaceChildren();stage.replaceChildren();gallery.hidden=!state.gallery;stage.hidden=state.gallery;empty.hidden=state.entries.length>0;empty.textContent=state.empty||'在聊天中打开 HTML';if(!state.entries.length)return;
 const items=state.gallery?state.entries:state.entries.filter(x=>x.id===state.selected);
 for(const item of items){const canvas=document.createElement('div');canvas.className='canvas';if(state.gallery){const card=document.createElement('article'),title=document.createElement('h2'),hit=document.createElement('button');title.textContent=item.name;hit.className='hit';hit.textContent=item.name;hit.setAttribute('aria-label','打开 '+item.name);hit.onclick=()=>void event({type:'select',id:item.id});card.append(canvas,title,hit);gallery.append(card);}else stage.append(canvas);frameFor(item,canvas);status(canvas,item.error||(!ready.has(item.id)?'正在准备快照':''));}
}
window.addEventListener('message',e=>{const m=e.data;if(m?.opcbReader!==1)return;const frame=frames.get(m.id);if(!frame||e.source!==frame.contentWindow)return;
 if(m.type==='viewport'&&Number.isFinite(m.width)&&m.width>=64&&m.width<=16384&&Number.isFinite(m.height)&&m.height>=64&&m.height<=200000){frame.style.width=m.width+'px';frame.style.height=m.height+'px';return;}
 if(m.type==='size'&&Number.isFinite(m.width)&&m.width>=64&&m.width<=16384&&Number.isFinite(m.height)&&m.height>=64&&m.height<=200000){sizes.set(m.id,{width:m.width,height:m.height});if(state.gallery)frame.parentElement.style.aspectRatio=m.width+'/'+m.height;status(frame.parentElement,'');fit(frame);}
});
const events=new EventSource(base+'events');events.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='catalog'){state=m;render();}if(m.type==='document'){ready.add(m.id);const f=frames.get(m.id);if(f)f.src=base+'document/'+m.id+'?v='+m.version;}if(m.type==='error'){const f=frames.get(m.id);if(f)status(f.parentElement,m.error);}};
events.onerror=()=>{if(!frames.size){empty.hidden=false;empty.textContent='预览连接已断开';}};
</script></html>'''.replace('__CSRF__', json.dumps(csrf))

DOCUMENT_POLICY = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline' blob: data:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
SHELL_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'self'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *"

def prepare(doc):
    raw = doc['html'].encode('utf-8')
    if not ID.fullmatch(doc['id']) or not raw or len(raw) > LIMIT:
        raise ValueError('HTML must be between 1 byte and 50 MB')
    version = hashlib.sha256(raw).hexdigest()
    marker = '<meta name="opcb-reader-id" content="' + doc['id'] + '">'
    html = doc['html']
    head = re.search(r'<head(?:\s[^>]*)?>', html, re.I)
    doctype = re.match(r'\s*<!doctype[^>]*>', html, re.I)
    offset = head.end() if head else doctype.end() if doctype else 0
    html = html[:offset] + marker + html[offset:]
    html += '<script>' + helper.replace('</script', '<\\/script') + '</script>'
    body = html.encode('utf-8')
    with lock:
        # Do not silently evict a visible preview into a broken blank frame.
        total = sum(len(value[0]) for key, value in documents.items() if key != doc['id'])
        if total + len(body) > TOTAL_LIMIT:
            raise ValueError('当前快照总量过大，请打开单个文档')
        documents[doc['id']] = (body, version)
    return dict(type='document', id=doc['id'], version=version)

class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def valid(self):
        return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)
    def reply(self, code, body, kind='application/json; charset=utf-8', policy=SHELL_POLICY):
        self.send_response(code)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', policy)
        self.end_headers()
        self.close_connection = True
        self.wfile.write(body)
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if not self.valid() or not path.startswith(token):
            return self.reply(404, b'{}')
        if path == token:
            return self.reply(200, SHELL.encode(), 'text/html; charset=utf-8')
        if path.startswith(token + 'document/'):
            key = path[len(token + 'document/'):]
            with lock:
                item = documents.get(key)
            return self.reply(200, item[0], 'text/html; charset=utf-8', DOCUMENT_POLICY) if item else self.reply(404, b'{}')
        if path == token + 'events':
            q = queue.Queue(maxsize=128)
            with lock:
                clients.add(q)
                q.put(catalog)
                for key, (_, version) in documents.items():
                    q.put(dict(type='document', id=key, version=version))
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.end_headers()
            try:
                while True:
                    try:
                        item = q.get(timeout=10)
                        data = 'data: ' + json.dumps(item) + '\n\n'
                    except queue.Empty:
                        data = ': keepalive\n\n'
                    self.wfile.write(data.encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionError):
                pass
            finally:
                with lock:
                    clients.discard(q)
            return
        self.reply(404, b'{}')
    def do_POST(self):
        origin = 'http://127.0.0.1:' + str(self.server.server_port)
        if not self.valid() or self.path != token + 'event' or self.headers.get('X-Reader-Token') != csrf or self.headers.get('Origin') != origin:
            return self.reply(403, b'{}')
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if not 0 < n < 4096:
                raise ValueError()
            event = json.loads(self.rfile.read(n))
            with lock:
                known = any(e['id'] == event.get('id') for e in catalog['entries'])
            if event.get('type') != 'select' or not known:
                raise ValueError()
            emit(dict(type='select', id=event['id']))
            self.reply(200, b'{}')
        except (ValueError, TypeError):
            self.reply(400, b'{}')
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
threading.Thread(target=server.serve_forever, daemon=True).start()
emit({'url': 'http://127.0.0.1:' + str(server.server_port) + token})
try:
    for line in sys.stdin:
        command = json.loads(line)
        if command['type'] == 'catalog':
            values = command['entries']
            if len(values) > 100 or any(not ID.fullmatch(e['id']) for e in values):
                raise ValueError('Invalid gallery')
            with lock:
                catalog = command
                allowed = {e['id'] for e in values}
                for key in list(documents):
                    if key not in allowed:
                        del documents[key]
            broadcast(catalog)
        elif command['type'] == 'document':
            try:
                event = prepare(command)
                broadcast(event)
                emit(dict(type='loaded', id=event['id'], version=event['version']))
            except ValueError as error:
                broadcast(dict(type='error', id=command['id'], error=str(error)))
        elif command['type'] == 'error':
            broadcast(command)
finally:
    server.shutdown()
    server.server_close()
