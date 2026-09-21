# Final evidence refresh: terminal-handoff behavior unchanged; refresh current PR evidence.
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class TerminalHandoffSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_handoff_is_staged_before_terminal_open(self):
        request_done = self.source.index("const requestDone")
        terminal = self.source.index("// Terminal handoff: nothing may run after the destination is opened.")
        self.assertGreater(terminal, request_done)

    def test_no_destination_open_before_request_done(self):
        request_done = self.source.index("const requestDone")
        prefix = self.source[:request_done]
        self.assertNotIn('openApp("', prefix)
        self.assertNotIn('openURL("https://yskn0008-bot.github.io/ProjectY/yos/")', prefix)

    def test_open_app_and_myway_are_terminal(self):
        terminal = self.source.index("// Terminal handoff: nothing may run after the destination is opened.")
        suffix = self.source[terminal:]
        self.assertIn('if @handoffExecutor == "open_app" {', suffix)
        self.assertIn('if @handoffTarget == "chatgpt" { openApp("com.openai.chat") }', suffix)
        self.assertIn('if @handoffExecutor == "myway" {', suffix)
        self.assertTrue(suffix.rstrip().endswith('}'))

    def test_summary_is_suppressed_for_any_handoff(self):
        self.assertIn('if summary && !@handoffExecutor {', self.source)

    def test_terminal_handoffs_stop_immediately(self):
        terminal = self.source.split("// Terminal handoff: nothing may run after the destination is opened.", 1)[1]
        self.assertEqual(terminal.count("openApp("), terminal.count("; stop() }"))
        self.assertIn('openURL("https://yskn0008-bot.github.io/ProjectY/yos/")\n    stop()', terminal)

if __name__ == "__main__":
    unittest.main()
