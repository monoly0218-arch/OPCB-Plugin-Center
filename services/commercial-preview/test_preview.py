import importlib.util,json,tempfile,threading,unittest,urllib.request,urllib.error,gzip
from pathlib import Path
spec=importlib.util.spec_from_file_location('preview',Path(__file__).with_name('serve_preview.py'));serve=importlib.util.module_from_spec(spec);spec.loader.exec_module(serve)
class PreviewTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);web=self.root/'web';web.mkdir();(web/'index.html').write_text('hello'*1000);(web/'clip.mp4').write_bytes(bytes(range(100)));(web/'private.txt').write_text('secret');self.data=self.root/'data/annotations.json';self.s=serve.make_server(web,self.data,0,'https://staging.paolab.cn',['clip.mp4'],'test');self.t=threading.Thread(target=self.s.serve_forever,daemon=True);self.t.start();self.base='http://127.0.0.1:'+str(self.s.server_port)
 def tearDown(self):self.s.shutdown();self.s.server_close();self.t.join();self.tmp.cleanup()
 def req(self,path,body=None,headers=None):
  return urllib.request.urlopen(urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers=headers or {'Content-Type':'application/json'},method='GET' if body is None else 'PUT'))
 def test_drafts_persist_conflict_preserves_other_field_and_history(self):
  self.assertEqual(json.load(self.req('/__review_state'))['titles'],{})
  first=json.load(self.req('/__review_state',{'revision':0,'titles':{'C01':'一个标题'}}));self.assertEqual(first['revision'],1)
  with self.assertRaises(urllib.error.HTTPError) as err:self.req('/__review_state',{'revision':0,'titles':{'C02':'另一个'}})
  self.assertEqual(err.exception.code,409)
  second=json.load(self.req('/__review_state',{'revision':1,'titles':{'C01':'一个标题','C02':'另一个'}}));self.assertEqual(len(second['titles']),2)
  self.assertEqual(json.loads((self.data.parent/'review-state.history/1.json').read_text())['titles'],first['titles'])
  self.assertFalse(self.data.exists())
  self.assertEqual(json.loads((self.data.parent/'review-state.json').read_text())['revision'],2)
 def test_copy_tags_persistence_and_legacy_title_save(self):
  first=json.load(self.req('/__review_state',{'revision':0,'titles':{'C01':'标题'},'copies':{'C01':'文案\n第二段'},'tags':{'C01':'#产品'}}))
  second=json.load(self.req('/__review_state',{'revision':1,'titles':{'C01':'新标题'}}))
  self.assertEqual(second['copies'],first['copies']);self.assertEqual(second['tags'],first['tags'])
  self.assertEqual(json.load(self.req('/__review_state'))['copies']['C01'],'文案\n第二段')
  for field,text in [('copies','x'*6001),('tags','x'*1001)]:
   with self.assertRaises(urllib.error.HTTPError) as err:self.req('/__review_state',{'revision':2,'titles':{},field:{'C01':text}})
   self.assertEqual(err.exception.code,400)
  self.assertEqual(json.load(self.req('/__review_state'))['revision'],2)
 def test_invalid_title_origin_and_private_boundary(self):
  for body in [{'revision':0,'titles':{'evil':'x'}},{'revision':0,'titles':{'C01':''}},{'revision':0,'titles':{'C01':'x'*161}}]:
   with self.assertRaises(urllib.error.HTTPError) as err:self.req('/__review_state',body)
   self.assertEqual(err.exception.code,400)
  with self.assertRaises(urllib.error.HTTPError) as err:self.req('/__review_state',{'revision':0,'titles':{}},{'Content-Type':'application/json','Origin':'https://unrelated.example'})
  self.assertEqual(err.exception.code,403)
  for path in ['/review-state.json','/private.txt','/../data/annotations.json','/review-state.history/1.json']:
   with self.assertRaises(urllib.error.HTTPError):self.req(path)
 def test_video_ranges_and_compressed_html(self):
  r=self.req('/clip.mp4',headers={'Range':'bytes=10-19'});self.assertEqual(r.status,206);self.assertEqual(r.read(),bytes(range(10,20)));self.assertEqual(r.headers['Content-Range'],'bytes 10-19/100')
  self.assertEqual(self.req('/clip.mp4',headers={'Range':'bytes=-5'}).read(),bytes(range(95,100)))
  with self.assertRaises(urllib.error.HTTPError) as err:self.req('/clip.mp4',headers={'Range':'bytes=200-300'})
  self.assertEqual(err.exception.code,416)
  r=self.req('/',headers={'Accept-Encoding':'gzip'});self.assertEqual(r.headers['Content-Encoding'],'gzip');self.assertEqual(gzip.decompress(r.read()),b'hello'*1000)
 def test_annotations_unchanged_and_cas(self):
  a={'id':'a1','documentId':'test','sourceVersion':'v1','text':'评论','kind':'point','status':'open','location':{'page':{},'selector':'#x','region':{'x':0,'y':0,'width':0,'height':0}}}
  first=json.load(self.req('/__annotations',{'revision':0,'items':[a]}));self.assertEqual(first['items'],[a])
  self.req('/__review_state',{'revision':0,'titles':{'C01':'标题'}})
  self.assertEqual(json.load(self.req('/__annotations')),first)
if __name__=='__main__':unittest.main()
