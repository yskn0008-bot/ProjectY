from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class InputSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_text_shortcut_input_is_accepted(self):
        self.assertIn("#define inputs text", self.source)
        self.assertIn('@originalInput = "{ShortcutInput}"', self.source)

    def test_voice_input_is_fallback_when_no_text_was_supplied(self):
        self.assertIn("if !@originalInput {", self.source)
        self.assertIn('@originalInput = listen("After Pause", "jp-JP")', self.source)
        self.assertNotIn('@originalInput = listen("On Tap", "jp-JP")', self.source)

    def test_raw_first_uses_resolved_input(self):
        self.assertIn(r'RAW\t{@originalInput}', self.source)
        self.assertIn("original_input: {@originalInput}", self.source)

if __name__ == "__main__":
    unittest.main()
