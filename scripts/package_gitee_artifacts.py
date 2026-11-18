"""Write hash-pinned native Buzz HTTPS artifacts for the Gitee catalog."""
import hashlib
import json
from pathlib import Path
import re

from release_identity import native_artifact

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 8 * 1024 * 1024
REGISTRY = ROOT / 'REGISTRY.json'
registry = json.loads(REGISTRY.read_bytes())

for entry in registry['entries']:
    revision = entry['release']['revision']
    payload, publisher = native_artifact(ROOT / entry['sourcePath'])
    if hashlib.sha256(payload).hexdigest() != revision:
        raise ValueError(f"Release revision mismatch for {entry['id']} {entry['version']}")
    if publisher is not None or len(payload) > LIMIT:
        entry.pop('nativeArtifact', None)
        continue
    if not re.fullmatch(r'[a-z0-9.-]+', entry['id']) or not re.fullmatch(r'[a-zA-Z0-9._-]+', entry['version']):
        raise ValueError('Unsafe native artifact path')
    relative = Path('native-artifacts', entry['id'], entry['version'] + '.json')
    output = ROOT / relative
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    entry['nativeArtifact'] = relative.as_posix()

REGISTRY.write_text(json.dumps(registry, ensure_ascii=False, separators=(",", ":")) + '\n')
print(f"Packed {sum('nativeArtifact' in row for row in registry['entries'])} native HTTPS artifacts.")
