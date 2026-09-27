from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "Clarity Next.cherri"

class ClarityNextSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_is_separate_from_canonical_clarity(self):
        self.assertIn("#define name Clarity Next", self.source)
        self.assertIn("Clarity Next Ledger.txt", self.source)

    def test_voice_to_json_router(self):
        self.assertIn('listen("After Pause", "jp-JP")', self.source)
        self.assertIn('askChatGPT(routerPrompt, false, "Dictionary")', self.source)
        self.assertIn('getValue(parsed, "actions")', self.source)
        self.assertIn('status != "planned"', self.source)

    def test_capability_gate_is_explicit(self):
        for executor in ("YOS_OpenApp", "NEXT_DEVICE", "NEXT_TIMER", "NEXT_CALENDAR", "NEXT_REMINDER", "NEXT_NAVIGATE", "NEXT_ANSWER"):
            self.assertIn(executor, self.source)
        self.assertIn("unsupported_executor", self.source)

    def test_safety_gates_precede_execution(self):
        review = self.source.index('if needsReviewText == "はい"')
        confirm = self.source.index('if needsConfirmationText == "はい"')
        open_app = self.source.index('if executor == "YOS_OpenApp"')
        self.assertLess(review, open_app)
        self.assertLess(confirm, open_app)

    def test_v0_acceptance_routes_exist(self):
        self.assertIn('run("YOS_OpenApp", app)', self.source)
        self.assertIn('is.workflow.actions.setbrightness', self.source)
        self.assertIn('startTimer(qty(minutes, "min"))', self.source)
        self.assertIn('is.workflow.actions.addnewevent', self.source)
        self.assertIn('is.workflow.actions.addnewreminder', self.source)

if __name__ == "__main__":
    unittest.main()
