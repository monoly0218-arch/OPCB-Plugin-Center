import json
from pathlib import Path
import tempfile
import unittest
import knowledge
from group_catalog import GroupCatalog, load_classification
from web_gateway import ReadOnlyStore


class GroupCatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        store = knowledge.Store(self.root / 'index')
        store.replace({'success': True, 'data': {'notes': [
            {'note_id': '101', 'title': 'Mention of Six Lab', 'content': 'Not proof of ownership', 'created_at': '2026-11-01', 'edit_time': '2026-11-01'},
            {'note_id': '102', 'title': 'Meeting', 'content': 'Plan text', 'created_at': '', 'edit_time': ''}], 'has_more': False}})
        store.replace_source('business', [{'id': 'business:'+'a'*24, 'title': '上粮山 data', 'content': 'metric', 'created_at': '', 'updated_at': '', 'url': 'https://paolab.cn/shangliangshan/'}])
        self.store = ReadOnlyStore(store.root)
        self.file = self.root / 'classification.json'

    def configured(self):
        self.file.write_text(json.dumps({'version': 1, 'revision': 2, 'projects': [], 'documents': {
            'recordings:101': {'team': 'six-lab', 'category': 'methods', 'evidence': 'Owner confirmed'},
            'recordings:102': {'shared': True, 'evidence': 'Explicit approved sharing'}}}))
        self.file.chmod(0o600)
        return GroupCatalog(self.store, self.file)

    def test_teams_are_not_guessed_and_source_project_is_preserved(self):
        before = self.store.database.read_bytes()
        group = GroupCatalog(self.store)
        value = group.catalog({'recordings', 'business'})
        self.assertEqual(len(value['teams']), 7)
        self.assertEqual([t['name'] for t in value['teams']][-1], 'iSense 团队')
        self.assertTrue(all(t['documents'] == 0 for t in value['teams']))
        self.assertEqual(value['unassigned'], 3)
        self.assertEqual(value['projects'][0]['documents'], 1)
        self.assertEqual(value['shared'], 0)
        self.assertEqual(before, self.store.database.read_bytes())

    def test_counts_search_and_pages_cannot_include_denied_sources(self):
        group = self.configured()
        self.assertEqual(group.catalog({'recordings'})['total'], 2)
        self.assertEqual(group.catalog(set())['total'], 0)
        self.assertEqual(group.browse({'op': 'browse', 'space': 'project', 'space_id': 'shangliangshan'}, {'recordings'})['results'], [])
        result = group.browse({'op': 'browse', 'space': 'team', 'space_id': 'six-lab', 'query': 'ownership'}, {'recordings'})
        self.assertEqual(result['results'][0]['id'], '101')
        self.assertEqual(group.browse({'op': 'browse', 'space': 'shared'}, {'recordings'})['total'], 1)
        first = group.browse({'op': 'browse', 'limit': 1}, {'recordings', 'business'})
        second = group.browse({'op': 'browse', 'limit': 1, 'offset': first['next_offset']}, {'recordings', 'business'})
        self.assertNotEqual(first['results'][0]['id'], second['results'][0]['id'])
        self.assertEqual(group.browse({'op': 'browse', 'kind': 'image'}, {'recordings'})['total'], 0)
        self.assertEqual(group.browse({'op': 'browse', 'category': 'methods'}, {'recordings'})['total'], 1)

    def test_invalid_and_partial_classifications_fail_without_rewriting_index(self):
        group = self.configured()
        for patch in [{'space': 'team', 'space_id': 'admin'}, {'kind': 'html'}, {'offset': True}, {'limit': 0}, {'owner': 'someone'}, {'query': 'a'*101}]:
            with self.assertRaises((ValueError, TypeError)):
                group.browse({'op': 'browse', **patch}, {'recordings'})
        value = json.loads(self.file.read_text())
        del value['documents']['recordings:101']['evidence']
        self.file.write_text(json.dumps(value))
        with self.assertRaises(ValueError):
            load_classification(self.file)
        self.file.chmod(0o644)
        with self.assertRaises(ValueError):
            load_classification(self.file)

    def test_stale_sources_are_reported_without_listing_stale_content(self):
        group = GroupCatalog(self.store)
        with knowledge.Store(self.store.root).connect() as db:
            db.execute("UPDATE metadata SET value='1' WHERE key='synced_epoch'")
        result = group.browse({'op': 'browse'}, {'recordings', 'business'})
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['unavailable'], ['recordings'])

    def test_media_types_require_explicit_safe_original_references(self):
        self.configured()
        value = json.loads(self.file.read_text())
        item = value['documents']['recordings:101']
        item['kind'] = 'video'
        self.file.write_text(json.dumps(value))
        with self.assertRaises(ValueError):
            load_classification(self.file)
        item['originals'] = [{'name': 'Approved example', 'kind': 'video', 'url': 'https://example.com/video', 'access': 'source'}]
        self.file.write_text(json.dumps(value))
        group = GroupCatalog(self.store, self.file)
        row = group.browse({'op': 'browse', 'kind': 'video'}, {'recordings'})['results'][0]
        self.assertFalse(row['originals'][0]['archived'])
        self.assertEqual(row['originals'][0]['state'], 'linked')
        item['originals'][0]['url'] = 'https://example.com/video?signature=temporary'
        self.file.write_text(json.dumps(value))
        with self.assertRaises(ValueError):
            load_classification(self.file)

    def test_classification_command_is_dry_by_default_and_atomic_with_revision_fence(self):
        import subprocess
        import sys
        self.configured()
        incoming = json.loads(self.file.read_text())
        incoming['revision'] = 3
        candidate = self.root / 'next.json'
        candidate.write_text(json.dumps(incoming))
        candidate.chmod(0o600)
        command = [sys.executable, str(Path(__file__).with_name('classify_documents.py')), str(candidate), '--output', str(self.file), '--expected-revision', '2']
        before = self.file.read_bytes()
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.file.read_bytes(), before)
        self.assertEqual(subprocess.run(command+['--apply'], capture_output=True).returncode, 0)
        self.assertEqual(json.loads(self.file.read_text())['revision'], 3)
        self.assertEqual(self.file.stat().st_mode & 0o777, 0o600)
        self.assertNotEqual(subprocess.run(command+['--apply'], capture_output=True).returncode, 0)
