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

    def test_voice_core_has_dictionary_answer_format(self):
        for required in (
            "pure knowledge questions about the meaning, reading, nuance, or usage of a word or short phrase",
            "executor=answer, domain=knowledge, intent=answer",
            "ひとことで：",
            "意味：",
            "ニュアンス：",
            "使い方：",
            "例：",
            "似た言葉との差：",
            "Do not add filler and do not force every optional section",
        ):
            self.assertIn(required, self.source)

if __name__ == "__main__":
    unittest.main()
