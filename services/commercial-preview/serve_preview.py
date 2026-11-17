#!/usr/bin/env python3
"""Loopback-only preview + atomic, versioned annotation storage outside the web root."""
import argparse
import gzip
import time
import fcntl
import json
import math
import mimetypes
import os
import re
import tempfile
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

LIMIT = 4 * 1024 * 1024


def validate(items):
    if not isinstance(items, list) or len(items) > 1000:
        raise ValueError('Invalid annotation list')
    seen = set()
    for a in items:
        if not isinstance(a, dict) or not isinstance(a.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9-]{1,100}', a['id']) or a['id'] in seen:
            raise ValueError('Invalid or duplicate annotation ID')
        seen.add(a['id'])
        if a.get('kind') not in ('point', 'box') or a.get('status') not in ('open', 'resolved'):
            raise ValueError('Invalid annotation state')
        for field, limit in [('documentId',160),('sourceVersion',160),('text',4000),('resolution',2000),('resolvedVersion',160)]:
            if not isinstance(a.get(field, ''), str) or len(a.get(field, '')) > limit:
                raise ValueError('Invalid ' + field)
        if not a.get('documentId') or not a.get('sourceVersion') or not a.get('text','').strip():
            raise ValueError('Document identity and text required')
        if a['status'] == 'resolved' and (not a.get('resolution','').strip() or not a.get('resolvedVersion','').strip()):
            raise ValueError('Resolution evidence and version required')
        loc = a.get('location')
        if not isinstance(loc,dict) or not isinstance(loc.get('page'),dict) or not isinstance(loc.get('selector'),str) or len(loc['selector']) > 10000:
            raise ValueError('Invalid location')
        for field in ('x','y','width','height'):
            v = loc.get('region',{}).get(field)
            if type(v) not in (int,float) or not math.isfinite(v) or abs(v)>100000:
                raise ValueError('Invalid region')
        if loc['region']['width'] < 0 or loc['region']['height'] < 0:
            raise ValueError('Invalid region size')


