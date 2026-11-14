import tempfile
from pathlib import Path
import unittest
from identity_policy import LibraryPolicy, PermissionDenied, PolicyConflict, VerifiedIdentity

ADMIN, PERSON, OTHER, COMMUNITY = (c * 64 for c in "abcd")


class IdentityPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)
        self.policy = LibraryPolicy(self.root / "policy.sqlite3", COMMUNITY, [ADMIN])
        self.admin = VerifiedIdentity(COMMUNITY, ADMIN, ADMIN, "e" * 64)
        self.person = VerifiedIdentity(COMMUNITY, PERSON, PERSON, "f" * 64)
        self.change("library", {"id": "shangliangshan", "name": "Business library", "parent": None})
        self.change("library", {"id": "products", "name": "Product research", "parent": "shangliangshan"})
        self.change("source", {"id": "research", "library": "products"})

    def tearDown(self):
        self.tmp.cleanup()

    def change(self, action, payload, **kwargs):
        return self.policy.change(kwargs.get("identity", self.admin), self.policy.revision(), action, payload)

    def test_new_agents_inherit_person_without_agent_rows(self):
        self.assertFalse(self.policy.allowed(self.person, "research"))
        self.change("grant", {"owner": PERSON, "library": "shangliangshan", "allow": True})
        for actor in [PERSON, "1" * 64, "2" * 64]:
            self.assertTrue(self.policy.allowed(VerifiedIdentity(COMMUNITY, PERSON, actor, "e" * 64), "research"))
        self.assertEqual(len(self.policy.snapshot(self.admin)["grants"]), 1)

    def test_parent_denial_and_person_disable_take_effect_next_read(self):
        self.change("grant", {"owner": PERSON, "library": "products", "allow": True})
        self.assertTrue(self.policy.allowed(self.person, "research"))
        self.change("grant", {"owner": PERSON, "library": "shangliangshan", "allow": False})
        self.assertFalse(self.policy.allowed(self.person, "research"))
        self.change("grant", {"owner": PERSON, "library": "shangliangshan", "allow": True})
        self.change("disable", {"owner": PERSON, "disabled": True})
        self.assertFalse(self.policy.allowed(self.person, "research"))
        self.change("disable", {"owner": PERSON, "disabled": False})
        self.assertTrue(self.policy.allowed(self.person, "research"))

    def test_personal_admin_only_and_unverified_or_other_community_refused(self):
        for who in [self.person, VerifiedIdentity(COMMUNITY, ADMIN, OTHER, "e" * 64), VerifiedIdentity(OTHER, ADMIN, ADMIN, "e" * 64)]:
            with self.assertRaises(PermissionDenied):
                self.policy.snapshot(who)
        with self.assertRaises(PermissionDenied):
            self.policy.allowed({"owner": PERSON}, "research")
        with self.assertRaises(PermissionDenied):
            self.policy.allowed(VerifiedIdentity(OTHER, PERSON, PERSON, "e" * 64), "research")

    def test_audit_captures_before_after_and_keeps_old_entries_unknown(self):
        import json
        self.change("grant", {"owner": PERSON, "library": "products", "allow": True})
        self.change("inherit", {"owner": PERSON, "library": "products"})
        rows = self.policy.snapshot(self.admin)["audit"]
        self.assertEqual(json.loads(rows[0]["before_value"]), {"rule": "allow"})
        self.assertEqual(json.loads(rows[0]["after_value"]), {"rule": "inherit"})
        self.assertEqual(rows[0]["actor"], ADMIN)
        self.assertEqual(json.loads(rows[0]["payload"])["owner"], PERSON)
        revision = self.policy.revision()
        with self.policy.connect() as db, db:
            db.execute("DROP TABLE audit_changes")
            # Legacy code can still write its original seven-value row.
            db.execute("INSERT INTO audit VALUES (?,?,?,?,?,?,?)", (revision + 1, ADMIN, ADMIN, "e" * 64, "grant", "{}", 1))
            db.execute("UPDATE policy_revision SET value=? WHERE id=1", (revision + 1,))
        revision += 1
        restored = LibraryPolicy(self.root / "policy.sqlite3", COMMUNITY, [ADMIN])
        self.assertEqual(restored.revision(), revision)
        self.assertEqual(len(restored.snapshot(self.admin)["audit"]), revision)
        self.assertIsNone(restored.snapshot(self.admin)["audit"][0]["before_value"])

    def test_conflicts_rollback_and_audit(self):
        revision = self.policy.revision()
        self.change("grant", {"owner": PERSON, "library": "products", "allow": True})
        with self.assertRaises(PolicyConflict):
            self.policy.change(self.admin, revision, "grant", {"owner": PERSON, "library": "products", "allow": False})
        self.assertTrue(self.policy.allowed(self.person, "research"))
        with self.assertRaises(ValueError):
            self.change("library", {"id": "products", "name": "Cycle", "parent": "products"})
        self.assertEqual(self.policy.revision(), revision + 1)
        with self.policy.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit").fetchone()[0], self.policy.revision())


if __name__ == "__main__":
    unittest.main()
