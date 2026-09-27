from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Clarity Next.cherri"
PATCH = ROOT / "patch_ledger_persistence.py"

class ClarityNextSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_is_separate_from_canonical_clarity(self):
        self.assertIn("#define name Clarity Next", self.source)
        self.assertIn("Clarity Next Ledger.txt", self.source)


    def test_ledger_source_does_not_eagerly_open_file(self):
        self.assertNotIn('getFile("Clarity Next Ledger.txt")', self.source)
        self.assertIn('appendToFile("Clarity Next Ledger.txt"', self.source)

    def test_post_compile_persistence_rewrite_is_locked(self):
        patch = PATCH.read_text(encoding="utf-8")
        self.assertIn('TARGET = "Clarity Next Ledger.txt"', patch)
        self.assertIn('"WFFileErrorIfNotFound": False', patch)
        self.assertIn('"WFAskWhereToSave": False', patch)
        self.assertIn('"WFSaveFileOverwrite": True', patch)
        self.assertIn('file.append survived rewrite', patch)

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
