from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"


class ArtifactIdentitySourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_build_id_placeholder_exists_once(self):
        self.assertEqual(self.source.count("__CLARITY_BUILD_ID__"), 1)
        self.assertIn('const buildId = text("__CLARITY_BUILD_ID__")', self.source)

    def test_boot_ledger_record_binds_build_and_request(self):
        self.assertIn(
            'const bootRecord = text("{CurrentDate}\\tBOOT\\t{buildId}\\t{requestNumber}\\n")',
            self.source,
        )
        self.assertIn("appendResolvedFile(ledgerFile, bootRecord)", self.source)

    def test_boot_happens_after_raw_first_and_before_model(self):
        raw = self.source.index("appendResolvedFile(inboxFile, rawRecord)")
        boot = self.source.index("appendResolvedFile(ledgerFile, bootRecord)")
        model = self.source.index("askChatGPT(modelPrompt")
        self.assertLess(raw, boot)
        self.assertLess(boot, model)

    def test_model_decision_trace_is_before_needs_review_block(self):
        trace = self.source.index("MODEL_DECISION")
        gate = self.source.index('if needsReviewText == "はい" {')
        self.assertLess(trace, gate)
        for field in (
            "executor={executor}",
            "date_time={dateTime}",
            "end_date_time={endDateTime}",
            "needs_review={needsReview}",
            "original_input={@originalInput}",
        ):
            self.assertIn(field, self.source)


    def test_model_boolean_source_uses_text_normalization(self):
        self.assertIn('const needsReviewText = text("{needsReview}")', self.source)
        self.assertIn('const requiresConfirmationText = text("{requiresConfirmation}")', self.source)
        self.assertIn('const externalWriteText = text("{externalWrite}")', self.source)
        self.assertIn('if needsReviewText == "はい" {', self.source)
        self.assertIn(
            'if externalWriteText == "はい" && requiresConfirmationText == "いいえ" {',
            self.source,
        )
        self.assertIn('if requiresConfirmationText == "はい" {', self.source)
        self.assertNotIn("if needsReview {", self.source)
        self.assertNotIn("if requiresConfirmation {", self.source)


if __name__ == "__main__":
    unittest.main()
