from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class HandoffSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_tracks_handoff_state(self):
        self.assertIn('@handoffExecutor = ""', self.source)
        self.assertIn('@handoffTarget = ""', self.source)

    def test_open_handoffs_are_not_claimed_applied(self):
        self.assertIn('HANDOFF_READY\\topen_app', self.source)
        self.assertIn('HANDOFF_READY\\tmyway', self.source)
        self.assertNotIn('APPLIED\\topen_app', self.source)
        self.assertNotIn('APPLIED\\tmyway', self.source)

    def test_result_screen_does_not_override_any_handoff(self):
        self.assertIn('if summary && !@handoffExecutor {', self.source)

if __name__ == "__main__":
    unittest.main()
