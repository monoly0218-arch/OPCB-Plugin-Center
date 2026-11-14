from pathlib import Path
import argparse,json
parser=argparse.ArgumentParser()
parser.add_argument('--check',action='store_true')
args=parser.parse_args()
folder=Path(__file__).resolve().parents[1]/'plugins/opcb.android-notifications/0.1.0'
output=(folder/'client.js').read_text()+'\nexport const WORKER = '+json.dumps((folder/'sender.cjs').read_text(),ensure_ascii=False)+';\n\n'+(folder/'view.js').read_text()
if args.check:
 assert (folder/'plugin.js').read_text()==output,'Notification module is stale; run build_android_notification_plugin.py'
else:
 (folder/'plugin.js').write_text(output)
print('Notification entry matches its reviewed sources')
