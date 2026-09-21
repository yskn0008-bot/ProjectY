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

    def test_open_app_is_ready_then_verified(self):
        self.assertIn('HANDOFF_READY\\topen_app', self.source)
        self.assertIn('APPLIED\\topen_app', self.source)
        self.assertIn('FAILED\\topen_app_child_verify', self.source)

    def test_summary_is_suppressed_for_handoff(self):
        self.assertIn('if !@handoffExecutor {', self.source)
        self.assertIn('if summary {', self.source)

if __name__ == "__main__":
    unittest.main()
