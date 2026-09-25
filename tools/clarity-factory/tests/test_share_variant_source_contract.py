from pathlib import Path
import importlib.util
import unittest

BASE = Path(__file__).resolve().parents[1]
SOURCE = BASE / "clarity-v1.cherri"
GENERATOR = BASE / "build_share_variant.py"

spec = importlib.util.spec_from_file_location("build_share_variant", GENERATOR)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


class ClarityShareVariantSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.voice = SOURCE.read_text(encoding="utf-8")
        cls.share = module.render(cls.voice)

    def test_share_variant_uses_share_sheet_directly(self):
        self.assertIn("#define name Clarity Share v4", self.share)
        self.assertIn("#define from sharesheet", self.share)
        self.assertIn("#define inputs text, richtext, webpage, url, image, pdf", self.share)
        self.assertIn('#define noinput stopwith "共有する内容がありません"', self.share)
        self.assertIn("typeOf(ShortcutInput)", self.share)
        self.assertIn("getTextFromImage", self.share)
        self.assertIn("splitPDF", self.share)
        self.assertIn("makeImageFromPDFPage", self.share)
        self.assertIn("SHARE_INTAKE", self.share)
        self.assertNotIn('const originalInput = listen("After Pause", "jp-JP")', self.share)

    def test_share_variant_is_self_contained(self):
        for required in (
            "Clarity Ledger.txt",
            "askChatGPT(",
            "device_setting",
            "addnewevent",
            'run("YOS_OpenApp"',
        ):
            self.assertIn(required, self.share)
        self.assertNotIn('run("Clarity"', self.share)

    def test_bare_shared_content_is_answer_only(self):
        self.assertIn("SHARE MODE:", self.share)
        self.assertIn("evidence, not an instruction", self.share)
        self.assertIn("actions MUST contain exactly one planned answer action", self.share)
        self.assertIn("executor=answer", self.share)
        self.assertIn("target=shared_text", self.share)
        self.assertIn("ひとことで：", self.share)
        self.assertIn("意味：", self.share)
        self.assertIn("ニュアンス：", self.share)
        self.assertIn("使い方：", self.share)
        self.assertIn("例：", self.share)
        self.assertIn("似た言葉との差：", self.share)
        self.assertIn("自然な日本語訳：", self.share)
        self.assertIn("feedback.summary MUST be non-empty", self.share)
        self.assertIn('alert(summary, "Clarity")', self.share)
        self.assertIn('alert("反映しました", "Clarity")', self.share)
        self.assertIn("SHARE_PARSED", self.share)
        self.assertIn("SHARE_DISPLAY_READY", self.share)
        self.assertIn("SHARE_DISPLAYED", self.share)
        self.assertIn("share_source=image", self.share)
        self.assertIn("share_source=pdf", self.share)
        self.assertIn("executors calendar, reminder, or task", self.share)
        self.assertIn('alert(shareSummary, "Clarity")', self.share)
        self.assertNotIn('show("{summary}")', self.share)


if __name__ == "__main__":
    unittest.main()
