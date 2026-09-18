import importlib.util
import json
import pathlib
import tempfile
import unittest

MODULE = pathlib.Path(__file__).resolve().parents[1] / "factory_store.py"
spec = importlib.util.spec_from_file_location("factory_store", MODULE)
store = importlib.util.module_from_spec(spec)
spec.loader.exec_module(store)


class FactoryStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.src = self.root / "src"
        self.fs = self.root / "factory"
        self.src.mkdir()
        (self.src / "a.txt").write_text("one\n", encoding="utf-8")
        (self.src / "sub").mkdir()
        (self.src / "sub" / "b.js").write_text("console.log('b')\n", encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def test_snapshot_verify_restore_and_diff(self):
        first = store.create_snapshot(self.src, self.fs, "first")
        verified = store.verify_snapshot(self.fs, first["snapshot_id"])
        self.assertTrue(verified["ok"])
        self.assertEqual(verified["checked_files"], 2)

        (self.src / "a.txt").write_text("two\n", encoding="utf-8")
        (self.src / "c.txt").write_text("new\n", encoding="utf-8")
        second = store.create_snapshot(self.src, self.fs, "second")
        diff = store.diff_snapshots(self.fs, first["snapshot_id"], second["snapshot_id"])
        self.assertEqual(diff["added"], ["c.txt"])
        self.assertEqual(diff["changed"], ["a.txt"])

        restored = self.root / "restored"
        out = store.restore_snapshot(self.fs, restored, first["snapshot_id"])
        self.assertEqual(out["restored_files"], 2)
        self.assertEqual((restored / "a.txt").read_text(encoding="utf-8"), "one\n")

    def test_secret_and_cache_exclusion(self):
        (self.src / ".env").write_text("SECRET=1\n", encoding="utf-8")
        (self.src / "dev.p12").write_bytes(b"secret")
        (self.src / "node_modules").mkdir()
        (self.src / "node_modules" / "x.js").write_text("x", encoding="utf-8")
        manifest = store.create_snapshot(self.src, self.fs)
        paths = {row["path"] for row in manifest["files"]}
        self.assertNotIn(".env", paths)
        self.assertNotIn("dev.p12", paths)
        self.assertNotIn("node_modules/x.js", paths)

    def test_store_inside_source_is_rejected(self):
        with self.assertRaises(store.FactoryStoreError):
            store.create_snapshot(self.src, self.src / ".factory-store")

    def test_current_pointer_replaces_main_concept(self):
        snap = store.create_snapshot(self.src, self.fs)
        current = json.loads((self.fs / "state" / "current.json").read_text(encoding="utf-8"))
        self.assertEqual(current["snapshot_id"], snap["snapshot_id"])


if __name__ == "__main__":
    unittest.main()
