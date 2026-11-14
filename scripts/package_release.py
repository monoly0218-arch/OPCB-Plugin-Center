"""Rebuild deterministic distribution ZIPs and the complete checksum list."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'CATALOG.json').read_text())

def archive(output, files):
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for path, name in sorted(files, key=lambda item: item[1]):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 13, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, path.read_bytes())

candidates = json.loads((ROOT / 'MOBILE_CANDIDATES.json').read_text())['entries']
for item in candidates:
    folder = ROOT / item['sourcePath']
    archive(ROOT / item['downloadPath'], [(p, p.name) for p in folder.iterdir() if p.is_file()])

archive(ROOT / 'releases/OPCB_ANDROID_PLUGIN_CANDIDATES_20261114.zip',
    [(ROOT / i['downloadPath'], Path(i['downloadPath']).name) for i in candidates] +
    [(ROOT / name, name) for name in ['MOBILE_CANDIDATES.json', 'ANDROID_MOBILE_CANDIDATES.md']])

combined = []
for item in CATALOG:
    folder = ROOT / item['path']
    files = [p for p in folder.iterdir() if p.is_file()]
    archive(ROOT / item['archive'], [(p, p.name) for p in files])
    combined.extend((p, f"plugins/{item['id']}/{p.name}") for p in files)
combined.extend((ROOT / p, p) for p in ['CATALOG.json', 'README.md', 'BUNDLED_PLUGINS.json'])
archive(ROOT / 'releases/OPCB_STUDIO_PLUGINS_20261113.zip', combined)
folder = ROOT / 'plugins/opcb.plugin-center/0.1.0'
archive(ROOT / 'releases/OPCB_PLUGIN_CENTER_0_1_0.zip', [(p, p.name) for p in folder.iterdir() if p.is_file()])
files = [p for p in ROOT.rglob('*') if p.is_file() and p.name not in ['.git', 'SHA256SUMS.txt'] and not {'.git', 'node_modules', '__pycache__'}.intersection(p.parts)]
(ROOT / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + str(p.relative_to(ROOT)) + '\n' for p in sorted(files)))
print('Rebuilt distribution ZIPs and checksums.')
