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

SHELL = r'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTML 工作区</title>
<style>
*{box-sizing:border-box}html,body{height:100%;margin:0;font:18px system-ui,'PingFang SC',sans-serif;color:#242328;background:#f7f6f5}body{overflow:hidden}button{font:inherit;color:inherit;cursor:pointer}#gallery{height:100%;overflow:auto;padding:24px}#gallery[hidden],#stage[hidden],#empty[hidden]{display:none}.group{margin-bottom:28px}.group>h2{font-size:20px;font-weight:600;margin:0 0 16px}.group>h2 span{font-weight:400;color:#78727d;margin-left:8px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:20px;align-items:start}.hint{font-size:18px;color:#78727d;margin:0}.group.empty-group{padding:0 4px 20px;border-bottom:1px solid #8882}article{min-width:0;position:relative;display:flex;flex-direction:column;gap:12px;border-radius:24px;background:#fff;padding:12px;box-shadow:0 3px 20px #17151b08}article .canvas{aspect-ratio:4/3;position:relative;overflow:hidden;border-radius:16px;background:#f7f6f5}article h3{font:600 18px/1.4 system-ui;margin:0;min-width:0;overflow-wrap:anywhere}article .hit{position:absolute;inset:0;background:transparent;border:0;border-radius:16px;cursor:pointer;color:transparent}button:focus-visible{outline:3px solid #fa543c;outline-offset:2px}.card-heading{display:flex;align-items:start;gap:8px;padding:0 4px}.card-heading .name{padding:0;text-align:left;background:none;border:0;min-width:0;flex:1}.favorite{border:0;border-radius:50%;width:36px;height:36px;flex:none;background:#eeecef;display:grid;place-content:center}.favorite[aria-pressed=true]{background:#242328;color:#fff}.favorite svg{width:20px;height:20px}.source{margin:0 4px 4px;color:#78727d;font-size:16px;line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#stage{height:100%;position:relative;background:#f7f6f5}#stage .canvas{height:100%;width:100%;position:relative;overflow:hidden}iframe{border:0;position:absolute;transform-origin:top left;background:transparent}article iframe{pointer-events:none}.empty{height:100%;display:grid;place-content:center;padding:32px;text-align:center;color:#737078;font-size:20px}.card-status{position:absolute;inset:0;display:grid;place-content:center;text-align:center;font-size:18px;padding:24px;color:#737078}.card-status[hidden]{display:none}@media(prefers-color-scheme:dark){html,body{background:#202024;color:#f7f5f3}article{background:#2b292e;box-shadow:none}.favorite{background:#3b3840}.favorite[aria-pressed=true]{background:#f7f5f3;color:#242328}.source,.hint,.group>h2 span,.empty{color:#c4bec9}}@media(max-width:520px){#gallery{padding:16px}.grid{gap:16px;grid-template-columns:repeat(2,minmax(0,1fr))}article{padding:8px;border-radius:20px}article .canvas{border-radius:12px}article h3{font-size:16px}.card-heading{padding:0;gap:4px}.source{font-size:14px;margin:0}.favorite{width:32px;height:32px}}@media(max-width:360px){.grid{grid-template-columns:1fr}}
</style>
<main id="gallery"></main><main id="stage" hidden></main><div id="empty" class="empty" hidden>在聊天中打开 HTML</div>
<script>
const base=location.pathname,csrf=__CSRF__,gallery=document.querySelector('#gallery'),stage=document.querySelector('#stage'),empty=document.querySelector('#empty');let state={entries:[],gallery:true,selected:null},ready=new Set(),sizes=new Map(),frames=new Map(),automatic=new Map();
const ratios={'16:9':16/9,'9:16':9/16,'4:3':4/3,'3:4':3/4};
const event=m=>fetch(base+'event',{method:'POST',headers:{'Content-Type':'application/json','X-Reader-Token':csrf},body:JSON.stringify(m)});
function ratioFor(id,s){if(ratios[state.ratio])return state.ratio;if(!automatic.has(id)){const long=s.height>(s.viewportHeight||800)*1.3;automatic.set(id,long?(s.width>=700?'4:3':'9:16'):Object.keys(ratios).sort((a,b)=>Math.abs(Math.log(s.width/s.height/ratios[a]))-Math.abs(Math.log(s.width/s.height/ratios[b])))[0]);}return automatic.get(id);}
function fit(frame){const canvas=frame.parentElement,s=sizes.get(frame.dataset.id);if(!state.gallery){frame.style.cssText='width:100%;height:100%;left:0;top:0;transform:none';frame.dataset.fit=JSON.stringify({mode:'reading',width:canvas.clientWidth,height:canvas.clientHeight,scale:1});return;}if(!s)return;
 const ratio=ratioFor(frame.dataset.id,s),long=s.height>(s.viewportHeight||800)*1.3;canvas.style.aspectRatio=ratios[ratio];canvas.dataset.ratio=ratio;
 const width=canvas.clientWidth,height=canvas.clientHeight,view={width:s.width,height:long||ratios[state.ratio]?Math.round(s.width/ratios[ratio]):s.height};
 const scale=Math.min(width/view.width,height/view.height,1);frame.style.width=view.width+'px';frame.style.height=view.height+'px';frame.style.transform='scale('+scale+')';frame.style.left=Math.max(0,(width-view.width*scale)/2)+'px';frame.style.top=Math.max(0,(height-view.height*scale)/2)+'px';frame.dataset.fit=JSON.stringify({...view,scale,ratio,mode:'snapshot'});
 if(s.background)canvas.style.background=s.background;
}
const observe=new ResizeObserver(entries=>{for(const e of entries){const frame=e.target.querySelector('iframe');if(frame)fit(frame);}});
function frameFor(item,canvas){const frame=document.createElement('iframe');frame.dataset.id=item.id;frame.sandbox='allow-scripts';frame.title=item.name;frame.style.width='1280px';frame.style.height='800px';frame.onload=()=>{if(!state.gallery&&ready.has(item.id)&&frame.getAttribute('src')?.startsWith(base+'document/'))status(canvas,'');};canvas.append(frame);frames.set(item.id,frame);observe.observe(canvas);fit(frame);if(ready.has(item.id))frame.src=base+'document/'+item.id;return frame;}
function status(canvas,text){let label=canvas.querySelector('.card-status');if(!label){label=document.createElement('div');label.className='card-status';label.setAttribute('role','status');canvas.append(label);}label.hidden=!text;label.textContent=text||'';}
function cardFor(item,parent){const canvas=document.createElement('div');canvas.className='canvas';const card=document.createElement('article'),heading=document.createElement('div'),title=document.createElement('h3'),name=document.createElement('button'),hit=document.createElement('button'),favorite=document.createElement('button'),source=document.createElement('p');card.dataset.id=item.id;heading.className='card-heading';title.textContent=item.name;name.className='name';name.append(title);name.onclick=()=>void event({type:'select',id:item.id});hit.className='hit';hit.textContent=item.name;hit.setAttribute('aria-label','打开 '+item.name);hit.onclick=name.onclick;favorite.className='favorite';favorite.setAttribute('aria-label',(item.favorite?'取消收藏 ':'收藏 ')+item.name);favorite.setAttribute('aria-pressed',String(!!item.favorite));favorite.innerHTML='<svg viewBox="0 0 24 24" fill="'+(item.favorite?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.7"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z"/></svg>';favorite.onclick=()=>void event({type:'favorite',id:item.id});source.className='source';source.textContent=item.source||'来源会话';source.title=source.textContent;heading.append(name,favorite);card.append(canvas,heading,source);parent.append(card);frameFor(item,canvas);canvas.append(hit);status(canvas,item.error||(!ready.has(item.id)?'正在准备快照':''));}
function group(title,items,hint){const section=document.createElement('section'),heading=document.createElement('h2'),count=document.createElement('span'),grid=document.createElement('div');section.className='group';heading.textContent=title;count.textContent=items.length;heading.append(count);section.append(heading);if(items.length){grid.className='grid';section.append(grid);items.forEach(item=>cardFor(item,grid));}else{section.classList.add('empty-group');const text=document.createElement('p');text.className='hint';text.textContent=hint;section.append(text);}gallery.append(section);}
function render(){const scroll=gallery.scrollTop;observe.disconnect();frames.clear();gallery.replaceChildren();stage.replaceChildren();gallery.hidden=!state.gallery;stage.hidden=state.gallery;empty.hidden=state.entries.length>0;empty.textContent=state.empty||'在聊天中打开 HTML';if(!state.entries.length)return;
 if(state.gallery){group('收藏',state.entries.filter(x=>x.favorite),'点快照旁的星标，固定常用 HTML');group('最近打开',state.entries.filter(x=>!x.favorite),'最近打开的 HTML 都已收藏在上方');gallery.scrollTop=scroll;}
 else{const item=state.entries.find(x=>x.id===state.selected);if(item){const canvas=document.createElement('div');canvas.className='canvas';stage.append(canvas);frameFor(item,canvas);status(canvas,item.error||(!ready.has(item.id)?'正在打开正文':''));}}
}
window.addEventListener('message',e=>{const m=e.data;if(m?.opcbReader!==1)return;const frame=frames.get(m.id);if(!frame||e.source!==frame.contentWindow)return;
 if(m.type==='viewport'&&state.gallery&&!sizes.has(m.id)&&Number.isFinite(m.width)&&m.width>=64&&m.width<=16384&&Number.isFinite(m.height)&&m.height>=64&&m.height<=200000){frame.style.width=m.width+'px';frame.style.height=m.height+'px';return;}
 if(m.type==='size'&&Number.isFinite(m.width)&&m.width>=64&&m.width<=16384&&Number.isFinite(m.height)&&m.height>=64&&m.height<=200000){if(!state.gallery){status(frame.parentElement,'');fit(frame);return;}sizes.set(m.id,{width:m.width,height:m.height,viewportHeight:Number.isFinite(m.viewportHeight)?m.viewportHeight:800,background:typeof m.background==='string'&&/^rgba?\([\d\s.,/%]+\)$/.test(m.background)?m.background:null});status(frame.parentElement,'');fit(frame);}
});
const events=new EventSource(base+'events');events.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='catalog'){const allowed=new Set(m.entries.map(x=>x.id));for(const map of [ready,sizes,automatic])for(const id of map.keys())if(!allowed.has(id))map.delete(id);state=m;render();}if(m.type==='document'){ready.add(m.id);const f=frames.get(m.id);if(f)f.src=base+'document/'+m.id+'?v='+m.version;}if(m.type==='error'){ready.delete(m.id);const f=frames.get(m.id);if(f){f.src='about:blank';status(f.parentElement,m.error);}}};
events.onerror=()=>{if(!frames.size){empty.hidden=false;empty.textContent='预览连接已断开';}};
</script></html>
'''.replace('__CSRF__', json.dumps(csrf))

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
            if event.get('type') not in ('select', 'favorite') or not known:
                raise ValueError()
            emit(dict(type=event['type'], id=event['id']))
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
            with lock:
                documents.pop(command['id'], None)
            broadcast(command)
finally:
    server.shutdown()
    server.server_close()
