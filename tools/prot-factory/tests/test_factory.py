import importlib.util
import json
import pathlib
import unittest

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / "factory.py"
spec = importlib.util.spec_from_file_location("prot_factory", MODULE_PATH)
factory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(factory)

BASE_SHA = "88cdf65f14dbc89f93fdd0493209659f9458957c"


def make_job(**overrides):
    job = {
        "job_id": "synthetic-001",
        "idea": "ホーム画面から今日の状態をすぐ見たい",
        "desired_state": "1タップ以内で試せる",
        "known_assets": ["MY WAY", "Scriptable"],
        "risk": "low",
        "lane": "unknown",
        "base_sha": BASE_SHA,
        "status": "intake",
        "recovery_count": 0,
        "max_recovery": 2,
        "recovery_fingerprints": [],
        "prototype_type": "web",
    }
    job.update(overrides)
    return job


class FactoryContractTests(unittest.TestCase):
    def test_low_risk_web_reaches_trial_ready(self):
        out = factory.run_dry(make_job())
        self.assertEqual(out["status"], "trial_ready")
        self.assertEqual(out["lane"], "web")
        self.assertEqual(out["outcome"], "trial_ready")

    def test_shortcut_lane(self):
        out = factory.run_dry(make_job(prototype_type="shortcut"))
        self.assertEqual(out["lane"], "shortcut")
        self.assertEqual(out["status"], "trial_ready")

    def test_reuse_beats_new_build(self):
        out = factory.run_dry(make_job(reuse_available=True, prototype_type="web"))
        self.assertEqual(out["lane"], "reuse")

    def test_high_risk_fails_closed(self):
        out = factory.run_dry(make_job(risk="high"))
        self.assertEqual(out["status"], "needs_yos")
        self.assertEqual(out["outcome"], "blocked")

    def test_unknown_lane_fails_closed(self):
        job = make_job(prototype_type="unknown", lane="unknown")
        out = factory.run_dry(job)
        self.assertEqual(out["status"], "needs_yos")

    def test_invalid_transition_is_rejected(self):
        job = make_job()
        with self.assertRaises(factory.FactoryError):
            factory.transition(job, "done")

    def test_recovery_is_bounded(self):
        job = make_job(status="qa")
        out = factory.recover(job, "TEST_FAILURE", "first evidence")
        self.assertEqual(out["outcome"], "retry_allowed")
        self.assertEqual(out["recovery_count"], 1)

    def test_same_failure_fingerprint_does_not_retry(self):
        job = make_job(status="qa")
        first = factory.recover(job, "TEST_FAILURE", "same evidence")
        job["status"] = "recovering"
        job["recovery_count"] = first["recovery_count"]
        job["recovery_fingerprints"] = first["recovery_fingerprints"]
        second = factory.recover(job, "TEST_FAILURE", "same evidence")
        self.assertEqual(second["outcome"], "no_retry")
        self.assertEqual(second["recovery_count"], 1)

    def test_recovery_budget_exhaustion_needs_yos(self):
        job = make_job(status="qa", recovery_count=2, max_recovery=2)
        out = factory.recover(job, "TEST_FAILURE", "new evidence")
        self.assertEqual(out["status"], "needs_yos")
        self.assertEqual(out["outcome"], "blocked")

    def test_max_recovery_over_two_is_rejected(self):
        with self.assertRaises(factory.FactoryError):
            factory.validate_job(make_job(max_recovery=3))

    def test_output_is_json_serializable(self):
        out = factory.run_dry(make_job())
        json.dumps(out)


if __name__ == "__main__":
    unittest.main()
