from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class HandoffSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_tracks_last_executor(self):
        self.assertIn('@lastExecutor = ""', self.source)
        self.assertIn('@lastExecutor = "{executor}"', self.source)

    def test_open_handoffs_are_not_claimed_applied(self):
        self.assertIn('HANDOFF_READY\\topen_app', self.source)
        self.assertIn('HANDOFF_READY\\tmyway', self.source)
        self.assertNotIn('APPLIED\\topen_app', self.source)
        self.assertNotIn('APPLIED\\tmyway', self.source)

    def test_result_screen_does_not_override_final_handoff(self):
        self.assertIn(
            'if summary && @lastExecutor != "open_app" && @lastExecutor != "myway" {',
            self.source,
        )

if __name__ == "__main__":
    unittest.main()
