import copy
import importlib.util
import json
import plistlib
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / 'factory_v4.py'
spec = importlib.util.spec_from_file_location('factory_v4', MODULE)
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)


class FactorySafetyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.src = self.root / 'tools/shortcut-factory/shortcuts/Test.cherri'
        self.src.parent.mkdir(parents=True)
        self.source = '#define name Test\nconst msg = text("hello")\n'
        self.src.write_text(self.source)
        self.item = {
            'id': 'test', 'name': 'Test',
            'source': 'tools/shortcut-factory/shortcuts/Test.cherri',
            'source_git_blob_sha1': f.git_blob_sha1(self.src.read_bytes()),
            'allowed_hosts': []
        }

    def test_reviewed_source_passes(self):
        self.assertEqual(f.validate_source(self.item, self.root)[0], self.src)

    def test_changed_source_fails_pin(self):
        self.src.write_text(self.source + 'showNotification("x", "y")\n')
        with self.assertRaisesRegex(f.FactoryError, 'pin mismatch'):
            f.validate_source(self.item, self.root)

    def test_private_token_fails_even_with_matching_pin(self):
        self.src.write_text(self.source + 'const token = "ntn_abcdefghijklmnopqrstuvwxyz1234"\n')
        self.item['source_git_blob_sha1'] = f.git_blob_sha1(self.src.read_bytes())
        with self.assertRaisesRegex(f.FactoryError, 'Potential secret'):
            f.validate_source(self.item, self.root)

    def test_unreviewed_host_fails(self):
        self.src.write_text(self.source + 'openURL("https://example.com/")\n')
        self.item['source_git_blob_sha1'] = f.git_blob_sha1(self.src.read_bytes())
        with self.assertRaisesRegex(f.FactoryError, 'Unreviewed URL host'):
            f.validate_source(self.item, self.root)
        self.item['allowed_hosts'] = ['example.com']
        f.validate_source(self.item, self.root)

    def test_unreviewed_include_fails(self):
        self.src.write_text(self.source + "#include '../private'\n")
        self.item['source_git_blob_sha1'] = f.git_blob_sha1(self.src.read_bytes())
        with self.assertRaisesRegex(f.FactoryError, 'Unreviewed Cherri include'):
            f.validate_source(self.item, self.root)

    def test_network_without_host_fails(self):
        self.src.write_text(self.source + 'downloadURL(dynamicURL)\n')
        self.item['source_git_blob_sha1'] = f.git_blob_sha1(self.src.read_bytes())
        with self.assertRaisesRegex(f.FactoryError, 'Network action'):
            f.validate_source(self.item, self.root)

    def test_path_traversal_and_duplicate_id_fail(self):
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.json') as fp:
            item = copy.deepcopy(self.item)
            item['source'] = 'tools/shortcut-factory/shortcuts/../../private.cherri'
            json.dump({'schema': 1, 'targets': [item]}, fp)
            fp.flush()
            with self.assertRaisesRegex(f.FactoryError, 'traversal'):
                f.load_registry(Path(fp.name))
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.json') as fp:
            json.dump({'schema': 1, 'targets': [self.item, self.item]}, fp)
            fp.flush()
            with self.assertRaisesRegex(f.FactoryError, 'duplicate'):
                f.load_registry(Path(fp.name))

    def test_unknown_target_and_empty_workflow_fail(self):
        with self.assertRaisesRegex(f.FactoryError, 'Unknown'):
            f.select({'test': self.item}, 'nonexistent')
        invalid = self.root / 'bad.shortcut'
        invalid.write_bytes(plistlib.dumps({'WFWorkflowActions': []}))
        with self.assertRaisesRegex(f.FactoryError, 'No actions'):
            f.parse_unsigned(invalid)

    def test_main_sign_requires_review(self):
        self.assertEqual(f.main(['sign', '--target', 'stash']), 1)
        self.assertEqual(f.main(['sign', '--target', 'all', '--reviewed']), 1)


if __name__ == '__main__':
    unittest.main()
