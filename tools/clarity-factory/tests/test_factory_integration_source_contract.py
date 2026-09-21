from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "clarity-v1.cherri"
FACTORY_PATCH = ROOT / "patch_local_shortcut_factory.py"

class FactoryIsolationSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")
        cls.factory_patch = FACTORY_PATCH.read_text(encoding="utf-8")

    def test_factory_is_not_in_normal_clarity_runtime(self):
        self.assertNotIn('executor == "shortcut_factory"', self.source)
        self.assertNotIn('@handoffExecutor == "shortcut_factory"', self.source)
        self.assertNotIn('shortcutFactoryRequest', self.source)
        self.assertNotIn('set target=safari', self.source)

    def test_factory_assets_are_retained_for_separate_lane(self):
        self.assertIn('HUBSIGN_ENDPOINT = "https://hubsign.routinehub.services/sign"', self.factory_patch)
        self.assertIn('YOS Safari Auto.shortcut', self.factory_patch)

    def test_parent_routes_open_app_to_fixed_child(self):
        self.assertIn('run("YOS_OpenApp", @handoffTarget)', self.source)
        self.assertNotIn('openApp("com.openai.chat")', self.source)

if __name__ == "__main__":
    unittest.main()
