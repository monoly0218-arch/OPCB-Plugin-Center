"""Validate/stage operator-confirmed classification; never edit source indexes or ACLs."""
import argparse
import json
import os
from pathlib import Path
import tempfile
from group_catalog import load_classification


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifest', type=Path)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--expected-revision', type=int, required=True)
    p.add_argument('--apply', action='store_true', help='Atomically replace classification only after reviewing dry-run output')
    args = p.parse_args()
    incoming = load_classification(args.manifest)
    current = load_classification(args.output)
    if current['revision'] != args.expected_revision or incoming['revision'] != args.expected_revision + 1:
        raise SystemExit('Classification changed; refresh the manifest before applying')
    print(json.dumps({'checked': True, 'apply': args.apply, 'revision': incoming['revision'],
                      'confirmed_documents': len(incoming['documents']), 'additional_projects': len(incoming['projects']),
                      'source_documents_changed': False, 'permissions_changed': False}, ensure_ascii=False))
    if not args.apply:
        return
    parent = args.output.parent
    if parent.stat().st_mode & 0o077 or not parent.is_dir() or args.output.is_symlink():
        raise SystemExit('Classification output needs a private directory and regular file')
    # Serialize concurrent writers with a private sidecar lock; hold it through rename.
    import fcntl
    with (parent / '.classification.lock').open('a') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        if load_classification(args.output)['revision'] != args.expected_revision:
            raise SystemExit('Classification changed; refused stale replacement')
        fd, name = tempfile.mkstemp(dir=parent, prefix='.organization-')
        try:
            with os.fdopen(fd, 'w') as stream:
                json.dump(incoming, stream, ensure_ascii=False, allow_nan=False)
                stream.write('\n');stream.flush();os.fsync(stream.fileno())
            os.replace(name, args.output)
        finally:
            if os.path.exists(name):
                os.unlink(name)


if __name__ == '__main__':
    main()
