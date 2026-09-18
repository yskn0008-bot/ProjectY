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


if __name__ == "__main__":
    unittest.main()
