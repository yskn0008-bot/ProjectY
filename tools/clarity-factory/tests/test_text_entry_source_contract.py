from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "Clarity Text.cherri"

class ClarityTextEntrySourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_text_entry_is_thin_wrapper(self):
        self.assertIn("#define name Clarity Text", self.source)
        self.assertIn('const textInput = prompt("Clarityに入力", "Text", "")', self.source)
        self.assertIn('run("Clarity", textInput)', self.source)

    def test_text_entry_does_not_duplicate_clarity_core(self):
        for forbidden in ("askChatGPT(", "Clarity Ledger.txt", "Clarity Inbox.txt", "device_setting", "addnewevent"):
            self.assertNotIn(forbidden, self.source)

if __name__ == "__main__":
    unittest.main()
