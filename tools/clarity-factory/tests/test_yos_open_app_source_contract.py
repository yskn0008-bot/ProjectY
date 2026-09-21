from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "YOS_OpenApp.cherri"

class YOSOpenAppSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=SOURCE.read_text(encoding="utf-8")

    def test_safari_is_supported(self):
        self.assertIn('if @target == "safari" {', self.source)
        self.assertIn('openApp("safari")', self.source)
        self.assertIn('output("YOS_OPEN_APP_OK:safari")', self.source)

    def test_unknown_targets_fail_closed(self):
        self.assertTrue(self.source.rstrip().endswith('output("YOS_OPEN_APP_BLOCKED:{@target}")'))

    def test_preserves_current_allowlist(self):
        for target in ("safari","shortcuts","files","notes","phone","reminders","mail","music","calendar","maps","contacts","health","photos","appstore","facetime","chatgpt","scriptable","youtube","spotify","google_sheets"):
            self.assertIn(f'if @target == "{target}" {{', self.source)

if __name__ == "__main__":
    unittest.main()
