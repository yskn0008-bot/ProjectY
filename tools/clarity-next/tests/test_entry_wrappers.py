from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
TEXT = ROOT / "Clarity Text.cherri"
SHARE = ROOT / "Clarity Share.cherri"

class ClarityEntryWrapperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = TEXT.read_text(encoding="utf-8")
        cls.share = SHARE.read_text(encoding="utf-8")

    def test_text_is_thin_wrapper_over_clarity_next(self):
        self.assertIn("#define name Clarity Text", self.text)
        self.assertIn("__YOS_CLARITY_TEXT_V1__", self.text)
        self.assertIn('run("Clarity Next", payload)', self.text)
        self.assertNotIn("askChatGPT", self.text)
        self.assertNotIn("listen(", self.text)

    def test_share_is_thin_wrapper_over_clarity_next(self):
        self.assertIn("#define name Clarity Share v4", self.share)
        self.assertIn("#define from sharesheet", self.share)
        self.assertNotIn("#define inputs ", self.share)
        self.assertIn('typeOf(ShortcutInput)', self.share)
        self.assertIn('const sharedText = getText(ShortcutInput)', self.share)
        self.assertIn("getTextFromImage", self.share)
        self.assertIn("splitPDF", self.share)
        self.assertIn("__YOS_CLARITY_SHARE_TEXT_V1__", self.share)
        self.assertIn("__YOS_CLARITY_SHARE_IMAGE_V1__", self.share)
        self.assertIn("__YOS_CLARITY_SHARE_PDF_V1__", self.share)
        self.assertIn('run("Clarity Next", payload)', self.share)
        self.assertNotIn("askChatGPT", self.share)
        self.assertNotIn("listen(", self.share)

if __name__ == "__main__":
    unittest.main()
