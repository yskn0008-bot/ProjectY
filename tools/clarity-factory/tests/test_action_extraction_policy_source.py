from pathlib import Path
import unittest

PATCH = Path(__file__).resolve().parents[1] / "patch_action_extraction_policy.py"

class ActionExtractionPolicySourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = PATCH.read_text(encoding="utf-8")

    def test_execution_executors_are_nonempty_routed(self):
        for executor in ("open_app", "device_setting", "myway", "shortcut_factory"):
            self.assertIn(executor, self.source)

    def test_known_execution_examples_are_explicit(self):
        for example in ("MY WAYを開いて", "ChatGPTを開いて", "Wi-Fiを切って", "ショートカットを作って"):
            self.assertIn(example, self.source)

    def test_patch_self_verifies_execution_markers(self):
        required_block = self.source.split("required = [", 1)[1]
        for marker in ("MY WAYを開いて", "ChatGPTを開いて", "Wi-Fiを切って"):
            self.assertIn(marker, required_block)

if __name__ == "__main__":
    unittest.main()
