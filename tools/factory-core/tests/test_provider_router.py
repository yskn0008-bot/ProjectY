import importlib.util
import pathlib
import unittest

MODULE = pathlib.Path(__file__).resolve().parents[1] / "provider_router.py"
spec = importlib.util.spec_from_file_location("provider_router", MODULE)
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)

CONFIG_PATH = pathlib.Path(__file__).resolve().parents[1] / "providers.json"


class ProviderRouterTests(unittest.TestCase):
    def setUp(self):
        self.config = router.load_config(CONFIG_PATH)
        self.health = {"schema_version": "1.0", "providers": {}}

    def test_source_store_is_local_first(self):
        out = router.select_provider(self.config, self.health, "source_store")
        self.assertEqual(out["provider"], "local_store")
        self.assertFalse(out["external"])

    def test_qa_does_not_require_github(self):
        out = router.select_provider(self.config, self.health, "qa_runner")
        self.assertEqual(out["provider"], "local_runner")

    def test_distribution_does_not_require_pages_or_vercel(self):
        out = router.select_provider(self.config, self.health, "distribution")
        self.assertEqual(out["provider"], "iphone_bundle")

    def test_pages_failure_falls_back_to_vercel_for_public_host(self):
        out = router.record_failure(self.config, self.health, "public_host", "github_pages", "outage", stage="release")
        self.assertTrue(out["ok"])
        self.assertEqual(out["fallback"]["provider"], "vercel")

    def test_failed_provider_is_skipped_even_before_block_threshold(self):
        router.record_failure(self.config, self.health, "qa_runner", "github", "outage")
        out = router.select_provider(self.config, self.health, "qa_runner", {"github"})
        self.assertEqual(out["provider"], "local_runner")

    def test_partial_wait_routes_to_alternative_before_external_wait(self):
        out = router.route_wait(self.config, self.health, "public_host", "github_pages", "rate limit", stage="release")
        self.assertTrue(out["ok"])
        self.assertEqual(out["status"], "alternative_routed")
        self.assertEqual(out["action"], "execute_alternative")
        self.assertEqual(out["selected_provider"], "vercel")
        self.assertFalse(out["external_wait"])

    def test_external_wait_is_used_only_when_no_alternative_exists(self):
        config = {
            "providers": [
                {
                    "id": "only",
                    "roles": ["api_host"],
                    "priority": 0,
                    "external": True,
                    "mode": "host",
                    "enabled": True,
                }
            ]
        }
        out = router.route_wait(config, self.health, "api_host", "only", "rate limit", stage="release")
        self.assertFalse(out["ok"])
        self.assertEqual(out["status"], "external_wait")
        self.assertEqual(out["action"], "park_and_recheck")
        self.assertIsNone(out["selected_provider"])
        self.assertTrue(out["external_wait"])

    def test_cloud_run_is_not_selected_before_quality_gate(self):
        out = router.select_provider(self.config, self.health, "api_host", {"vercel"}, stage="release")
        self.assertFalse(out["ok"])
        cloud_run = next(row for row in self.config["providers"] if row["id"] == "google_cloud_run")
        self.assertFalse(cloud_run["enabled"])

    def test_cloud_run_becomes_immediate_api_alternative_once_explicitly_enabled(self):
        config = {
            **self.config,
            "providers": [dict(row) for row in self.config["providers"]],
        }
        next(row for row in config["providers"] if row["id"] == "google_cloud_run")["enabled"] = True
        out = router.route_wait(config, self.health, "api_host", "vercel", "503 service unavailable", stage="release")
        self.assertTrue(out["ok"])
        self.assertEqual(out["status"], "alternative_routed")
        self.assertEqual(out["selected_provider"], "google_cloud_run")

    def test_no_automatic_cloud_fallback_when_local_degraded(self):
        self.health["providers"]["local_runner"] = {"state": "degraded"}
        out = router.select_provider(self.config, self.health, "qa_runner")
        self.assertEqual(out["provider"], "local_runner")
        self.assertEqual(out["remaining_fallbacks"], [])

    def test_blocked_local_runner_does_not_select_github(self):
        self.health["providers"]["local_runner"] = {"state": "blocked"}
        out = router.select_provider(self.config, self.health, "qa_runner")
        self.assertEqual(out["status"], "deferred_until_release")
        self.assertNotIn("provider", out)
        self.assertFalse(out["ok"])

    def test_all_external_only_roles_are_deferred(self):
        for role in ("source_mirror", "backup", "public_host", "api_host", "artifact_mirror", "change_history_mirror"):
            with self.subTest(role=role):
                out = router.select_provider(self.config, self.health, role)
                self.assertEqual(out["status"], "deferred_until_release")
                self.assertEqual(out["action"], "continue_independent_work")

    def test_local_failure_does_not_route_to_external_wait(self):
        out = router.route_wait(self.config, self.health, "qa_runner", "local_runner", "failure")
        self.assertEqual(out["status"], "deferred_until_release")
        self.assertIsNone(out["selected_provider"])
        self.assertFalse(out["external_wait"])

    def test_release_can_choose_github_after_local_block(self):
        self.health["providers"]["local_runner"] = {"state": "blocked"}
        out = router.select_provider(self.config, self.health, "qa_runner", stage="release")
        self.assertEqual(out["provider"], "github")

    def test_exception_only_named_external_provider(self):
        out = router.select_provider(self.config, self.health, "public_host", stage="exception", exception_provider="vercel", exception_reason="required live test")
        self.assertEqual(out["provider"], "vercel")
        self.assertEqual(out["remaining_fallbacks"], [])

    def test_exception_requires_reason_and_provider(self):
        for opts in ({"stage": "exception"}, {"stage": "exception", "exception_provider": "vercel", "exception_reason": " "}, {"stage": "unknown"}, {"exception_provider": "vercel"}):
            with self.subTest(opts=opts), self.assertRaises(router.ProviderRouterError):
                router.select_provider(self.config, self.health, "public_host", **opts)

    def test_invalid_stage_cannot_mutate_health(self):
        with self.assertRaises(router.ProviderRouterError):
            router.record_failure(self.config, self.health, "public_host", "vercel", "bad", stage="exception")
        self.assertEqual(self.health["providers"], {})

    def test_exception_cannot_enable_disabled_cloud_run(self):
        out = router.select_provider(self.config, self.health, "api_host", stage="exception", exception_provider="google_cloud_run", exception_reason="test")
        self.assertFalse(out["ok"])
        self.assertNotIn("provider", out)

    def test_exception_cannot_switch_to_other_external_provider(self):
        out = router.route_wait(self.config, self.health, "public_host", "vercel", "failure", stage="exception", exception_provider="vercel", exception_reason="test")
        self.assertIsNone(out["selected_provider"])
        self.assertTrue(out["external_wait"])

    def test_unknown_role_is_not_success_or_deferral(self):
        out = router.select_provider(self.config, self.health, "unknown")
        self.assertFalse(out["ok"])
        self.assertEqual(out["status"], "needs_route")


if __name__ == "__main__":
    unittest.main()
