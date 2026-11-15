import importlib.util
import http.server
import json
from pathlib import Path
import threading
import urllib.error

path = Path(__file__).resolve().parents[1] / 'src/shangliangshan-assets/native-session.py'
spec=importlib.util.spec_from_file_location('asset_native',path)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
valid='https://staging.paolab.cn/assets/api/assets/files/12345678-1234-1234-1234-123456789abc/preview'
assert m.media_source('/api/assets/files/12345678-1234-1234-1234-123456789abc/preview')==valid
for bad in [valid.replace('staging.paolab.cn','evil.test'),valid+'?url=https://evil.test',valid.replace('/preview','/delete'),valid.replace('https:','http:'),valid.replace('/files/','/../files/')]:
 try:m.media_source(bad)
 except ValueError:pass
 else:raise AssertionError('source accepted')
class Handler(http.server.BaseHTTPRequestHandler):
 expired=False
 def log_message(self,*args):pass
 def do_POST(self):
  assert self.path=='/assets/login'
  body=self.rfile.read(int(self.headers['Content-Length'])).decode()
  assert body=='member=pantao&next=%2Fassets%2F'
  self.send_response(303);self.send_header('Set-Cookie','test_asset_session=pantao; Path=/assets; HttpOnly; SameSite=Lax');self.send_header('Location','/assets/');self.end_headers()
 def do_GET(self):
  if self.path=='/assets/login':
   self.send_response(200);self.end_headers();self.wfile.write(b'<form><input name="member" value="pantao"><button aria-label="\xe4\xbb\xa5\xe6\xbd\x98\xe6\xb6\x9b\xe8\xbf\x9b\xe5\x85\xa5"></button></form>');return
  if self.headers.get('Cookie')!='test_asset_session=pantao' or Handler.expired:
   self.send_response(401);self.end_headers();return
  self.send_response(200);self.end_headers();self.wfile.write(json.dumps({'revision':1,'assets':[],'files':[],'user':{'id':'pantao','name':'fixture','role':'admin'}}).encode())
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 m.ORIGIN=f'http://127.0.0.1:{server.server_port}';m.ROOT=m.ORIGIN+'/assets'
 session=m.AssetSession()
 assert session.members()==[{'id':'pantao','name':'潘涛'}]
 try:session.login('other')
 except ValueError:pass
 else:raise AssertionError('unknown member accepted')
 value=session.login('pantao');assert value['data']['user']['id']=='pantao'
 assert 'test_asset_session' not in json.dumps(value)
 assert session.state()['data']['revision']==1
 Handler.expired=True
 try:session.state()
 except PermissionError:pass
 else:raise AssertionError('expired accepted')
 assert session.member=='' and not list(session.jar) and session.files=={}
finally:
 server.shutdown();server.server_close()
print('ASSET_NATIVE_SESSION_OK')
