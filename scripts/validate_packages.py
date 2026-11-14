"""Validate distribution files without installing plugins or contacting services."""
from pathlib import Path
import ast
import hashlib
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'CATALOG.json').read_text())
assert len(CATALOG) == len({i['id'] for i in CATALOG}) == 14
known_secret = re.compile(r'gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----')
for manifest in sorted((ROOT / 'plugins').glob('*/*/manifest.json')):
    data = json.loads(manifest.read_text())
    assert data['apiVersion'] == 1 and data['id'] and data['name'], manifest
    code = (manifest.parent / 'plugin.js').read_bytes()
    assert not known_secret.search(code.decode()), manifest
    subprocess.run(['node', '--input-type=module', '--check'], input=code, check=True, capture_output=True)
for script in (ROOT / 'plugins').rglob('*.py'):
    ast.parse(script.read_text(), filename=str(script))
for item in CATALOG:
    folder = ROOT / item['path']
    code = (folder / 'plugin.js').read_bytes()
    assert hashlib.sha256(code).hexdigest() == item['distributionCodeSha256'], item['id']
    assert json.loads((folder / 'manifest.json').read_text())['id'] == item['id']
    if not item['sanitized']:
        assert item['codeSha256'] == item['distributionCodeSha256'], item['id']
    with zipfile.ZipFile(ROOT / item['archive']) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == {p.name for p in folder.iterdir() if p.is_file()}
        for name in archive.namelist():
            assert archive.read(name) == (folder / name).read_bytes()
    if item['id'] == 'opcb.shangliangshan-assets':
        text = code.decode(); offset = text.index('preview = ') + len('preview = ')
        preview, _ = json.JSONDecoder().raw_decode(text[offset:])
        assert preview['items'] == [] and preview['count'] == 0 and preview['owner'] == ''
    if item['id'] == 'opcb.results-report':
        text = code.decode(); offset = text.index('const report = ') + len('const report = ')
        report, _ = json.JSONDecoder().raw_decode(text[offset:])
        assert report['templates'] == [] and report['screens'] == []
        assert all(v is None for v in report['actual'].values())
        assert 'data:video/' not in text and 'data:image/' not in text and 'www.biji.com/note/' not in text
with zipfile.ZipFile(ROOT / 'releases/OPCB_STUDIO_PLUGINS_20261113.zip') as archive:
    assert archive.testzip() is None
    expected = {f"plugins/{i['id']}/{p.name}": p for i in CATALOG for p in (ROOT / i['path']).iterdir() if p.is_file()}
    expected.update({name: ROOT / name for name in ['CATALOG.json', 'README.md', 'BUNDLED_PLUGINS.json']})
    assert set(archive.namelist()) == set(expected)
    for name, path in expected.items():
        assert archive.read(name) == path.read_bytes(), name
with zipfile.ZipFile(ROOT / 'releases/OPCB_PLUGIN_CENTER_0_1_0.zip') as archive:
    folder = ROOT / 'plugins/opcb.plugin-center/0.1.0'
    assert archive.testzip() is None
    assert set(archive.namelist()) == {p.name for p in folder.iterdir() if p.is_file()}
    for name in archive.namelist():
        assert archive.read(name) == (folder / name).read_bytes(), name
tracked = set()
for line in (ROOT / 'SHA256SUMS.txt').read_text().splitlines():
    expected, name = line.split('  ', 1)
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    tracked.add(name)
actual = {str(p.relative_to(ROOT)) for p in ROOT.rglob('*') if p.is_file() and p.name not in ('.git', 'SHA256SUMS.txt') and not {'.git', 'node_modules', '__pycache__'}.intersection(p.parts)}
assert tracked == actual, (actual - tracked, tracked - actual)
subprocess.run(['node', str(ROOT / 'scripts/check_empty_templates.mjs')], check=True)
print('PASS: all manifest/JS entries, Python syntax, Studio ZIPs, plugin center ZIP, complete SHA256 list, and sanitized template checks.')
