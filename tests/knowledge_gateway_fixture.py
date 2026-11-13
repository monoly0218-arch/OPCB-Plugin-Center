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
from identity_policy import LibraryPolicy, VerifiedIdentity
from web_gateway import ReadOnlyStore
import knowledge

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    root.chmod(0o700)
    store = knowledge.Store(root / 'index')
    notes = [{
        'note_id': '100', 'title': 'Fixture plan', 'content': '# Fixture plan\nPrivate fixture text',
        'created_at': '2026-11-13', 'edit_time': '2026-11-13'}]
    if '--preview' in sys.argv[5:]:
        titles = ['本周项目工作计划', '产品体验与用户反馈', '内容制作流程讨论', '研究资料整理方法', '团队协作与知识沉淀', '下周交付安排']
        notes = [{'note_id': str(100 + i), 'title': title,
                  'content': '# ' + title + '\n\n本地演示资料，用于检查知识库阅读与排版。\n\n## 本周重点\n\n围绕项目目标整理工作安排，让人员与 Agent 能快速找到资料、理解背景。\n\n| 工作 | 状态 |\n| --- | --- |\n| 整理资料目录 | 进行中 |\n| 核对交付内容 | 待处理 |\n\n## 下一步\n\n- 复核来源与更新时间\n- 整理需要协作的事项\n\n> 本页使用隔离的演示数据，不包含真实业务资料。',
                  'created_at': '2026-11-13', 'edit_time': '2026-11-13'} for i, title in enumerate(titles)]
    store.replace({'success': True, 'data': {'notes': notes, 'has_more': False}})
    policy = LibraryPolicy(root / 'policy.sqlite3', sys.argv[1], [sys.argv[2]])
    policy.bootstrap_libraries()
    if '--preview' in sys.argv[5:]:
        administrator = VerifiedIdentity(sys.argv[1], sys.argv[2], sys.argv[2], 'f' * 64)
        for person in [sys.argv[2]] + [str(i) * 64 for i in range(1, 5)]:
            policy.change(administrator, policy.revision(), 'grant', {'owner': person, 'library': 'company', 'allow': True})
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
