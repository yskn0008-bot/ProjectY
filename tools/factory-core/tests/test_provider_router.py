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
        out = router.record_failure(self.config, self.health, "public_host", "github_pages", "outage")
        self.assertTrue(out["ok"])
        self.assertEqual(out["fallback"]["provider"], "vercel")

    def test_failed_provider_is_skipped_even_before_block_threshold(self):
        router.record_failure(self.config, self.health, "qa_runner", "github", "outage")
        out = router.select_provider(self.config, self.health, "qa_runner", {"github"})
        self.assertEqual(out["provider"], "local_runner")

    def test_partial_wait_routes_to_alternative_before_external_wait(self):
        out = router.route_wait(self.config, self.health, "public_host", "github_pages", "rate limit")
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
        out = router.route_wait(config, self.health, "api_host", "only", "rate limit")
        self.assertFalse(out["ok"])
        self.assertEqual(out["status"], "external_wait")
        self.assertEqual(out["action"], "park_and_recheck")
        self.assertIsNone(out["selected_provider"])
        self.assertTrue(out["external_wait"])

    def test_cloud_run_is_not_selected_before_quality_gate(self):
        out = router.select_provider(self.config, self.health, "api_host", {"vercel"})
        self.assertFalse(out["ok"])
        cloud_run = next(row for row in self.config["providers"] if row["id"] == "google_cloud_run")
        self.assertFalse(cloud_run["enabled"])

    def test_cloud_run_becomes_immediate_api_alternative_once_explicitly_enabled(self):
        config = {
            **self.config,
            "providers": [dict(row) for row in self.config["providers"]],
        }
        next(row for row in config["providers"] if row["id"] == "google_cloud_run")["enabled"] = True
        out = router.route_wait(config, self.health, "api_host", "vercel", "503 service unavailable")
        self.assertTrue(out["ok"])
        self.assertEqual(out["status"], "alternative_routed")
        self.assertEqual(out["selected_provider"], "google_cloud_run")


if __name__ == "__main__":
    unittest.main()
