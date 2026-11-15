import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

path = Path(__file__).resolve().parents[1] / 'src/content-factory/media-stream.py'
spec = importlib.util.spec_from_file_location('media_stream', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
valid = 'https://staging.paolab.cn/ins/media/fixture.mp4?opcb_media=test'
assert m.source_url(valid) == valid
for raw in [valid.replace('staging.paolab.cn', 'evil.test'), valid.replace('/media/', '/api/'), valid.replace('https:', 'http:'), valid.replace('?opcb_media=test', ''), valid.replace('/fixture', '/../fixture'), valid + '#fragment', valid.replace('staging.paolab.cn', 'staging.paolab.cn@evil.test')]:
    try:
        m.source_url(raw)
    except ValueError:
        pass
    else:
        raise AssertionError(raw)
code = '''
import importlib.util,io,json,sys
from email.message import Message
spec=importlib.util.spec_from_file_location('stream',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Response(io.BytesIO):
 def __init__(self,request):
  data=b'0123456789';self.status=200;self.headers=Message();self.headers['Content-Type']='video/mp4';self.headers['Accept-Ranges']='bytes'
  if request.get_header('Range')=='bytes=2-4':
   data=data[2:5];self.status=206;self.headers['Content-Range']='bytes 2-4/10'
  self.headers['Content-Length']=str(len(data));super().__init__(data)
class Opener:
 def open(self,request,timeout):
  assert request.full_url=='https://staging.paolab.cn/ins/media/fixture.mp4?opcb_media=test'
  assert not request.get_header('Cookie');return Response(request)
m.urllib.request.build_opener=lambda *args:Opener()
m.serve(sys.argv[2])
'''
p = subprocess.Popen([sys.executable, '-I', '-u', '-c', code, str(path), valid], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
try:
    url = json.loads(p.stdout.readline())['url']
    with urllib.request.urlopen(url, timeout=3) as response:
        assert response.read() == b'0123456789'
        assert response.headers['Cache-Control'] == 'no-store'
    with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=3) as response:
        assert response.headers['Content-Length'] == '10'
        assert response.read() == b''
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Range': 'bytes=2-4'}), timeout=3) as response:
        assert response.status == 206 and response.read() == b'234'
    for req in [urllib.request.Request(url.replace('/media', '/wrong')), urllib.request.Request(url, headers={'Origin':'https://evil.test'}), urllib.request.Request(url, headers={'Host':'evil.test'}), urllib.request.Request(url, headers={'Range':'bytes=0-2,4-6'})]:
        try:
            urllib.request.urlopen(req, timeout=3)
        except urllib.error.HTTPError as e:
            assert e.code in [403,416]
        else:
            raise AssertionError('boundary accepted')
finally:
    p.stdin.close()
    p.wait(timeout=3)
print('MEDIA_STREAM_OK')
