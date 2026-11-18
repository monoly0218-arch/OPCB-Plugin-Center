"""Reproduce Buzz v1.0.5's public unsigned Artifact serialization, without installation.

Reference: block/buzz-app crates/plugin-manager/src/lib.rs Manifest/HostGrants/Artifact.
The baseline tests compare this against 17 real native installation revisions.
"""
from pathlib import Path
import base64
import hashlib
import json


def ordered(value, fields):
    return {key: value[key] for key in fields if key in value and value[key] is not None}


def manifest_identity(raw):
    result = ordered(raw, ['id', 'name', 'apiVersion', 'description', 'updates', 'discovery', 'host'])
    if 'updates' in result:
        result['updates'] = ordered(result['updates'], ['defaultEnabled'])
    if 'discovery' in result:
        value = result['discovery']
        result['discovery'] = ordered(value, ['category'])
        if value.get('tags'):
            result['discovery']['tags'] = value['tags']
    if 'host' in result:
        raw_host = result['host']
        host = ordered(raw_host, ['federatedIdentity'])
        if 'federatedIdentity' in host:
            grant = host['federatedIdentity']
            host['federatedIdentity'] = {'authority': grant['authority'], 'operations': [ordered(op, ['method', 'path']) for op in grant['operations']]}
        for key in ['agentHooks', 'agentExecution']:
            if raw_host.get(key):
                host[key] = raw_host[key]
        host['commands'] = [ordered(row, ['id', 'program', 'args', 'maxInputBytes', 'maxOutputBytes', 'artifact']) for row in raw_host.get('commands', [])]
        host['networkOrigins'] = raw_host.get('networkOrigins', [])
        if raw_host.get('processes'):
            host['processes'] = []
            for row in raw_host['processes']:
                process = ordered(row, ['id', 'program'])
                process['args'] = row.get('args', [])
                if row.get('bundled'):
                    process['bundled'] = True
                if row.get('artifact'):
                    process['artifact'] = row['artifact']
                host['processes'].append(process)
        for row in [*host['commands'], *host.get('processes', [])]:
            if 'artifact' in row:
                original = row['artifact']
                row['artifact'] = ordered(original, ['path', 'sha256'])
                if original.get('siblings'):
                    row['artifact']['siblings'] = [ordered(s, ['name', 'sha256']) for s in original['siblings']]
        for key in ['mcp', 'files', 'managedFiles', 'publicImages', 'publicPages']:
            if raw_host.get(key):
                host[key] = True
        result['host'] = host
    return result


def release_identity(folder):
    artifact_path = folder / 'plugin.artifact.json'
    publisher = None
    if artifact_path.exists():
        payload = artifact_path.read_bytes()
        signature = folder / 'plugin.signature.json'
        if signature.exists():
            publisher = json.loads(signature.read_bytes())['pubkey']
    else:
        manifest = manifest_identity(json.loads((folder / 'manifest.json').read_bytes()))
        artifact = {'manifest': manifest, 'code': (folder / 'plugin.js').read_bytes().decode('utf-8')}
        for filename, key in [('README.md', 'readme'), ('icon.png', 'iconPng'), ('icon.jpg', 'iconJpg')]:
            file = folder / filename
            if file.exists():
                artifact[key] = file.read_bytes().decode('utf-8') if key == 'readme' else base64.b64encode(file.read_bytes()).decode('ascii')
        payload = json.dumps(artifact, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return {'revision': hashlib.sha256(payload).hexdigest(), 'publisher': publisher}


if __name__ == '__main__':
    import sys
    root = Path(__file__).resolve().parents[1]
    file = root / 'REGISTRY.json'
    registry = json.loads(file.read_bytes())
    for entry in registry['entries']:
        release = release_identity(root / entry['sourcePath'])
        if '--check' in sys.argv:
            assert entry.get('release') == release, entry['sourcePath']
        else:
            entry['release'] = release
    if '--check' not in sys.argv:
        file.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n')
    print(f"Verified native release identities for {len(registry['entries'])} catalog entries.")
