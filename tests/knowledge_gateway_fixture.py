"""Isolated fixture for real HTTP/signature integration tests. No production data."""
from http.server import ThreadingHTTPServer
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services/knowledge'))
from identity_gateway import IdentityBindings, identity_handler
from identity_policy import LibraryPolicy
from web_gateway import ReadOnlyStore
import knowledge

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    root.chmod(0o700)
    store = knowledge.Store(root / 'index')
    store.replace({'success': True, 'data': {'notes': [{
        'note_id': '100', 'title': 'Fixture plan', 'content': '# Fixture plan\nPrivate fixture text',
        'created_at': '2026-11-13', 'edit_time': '2026-11-13'}], 'has_more': False}})
    policy = LibraryPolicy(root / 'policy.sqlite3', sys.argv[1], [sys.argv[2]])
    policy.bootstrap_libraries()
    bindings = IdentityBindings(root / 'bindings.sqlite3', sys.argv[1], Path(sys.argv[3]), sys.argv[4])
    read_store = ReadOnlyStore(root / 'index')
    before = hashlib.sha256(read_store.database.read_bytes()).hexdigest()
    server = ThreadingHTTPServer(('127.0.0.1', 0), identity_handler(read_store, policy, bindings))
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(json.dumps({'port': server.server_port}), flush=True)
    sys.stdin.readline()
    server.shutdown()
    server.server_close()
    thread.join()
    assert before == hashlib.sha256(read_store.database.read_bytes()).hexdigest(), 'Read-only index was modified'
