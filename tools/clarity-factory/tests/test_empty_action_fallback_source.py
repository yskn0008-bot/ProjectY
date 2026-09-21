from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class EmptyActionFallbackSourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_fallback_runs_before_no_actions_block(self):
        fallback = self.source.index("// Fail-safe only for high-confidence local display requests.")
        blocked = self.source.index('BLOCKED\\tno_actions')
        self.assertLess(fallback, blocked)

    def test_fallback_only_runs_when_model_has_no_actions(self):
        self.assertIn('if !@actionsRaw {', self.source)

    def test_myway_fallback_requires_open_phrase(self):
        block = self.source.split("// Fail-safe only for high-confidence local display requests.", 1)[1]
        self.assertIn('if originalInput contains "開いて" {', block)
        self.assertIn('originalInput contains "MY WAY"', block)
        self.assertIn('@handoffExecutor = "myway"', block)
        self.assertIn('@handoffTarget = "home"', block)

    def test_chatgpt_fallback_requires_open_phrase(self):
        block = self.source.split("// Fail-safe only for high-confidence local display requests.", 1)[1]
        self.assertIn('originalInput contains "ChatGPT"', block)
        self.assertIn('@handoffExecutor = "open_app"', block)
        self.assertIn('@handoffTarget = "chatgpt"', block)

    def test_empty_actions_are_blocked_only_without_fallback(self):
        self.assertIn('if !@actionsRaw && !@handoffExecutor {', self.source)

if __name__ == "__main__":
    unittest.main()
