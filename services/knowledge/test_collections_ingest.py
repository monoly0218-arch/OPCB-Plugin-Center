import base64
import hashlib
from pathlib import Path
import tempfile
import unittest
from collections_ingest import Collections
from identity_policy import PermissionDenied, PolicyConflict, VerifiedIdentity

class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name); root.chmod(0o700)
        self.store = Collections(root / 'collections.sqlite3')
        self.person = VerifiedIdentity('c'*64, 'a'*64, 'a'*64, 'd'*64)
        self.agent = VerifiedIdentity('c'*64, 'a'*64, 'b'*64, 'd'*64)
        self.other = VerifiedIdentity('c'*64, 'e'*64, 'e'*64, 'd'*64)
        self.meta = dict(source_id='image-source', title='主图', kind='image', source_url='https://example.com/a.png', channel_id='private-chat', message_id='f'*64, tags=['品牌'], group_id='g-main', group_title='品牌图', version=3)
        self.data = b'\x89PNG\r\n\x1a\nsynthetic fixture'
        self.upload = dict(size=len(self.data), sha256=hashlib.sha256(self.data).hexdigest(), mime='image/png')

    def test_original_bytes_commit_readback_and_owner_agent_scope(self):
        item = self.store.begin(self.agent, self.meta, self.upload)
        self.assertEqual(self.store.list(self.person)['results'], [])
        self.store.append(self.agent, item['id'], 0, base64.b64encode(self.data).decode())
        self.store.commit(self.agent, item['id'])
        saved = self.store.read(self.person, item['id'], 0)
        self.assertEqual(base64.b64decode(saved['chunk']), self.data)
        self.assertEqual(saved['metadata']['version'], 3)
        self.assertEqual(saved['actor'], self.agent.actor)
        self.assertEqual(saved['storage'], 'original')
        self.assertEqual(self.store.list(self.person, kind='image', query='品牌')['results'][0]['id'], item['id'])
        self.assertEqual(self.store.count(self.person), 1)
        with self.assertRaises(PermissionDenied): self.store.read(self.other, item['id'])
        self.assertEqual(self.store.list(self.other)['results'], [])
        self.assertEqual(self.store.begin(self.person, self.meta, self.upload)['id'], item['id'])
        self.assertEqual(self.store.count(self.person), 1)

    def test_lost_ack_retries_are_idempotent_conflicts_do_not_replace_bytes(self):
        item = self.store.begin(self.person, self.meta, self.upload)
        chunk = base64.b64encode(self.data).decode()
        self.store.append(self.person, item['id'], 0, chunk)
        self.assertEqual(self.store.append(self.person, item['id'], 0, chunk)['received'], len(self.data))
        with self.assertRaises(PolicyConflict): self.store.append(self.person, item['id'], 0, base64.b64encode(b'wrong').decode())
        self.store.commit(self.person, item['id'])
        self.assertEqual(self.store.commit(self.person, item['id'])['state'], 'complete')
        with self.assertRaises(PolicyConflict): self.store.begin(self.person, {**self.meta, 'title': 'changed'}, self.upload)

    def test_wrong_hash_incomplete_and_url_only_images_never_appear_saved(self):
        with self.assertRaises(ValueError): self.store.begin(self.person, self.meta)
        item = self.store.begin(self.person, self.meta, {**self.upload, 'sha256': '0'*64})
        with self.assertRaises(ValueError): self.store.commit(self.person, item['id'])
        self.store.append(self.person, item['id'], 0, base64.b64encode(self.data).decode())
        with self.assertRaises(ValueError): self.store.commit(self.person, item['id'])
        self.assertEqual(self.store.count(self.person), 0)
        with self.assertRaises(PermissionDenied): self.store.read(self.person, item['id'])

    def test_link_is_explicit_reference_and_filter_queries_are_literal(self):
        item = self.store.begin(self.person, {**self.meta, 'kind': 'link'})
        saved = self.store.commit(self.person, item['id'])
        self.assertEqual(saved['storage'], 'link')
        self.assertEqual(self.store.list(self.person, kind='image')['results'], [])
        self.assertEqual(self.store.list(self.person, query='%')['results'], [])
        with self.assertRaises(ValueError): self.store.begin(self.person, {**self.meta, 'source_id': 'evil', 'source_url': 'file:///etc/passwd'}, self.upload)
        with self.assertRaises(ValueError): self.store.begin(self.person, {**self.meta, 'source_id': 'evil'}, {**self.upload, 'mime': 'image/svg+xml'})
        with self.assertRaises(PermissionDenied): self.store.list({'owner': self.person.owner})

if __name__ == '__main__': unittest.main()
