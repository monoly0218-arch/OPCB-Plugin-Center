"""Check the complete installed-plugin publication, including service companions."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
snapshot = json.loads((ROOT / 'STUDIO_INSTALLED.json').read_text())
registry = json.loads((ROOT / 'REGISTRY.json').read_text())
baseline = json.loads((ROOT / 'BASELINE.json').read_text())
assert snapshot['count'] == len(snapshot['entries']) == len({e['id'] for e in snapshot['entries']}) == 19
assert {e['id'] for e in baseline['targets']} < {e['id'] for e in snapshot['entries']}
assert any(e['id'] == 'opcb.plugin-center' for e in snapshot['entries'])
all_expected = {}
for item in snapshot['entries']:
    entry = next(e for e in registry['entries'] if (e['id'], e['version']) == (item['id'], item['version']))
    assert not entry.get('legacy')
    assert item['reviewSource'] == entry['reviewSource']
    folder = ROOT / item['sourcePath']
    assert hashlib.sha256((ROOT / item['downloadPath']).read_bytes()).hexdigest() == item['archiveSha256']
    for name, field in [('plugin.js', 'codeSha256'), ('manifest.json', 'manifestSha256')]:
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == item[field]
    files = [p for p in folder.rglob('*') if p.is_file()]
    if item.get('companionPath'):
        files += [p for p in (ROOT / item['companionPath']).rglob('*') if p.is_file()]
        expected = {str(p.relative_to(ROOT)): p for p in files}
    else:
        expected = {str(p.relative_to(folder)): p for p in files}
    for name, p in expected.items():
        assert not {'.runtime', 'node_modules', '__pycache__'}.intersection(p.parts), name
        assert not name.endswith(('.sqlite', '.sqlite-wal', '.sqlite-shm', 'client.json', 'viewer.json', '.env')), name
    with zipfile.ZipFile(ROOT / item['downloadPath']) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(set(z.namelist()))
        assert set(z.namelist()) == set(expected), item['id']
        for name, p in expected.items():
            assert z.read(name) == p.read_bytes(), name
    all_expected.update({str(p.relative_to(ROOT)): p for p in files})
    for name, digest in item.get('sourceFiles', {}).items():
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == digest
claude = next(e for e in snapshot['entries'] if e['id'] == 'local.claude-acp')
assert 'MIT License' in (ROOT / claude['sourcePath'] / 'LICENSE').read_text()
assert claude['installedSource']['commit'] == 'b72d89baa4257ab9a6257036a070679db89a4532'
calendar = next(e for e in snapshot['entries'] if e['id'] == 'opcb.team-calendar')
assert calendar['installedManifestDiffers'] and calendar['setupRequired']
assert '/Users/' not in (ROOT / calendar['sourcePath'] / 'manifest.json').read_text()
for name in ['STUDIO_INSTALLED.json', 'BASELINE.json', 'REGISTRY.json', 'PLUGIN_SYNC.md',
             'docs/STUDIO_PUBLISH_20261116.md', 'scripts/plan_plugin_sync.mjs', 'src/plugin-center/sync-plan.mjs']:
    all_expected[name] = ROOT / name
with zipfile.ZipFile(ROOT / snapshot['archive']) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == len(set(z.namelist()))
    assert set(z.namelist()) == set(all_expected)
    for name, p in all_expected.items():
        assert z.read(name) == p.read_bytes(), name
print('PASS: all 19 installed plugin publications, fixed sources, native files, licenses, service companion and complete bundle.')
