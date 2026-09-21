from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class VoiceInputSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_voice_input_waits_for_user_tap(self):
        self.assertIn('const originalInput = listen("On Tap", "jp-JP")', self.source)
        self.assertNotIn('const originalInput = listen("After Pause", "jp-JP")', self.source)

if __name__ == "__main__":
    unittest.main()
