from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class VoiceInputSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_voice_input_auto_finishes_after_pause(self):
        self.assertIn('const originalInput = listen("After Pause", "jp-JP")', self.source)
        self.assertNotIn('const originalInput = listen("On Tap", "jp-JP")', self.source)

    def test_voice_core_does_not_depend_on_shortcut_input(self):
        self.assertNotIn("#define inputs text", self.source)
        self.assertNotIn("{ShortcutInput}", self.source)
        self.assertNotIn("@resolvedInput", self.source)

if __name__ == "__main__":
    unittest.main()
