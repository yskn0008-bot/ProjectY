import json
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from runner import run_reuse  # noqa: E402


class OperationalRunnerTests(unittest.TestCase):
    def base_job(self, base_sha="abc"):
        return {
            "job_id": "real-reuse-proof",
            "idea": "既存Widgetを待ち時間なく試用可能にしたい",
            "desired_state": "既存成果物を作り直さず検証して試用可能へ",
            "known_assets": ["MY WAY NOW Widget"],
            "risk": "low",
            "lane": "unknown",
            "base_sha": base_sha,
            "status": "intake",
            "recovery_count": 0,
            "max_recovery": 2,
            "recovery_fingerprints": [],
            "reuse_available": True,
            "artifact_path": "artifact.js",
        }

    def test_reuse_asset_reaches_trial_ready_without_owner_continue(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "artifact.js").write_text("console.log('ok')\n", encoding="utf-8")
            result = run_reuse(self.base_job(), root)
            self.assertEqual(result["status"], "trial_ready")
            self.assertEqual(result["lane"], "reuse")
            self.assertFalse(result["owner_continue_required"])
            self.assertEqual(result["recovery_count"], 0)
            self.assertTrue(result["artifact_sha256"])

    def test_intentional_first_failure_recovers_and_finishes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "artifact.js").write_text("console.log('ok')\n", encoding="utf-8")
            job = self.base_job()
            job["simulate_first_failure"] = True
            result = run_reuse(job, root)
            self.assertEqual(result["status"], "trial_ready")
            self.assertEqual(result["recovery_count"], 1)
            self.assertTrue(result["recovered_from_intentional_failure"])
            self.assertFalse(result["owner_continue_required"])

    def test_missing_asset_does_not_claim_success(self):
        with tempfile.TemporaryDirectory() as td:
            result = run_reuse(self.base_job(), Path(td))
            self.assertNotEqual(result["status"], "trial_ready")
            self.assertEqual(result["outcome"], "retry_allowed")

    def test_high_risk_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "artifact.js").write_text("x", encoding="utf-8")
            job = self.base_job()
            job["risk"] = "high"
            result = run_reuse(job, root)
            self.assertEqual(result["status"], "needs_yos")

    def test_path_escape_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            job = self.base_job()
            job["artifact_path"] = "../outside.js"
            with self.assertRaises(Exception):
                run_reuse(job, Path(td))


if __name__ == "__main__":
    unittest.main()