class Store:
    def __init__(self, path, document_id=''):
        self.path = Path(path)
        self.document_id = document_id
        self.lock = threading.Lock()

    def read(self):
        if not self.path.exists():
            return {'revision':0,'items':[]}
        value = json.loads(self.path.read_text())
        validate(value['items'])
        if type(value.get('revision')) is not int or value['revision'] < 0:
            raise ValueError('Invalid saved revision')
        return value

    def update(self, revision, items):
        validate(items)
        if self.document_id and any(a['documentId'] != self.document_id for a in items):
            raise ValueError('Document mismatch')
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock, open(str(self.path)+'.lock','a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            old = self.read()
            if type(revision) is not int or old['revision'] != revision:
                return None
            value = {'revision':revision+1,'items':items}
            history=self.path.parent/(self.path.name+'.history')
            history.mkdir(exist_ok=True)
            snapshot=history/(str(old['revision'])+'.json')
            # Retain previous revisions, including deletions and resolution history.
            if not snapshot.exists():
                with open(snapshot,'x') as f:
                    json.dump(old,f,ensure_ascii=False,allow_nan=False)
                    f.flush();os.fsync(f.fileno())
            fd, name = tempfile.mkstemp(prefix='.annotations-', dir=self.path.parent)
            try:
                with os.fdopen(fd,'w') as f:
                    json.dump(value,f,ensure_ascii=False,allow_nan=False)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(name,self.path)
                directory_fd=os.open(self.path.parent,os.O_RDONLY)
                try:os.fsync(directory_fd)
                finally:os.close(directory_fd)
            finally:
                if os.path.exists(name): os.unlink(name)
            return self.read()


def make_server(directory, data, port, public_origin='', assets=(), document_id=''):
    directory = Path(directory).resolve()
    data = Path(data).resolve()
    if data.is_relative_to(directory):
        raise ValueError('Annotation data must be outside the public directory')
    if not (directory/'index.html').is_file():
        raise ValueError('index.html required')
    public_files={}
    for name in assets:
        if Path(name).name != name or name.startswith('.'):
            raise ValueError('Assets must be explicit filenames')
        path=(directory/name).resolve()
        if not path.is_relative_to(directory) or not path.is_file():
            raise ValueError('Asset outside public directory or missing')
        public_files['/'+name]=path
    store = Store(data,document_id)
    review_path=data.parent/'review-state.json'
    review_lock=threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def route(self):
            # The gateway can either retain or strip the numeric prefix.
            return re.sub(r'^/preview/(?:[1-9]|10)/', '/', urlsplit(self.path).path)

        def respond(self, status, body, mime='application/json; charset=utf-8', cache='no-store', extra=()):
            if isinstance(body,(dict,list)):
                body = json.dumps(body,ensure_ascii=False,allow_nan=False).encode()
            elif isinstance(body,str): body=body.encode()
            encoding=''
            if status==200 and len(body)>1024 and ('text/' in mime or 'json' in mime or 'javascript' in mime or 'svg' in mime) and 'gzip' in self.headers.get('Accept-Encoding',''):
                body=gzip.compress(body,compresslevel=4);encoding='gzip'
            self.send_response(status)
            if encoding:self.send_header('Content-Encoding',encoding)
            self.send_header('Vary','Accept-Encoding')
            for key,value in extra:self.send_header(key,value)
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control',cache)
            self.send_header('X-Content-Type-Options','nosniff')
            self.end_headers()
            if self.command!='HEAD':self.wfile.write(body)

        def do_HEAD(self):
            self.do_GET()

        def file(self,path):
            body=path.read_bytes();mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            cache='public,max-age=31536000,immutable' if re.fullmatch(r'asset-[a-f0-9]{64}\.[a-z0-9]+',path.name) else 'no-store'
            if mime.startswith(('video/','audio/')) and self.headers.get('Range'):
                m=re.fullmatch(r'bytes=(\d*)-(\d*)',self.headers['Range'])
                if not m or not any(m.groups()):return self.respond(416,b'',extra=[('Content-Range','bytes */'+str(len(body)))])
                a,b=m.groups();start=int(a) if a else max(0,len(body)-int(b));end=min(int(b) if b and a else len(body)-1,len(body)-1)
                if start> end or start>=len(body):return self.respond(416,b'',extra=[('Content-Range','bytes */'+str(len(body)))])
                return self.respond(206,body[start:end+1],mime,cache,[('Content-Range',f'bytes {start}-{end}/{len(body)}'),('Accept-Ranges','bytes')])
            return self.respond(200,body,mime,cache,[('Accept-Ranges','bytes')])

        def review_read(self):
            return json.loads(review_path.read_text()) if review_path.exists() else {'revision':0,'titles':{}}

        def review_update(self,value):
            titles=value.get('titles')
            if not isinstance(titles,dict) or len(titles)>100:raise ValueError()
            if any(not re.fullmatch(r'C\d{2}',k) or not isinstance(v,str) or not v.strip() or len(v)>160 for k,v in titles.items()):raise ValueError()
            review_path.parent.mkdir(exist_ok=True,parents=True)
            with review_lock,open(str(review_path)+'.lock','a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX);old=self.review_read()
                if type(value.get('revision')) is not int or value['revision']!=old['revision']:return None
                history=review_path.parent/'review-state.history';history.mkdir(exist_ok=True)
                snapshot=history/(str(old['revision'])+'.json')
                if not snapshot.exists():snapshot.write_text(json.dumps(old,ensure_ascii=False))
                new={'revision':old['revision']+1,'titles':titles,'updatedAt':int(time.time())}
                fd,name=tempfile.mkstemp(prefix='.review-',dir=review_path.parent)
                try:
                    with os.fdopen(fd,'w') as f:json.dump(new,f,ensure_ascii=False);f.flush();os.fsync(f.fileno())
                    os.replace(name,review_path)
                    directory_fd=os.open(review_path.parent,os.O_RDONLY)
                    try:os.fsync(directory_fd)
                    finally:os.close(directory_fd)
                finally:
                    if os.path.exists(name):os.unlink(name)
                return new

        def do_GET(self):
            try:
                if self.route() == '/__review_state': self.respond(200,self.review_read())
                elif self.route() == '/__annotations': self.respond(200,store.read())
                elif self.route() in ('/','/index.html'):
                    self.file(directory/'index.html')
                elif self.route() in public_files:
                    path=public_files[self.route()]
                    self.file(path)
                else: self.respond(404,{'error':'Not found'})
            except (OSError,ValueError,KeyError): self.respond(500,{'error':'Saved data could not be read; no data changed'})

        def do_PUT(self):
            if self.route() not in ('/__annotations','/__review_state'): return self.respond(404,{'error':'Not found'})
            allowed = {public_origin,'http://127.0.0.1:'+str(self.server.server_port),'http://localhost:'+str(self.server.server_port)}
            if self.headers.get('Origin') and self.headers['Origin'] not in allowed:
                return self.respond(403,{'error':'Origin rejected'})
            if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                return self.respond(403,{'error':'Cross-site request rejected'})
            if self.headers.get_content_type() != 'application/json':
                return self.respond(415,{'error':'JSON required'})
            try:
                length = int(self.headers.get('Content-Length','0'))
                if length<=0 or length>LIMIT: return self.respond(413,{'error':'Invalid body length'})
                value=json.loads(self.rfile.read(length))
                updated=self.review_update(value) if self.route()=='/__review_state' else store.update(value.get('revision'),value.get('items'))
                if updated is None:return self.respond(409,{'error':'Revision conflict'})
                self.respond(200,updated)
            except (ValueError,TypeError,AttributeError,KeyError): self.respond(400,{'error':'Invalid annotation payload'})
            except OSError: self.respond(500,{'error':'Could not save; previous data retained'})

        def log_message(self, fmt, *args):
            # No annotation text, request headers, identities or URL queries in logs.
            print(self.command,self.route(),args[1] if len(args)>1 else '',flush=True)
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)


if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--directory',required=True)
    p.add_argument('--data',required=True)
    p.add_argument('--port',type=int,required=True)
    p.add_argument('--public-origin',default='')
    p.add_argument('--asset',action='append',default=[])
    p.add_argument('--document-id',default='')
    a=p.parse_args()
    server=make_server(a.directory,a.data,a.port,a.public_origin,a.asset,a.document_id)
    print('Preview listening on 127.0.0.1:'+str(server.server_port),flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
