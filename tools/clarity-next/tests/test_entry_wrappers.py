from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
TEXT = ROOT / "Clarity Text.cherri"
SHARE = ROOT / "Clarity Share.cherri"
SHARE_PATCH = ROOT / "patch_share_inbox_inline.py"


class ClarityEntryWrapperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = TEXT.read_text(encoding="utf-8")
        cls.share = SHARE.read_text(encoding="utf-8")
        cls.share_patch = SHARE_PATCH.read_text(encoding="utf-8")

    def test_text_is_thin_wrapper_over_clarity_next(self):
        self.assertIn("#define name Clarity Text", self.text)
        self.assertIn("__YOS_CLARITY_TEXT_V1__", self.text)
        self.assertIn('run("Clarity Next", payload)', self.text)
        self.assertNotIn("askChatGPT", self.text)
        self.assertNotIn("listen(", self.text)

    def test_share_extracts_existing_supported_inputs(self):
        self.assertIn("#define name Clarity Share v4", self.share)
        self.assertIn("#define from sharesheet", self.share)
        self.assertIn("#define inputs text, richtext, webpage, url, image, pdf", self.share)
        self.assertIn("getTextFromImage", self.share)
        self.assertIn("splitPDF", self.share)
        self.assertIn('shareSource = "text"', self.share)
        self.assertIn('shareSource = "image"', self.share)
        self.assertIn('shareSource = "pdf"', self.share)
        self.assertIn("文字情報を読み取れませんでした", self.share)

    def test_share_saves_directly_without_voice_or_clarity_next(self):
        self.assertIn("saveToYOSInbox", self.share)
        self.assertIn("__YOS_SHARE_INBOX_INLINE__", self.share)
        self.assertNotIn('run("Clarity Next"', self.share)
        self.assertNotIn("askChatGPT", self.share)
        self.assertNotIn("listen(", self.share)
        self.assertNotIn("__YOS_CLARITY_SHARE_TEXT_V1__", self.share)
        self.assertNotIn("__YOS_CLARITY_SHARE_IMAGE_V1__", self.share)
        self.assertNotIn("__YOS_CLARITY_SHARE_PDF_V1__", self.share)

    def test_share_runtime_reuses_existing_yos_inbox_and_keychain_secret(self):
        self.assertIn("YOS_NOTION_INTEGRATION_TOKEN", self.share_patch)
        self.assertIn("3d35ca88-2895-81ef-9dc8-d5f11ff8e213", self.share_patch)
        self.assertIn("https://api.notion.com/v1", self.share_patch)
        self.assertIn("yos-clarity-notion-bridge.json", self.share_patch)
        self.assertNotIn("project-y-yos-ai.vercel.app", self.share_patch)
        self.assertNotIn("api.openai.com", self.share_patch)
        self.assertNotIn("money-capture.html", self.share_patch)

    def test_share_runtime_is_idempotent_and_fail_closed(self):
        self.assertIn("fingerprint(source+'\\n'+normalized)", self.share_patch)
        self.assertIn("dedupeKey='share:'+fp", self.share_patch)
        self.assertIn("DUPLICATE:", self.share_patch)
        self.assertIn("state[dedupeKey]", self.share_patch)
        self.assertIn("await notion('/blocks/'+INBOX+'/children'", self.share_patch)
        self.assertIn("fm.writeString(statePath", self.share_patch)
        self.assertLess(
            self.share_patch.index("await notion('/blocks/'+INBOX+'/children'"),
            self.share_patch.index("state[dedupeKey]="),
        )
        self.assertIn("ERROR:NOTION_TOKEN_MISSING", self.share_patch)
        self.assertIn("Script.setShortcutOutput(result)", self.share_patch)

    def test_share_reports_success_duplicate_and_failure_separately(self):
        self.assertIn('beginsWith "OK_TRUNCATED:"', self.share)
        self.assertIn('beginsWith "OK:"', self.share)
        self.assertIn('beginsWith "DUPLICATE:"', self.share)
        self.assertIn("YOS Inboxに保存しました", self.share)
        self.assertIn("すでにYOS Inboxへ保存済みです", self.share)
        self.assertIn("YOS Inboxへ保存できませんでした", self.share)

    def test_share_image_pdf_contract_is_text_extraction_only(self):
        self.assertIn("getTextFromImage", self.share)
        self.assertIn("embeddedPdfText", self.share)
        self.assertIn("MAX_CHARS=48000", self.share_patch)
        self.assertIn("48,000文字を超えたため末尾を省略", self.share_patch)


if __name__ == "__main__":
    unittest.main()
