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

    def test_boot_happens_before_voice_input(self):
        boot = self.source.index("appendResolvedFile(ledgerFile, bootRecord)")
        listen = self.source.index('listen("After Pause", "jp-JP")')
        self.assertLess(boot, listen)

    def test_model_decision_trace_is_before_needs_review_block(self):
        trace = self.source.index("MODEL_DECISION")
        gate = self.source.index("if needsReview {")
        self.assertLess(trace, gate)
        for field in (
            "executor={executor}",
            "date_time={dateTime}",
            "end_date_time={endDateTime}",
            "needs_review={needsReview}",
            "original_input={originalInput}",
        ):
            self.assertIn(field, self.source)


if __name__ == "__main__":
    unittest.main()
