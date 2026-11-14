"""Exercise browsing against the same read-only query boundary as live clients."""
import unittest
import web_gateway
import knowledge
import test_web_workspace as fixtures
A = fixtures.A
from web_gateway import DESKTOP_ORIGIN


class DocumentListTests(unittest.TestCase):
    setUp = fixtures.WorkspaceTests.setUp
    http = fixtures.WorkspaceTests.http
    stop = fixtures.WorkspaceTests.stop
    write_members = staticmethod(fixtures.WorkspaceTests.write_members)
    def test_list_requires_authorization_and_preserves_ids(self):
        request = {"viewer": A, "request": {"op": "list", "source": "recordings", "limit": 20, "offset": 0}}
        self.assertEqual(self.http("/api/desktop/query", request, desktop=True, origin=DESKTOP_ORIGIN)[0], 401)
        token = self.sessions.exchange(self.sessions.issue(A), A)
        before = self.store.database.read_bytes()
        status, _, value = self.http("/api/desktop/query", request, token=token, desktop=True, origin=DESKTOP_ORIGIN)
        self.assertEqual(status, 200)
        self.assertEqual(value["results"][0]["id"], "100")
        self.assertIn("excerpt", value["results"][0])
        self.assertNotIn("content", value["results"][0])
        self.assertEqual(before, self.store.database.read_bytes())

    def test_bounds_denied_sources_and_unknown_operations(self):
        for patch in [{"offset": -1}, {"offset": True}, {"limit": 21}, {"limit": True}]:
            with self.assertRaises(knowledge.KnowledgeError):
                web_gateway.query(self.store, {"op": "list", "source": "recordings", **patch}, {"recordings"})
        with self.assertRaises(knowledge.KnowledgeError):
            web_gateway.query(self.store, {"op": "list", "source": "recordings"}, {"business"})
        with self.assertRaises(knowledge.KnowledgeError):
            web_gateway.query(self.store, {"op": "write", "source": "recordings"}, {"recordings"})
        result = web_gateway.query(self.store, {"op": "list", "source": "recordings", "offset": 20}, {"recordings"})
        self.assertEqual(result["results"], [])
        self.assertIsNone(result["next_offset"])


if __name__ == "__main__":
    unittest.main()
