#!/usr/bin/env python3
"""Bounded plugin bridge to the existing pool. Never reads credentials."""
import importlib.util
import contextlib
import json
import os
import secrets
import sqlite3
import sys
from pathlib import Path

POOL = Path('/Users/moo/.buzz/RESEARCH/HIGGSFIELD_SELF_SERVICE_HARNESS/源文件/pool.py')
JOURNAL = Path(__file__).resolve().parents[1] / '运行数据/CLAIM_JOURNAL.sqlite3'


def backend():
    spec = importlib.util.spec_from_file_location('pool_backend', POOL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@contextlib.contextmanager
def journal(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(path, timeout=3)
    db.row_factory = sqlite3.Row
    os.chmod(path, 0o600)
    try:
        db.execute('CREATE TABLE IF NOT EXISTS claims('
                   'scope TEXT, owner TEXT, epoch TEXT NOT NULL, payload TEXT, receipt TEXT, '
                   'PRIMARY KEY(scope,owner))')
        db.execute('BEGIN IMMEDIATE')
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def claim_row(db, scope, owner):
    row = db.execute('SELECT * FROM claims WHERE scope=? AND owner=?', (scope, owner)).fetchone()
    if row is None:
        db.execute('INSERT INTO claims VALUES(?,?,?,NULL,NULL)', (scope, owner, secrets.token_hex(16)))
        row = db.execute('SELECT * FROM claims WHERE scope=? AND owner=?', (scope, owner)).fetchone()
    return row


def public_claim(row):
    payload = json.loads(row['payload']) if row['payload'] else None
    return {'epoch': row['epoch'], 'state': 'complete' if row['receipt'] else 'pending' if payload else 'empty',
            'payload': {k: payload[k] for k in ('project', 'template', 'count')} if payload else None,
            'receipt': json.loads(row['receipt']) if row['receipt'] else None}


def validate_scope(payload):
    for field, limit in (('scope', 1024), ('owner', 128)):
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError('缺少或无效的领取上下文: ' + field)


def dispatch(request, *, db_path=None, journal_path=JOURNAL):
    if not isinstance(request, dict) or set(request) - {'operation', 'payload'}:
        raise ValueError('无效的号池请求')
    operation = request.get('operation')
    if operation not in ('status', 'claim', 'new_claim'):
        raise ValueError('插件只支持查询和领取，不支持迁移或清空库存')
    payload = request.get('payload', {})
    if not isinstance(payload, dict):
        raise ValueError('无效的请求参数')
    allowed = {'scope', 'owner'} if operation == 'status' else {'scope', 'owner', 'epoch'} if operation == 'new_claim' else {
        'scope', 'epoch', 'owner', 'executor', 'project', 'template', 'count', 'exclude_accounts'}
    if set(payload) - allowed:
        raise ValueError('请求含不支持的参数')
    if payload or operation != 'status':
        validate_scope(payload)
    if operation == 'new_claim':
        with journal(journal_path) as db:
            row = claim_row(db, payload['scope'], payload['owner'])
            if row['epoch'] != payload.get('epoch'):
                raise ValueError('申请已在其他面板更新，请刷新后查看')
            if row['payload'] and not row['receipt']:
                raise ValueError('上一批领取结果未核实，请先恢复原申请，不能新领一批')
            db.execute('UPDATE claims SET epoch=?,payload=NULL,receipt=NULL WHERE scope=? AND owner=?',
                       (secrets.token_hex(16), payload['scope'], payload['owner']))
            return public_claim(claim_row(db, payload['scope'], payload['owner']))
    module = backend()
    path = db_path if db_path is not None else module.DEFAULT_DB
    if operation == 'status':
        result = module.execute(path, 'status', {})
        out = {'claiming': result['claiming'], 'accounts': [
            {k: row.get(k) for k in ('id', 'state', 'owner', 'executor', 'project', 'template', 'batch', 'updated')}
            for row in result['accounts']], 'scope': result['scope']}
        if payload:
            with journal(journal_path) as db:
                out['claim'] = public_claim(claim_row(db, payload['scope'], payload['owner']))
        return out
    # Persist the exact allocator request BEFORE making a claim. A killed
    # command or lost response can only replay this request after a remount.
    module.required(payload, 'executor', 'project', 'template', 'epoch')
    count = payload.get('count')
    excluded = payload.get('exclude_accounts', [])
    if type(count) is not int or not 1 <= count <= 30:
        raise ValueError('count must be an integer from 1 to 30')
    if not isinstance(excluded, list) or any(not isinstance(v, str) or not v.strip() for v in excluded):
        raise ValueError('exclude_accounts must be a list of nonempty account ids')
    base = {k: payload[k] for k in ('owner', 'executor', 'project', 'template', 'count')}
    with journal(journal_path) as db:
        row = claim_row(db, payload['scope'], payload['owner'])
        if row['epoch'] != payload['epoch']:
            raise ValueError('申请已在其他面板更新，请刷新后查看')
        if row['payload']:
            stored = json.loads(row['payload'])
            if any(stored[k] != v for k, v in base.items()):
                raise ValueError('已有一批申请，请先恢复结果；领取另一批须明确点击新建')
        else:
            stored = {**base, 'request': secrets.token_hex(16), 'exclude_accounts': sorted(set(excluded))}
            db.execute('UPDATE claims SET payload=? WHERE scope=? AND owner=?',
                       (json.dumps(stored), payload['scope'], payload['owner']))
    result = module.execute(path, 'claim', stored)
    with journal(journal_path) as db:
        # A new epoch can only be opened after a receipt was stored. Keep a
        # late completion from modifying another panel's new application.
        db.execute('UPDATE claims SET receipt=? WHERE scope=? AND owner=? AND epoch=?',
                   (json.dumps(result), payload['scope'], payload['owner'], payload['epoch']))
    return result


def main():
    try:
        raw = sys.stdin.buffer.read(8193)
        if len(raw) > 8192:
            raise ValueError('请求过大')
        result = dispatch(json.loads(raw))
        print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False))
    except (ValueError, KeyError, TypeError) as error:
        # Only backend validation messages; raw request/credentials never logged.
        print(json.dumps({'ok': False, 'error': str(error)[:500]}, ensure_ascii=False))
    except Exception:
        print(json.dumps({'ok': False, 'error': '本机号池暂不可用，请检查服务状态'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
