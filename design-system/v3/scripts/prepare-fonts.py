from fontTools.ttLib import TTFont
from fontTools import subset
from pathlib import Path
import hashlib,json
import argparse
parser=argparse.ArgumentParser(description='Create licensed OPCB font subsets from separately downloaded upstream files')
parser.add_argument('source',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
src=args.source;out=args.output;out.mkdir(parents=True,exist_ok=True)
chars=set(chr(i) for i in range(32,0x250))|set('×–—…⌘→←✓○●·，。！？：；（）「」／％')
cn=set()
for a in range(0xa1,0xf8):
 for b in range(0xa1,0xff):
  try: cn.add(bytes([a,b]).decode('gb2312'))
  except UnicodeDecodeError: pass
manifest=[]
for filename,family,weight,coverage in [('Nunito.ttf','OPCB Nunito','200 1000',chars),('Quicksand.ttf','OPCB Quicksand','300 700',chars),('ResourceHanRoundedCN-Regular.ttf','OPCB Round SC','400',cn),('ResourceHanRoundedCN-Bold.ttf','OPCB Round SC','700',cn)]:
 font=TTFont(src/filename)
 for n in font['name'].names:
  if n.nameID in [1,4,6,16]:
   text=family.replace(' ','') if n.nameID==6 else family
   if n.nameID==6 and weight in ['400','700']:text+='-Regular' if weight=='400' else '-Bold'
   n.string=text.encode(n.getEncoding(),errors='replace')
 opts=subset.Options();opts.flavor='woff2';opts.layout_features=['*'];opts.name_IDs=['*'];opts.name_legacy=True;opts.name_languages=['*']
 sub=subset.Subsetter(options=opts);sub.populate(unicodes=[ord(c) for c in coverage]);sub.subset(font);font.flavor='woff2'
 target=filename.replace('.ttf','.woff2').replace('ResourceHanRoundedCN','OPCBRoundSC')
 font.save(out/target)
 f=TTFont(out/target)
 manifest.append({'file':target,'family':family,'weight':weight,'glyphs':len(f.getBestCmap()),'sourceSHA256':hashlib.sha256((src/filename).read_bytes()).hexdigest(),'sha256':hashlib.sha256((out/target).read_bytes()).hexdigest(),'bytes':(out/target).stat().st_size})
(out/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
