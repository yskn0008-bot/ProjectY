from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class EmptyActionFallbackSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_safari_fast_path_runs_before_model_call(self):
        fast = self.source.index("FAST_ROUTE\\\\topen_app\\\\tsafari")
        model = self.source.index("const modelResult = askChatGPT")
        self.assertLess(fast, model)
        fast_block = self.source[:model]
        self.assertIn('const fastSafariTarget = text("safari")', fast_block)
        self.assertIn('run("YOS_OpenApp", fastSafariTarget)', fast_block)
        self.assertIn('child_returned\\\\tfast_path', fast_block)

    def test_fallback_runs_before_no_actions_block(self):
        fallback = self.source.index("// Fail-safe only for high-confidence local display requests.")
        blocked = self.source.index('BLOCKED\\tno_actions')
        self.assertLess(fallback, blocked)

    def test_fallback_only_runs_when_model_has_no_actions(self):
        self.assertIn('if !@actionsRaw {', self.source)

    def test_myway_fallback_requires_open_phrase(self):
        block = self.source.split("// Fail-safe only for high-confidence local display requests.", 1)[1]
        self.assertIn('if @originalInput contains "開いて" {', block)
        self.assertIn('@originalInput contains "MY WAY"', block)
        self.assertIn('@handoffExecutor = "myway"', block)

    def test_chatgpt_fallback_requires_open_phrase(self):
        block = self.source.split("// Fail-safe only for high-confidence local display requests.", 1)[1]
        self.assertIn('@originalInput contains "ChatGPT"', block)
        self.assertIn('@handoffTarget = "chatgpt"', block)

    def test_safari_fallback_requires_open_phrase(self):
        block = self.source.split("// Fail-safe only for high-confidence local display requests.", 1)[1]
        self.assertIn('@originalInput contains "Safari"', block)
        self.assertIn('@handoffTarget = "safari"', block)

    def test_empty_actions_are_blocked_only_without_fallback(self):
        self.assertIn('if !@actionsRaw && !@handoffExecutor {', self.source)

if __name__ == "__main__":
    unittest.main()
