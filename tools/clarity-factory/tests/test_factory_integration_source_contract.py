from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"
PATCH = Path(__file__).resolve().parents[1] / "patch_server_model_gateway.py"

class FactoryIntegrationSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")
        cls.patch = PATCH.read_text(encoding="utf-8")

    def test_newer_no_actions_fallback_is_preserved(self):
        self.assertIn('// Fail-safe only for high-confidence local display requests.', self.source)
        self.assertIn('if !@actionsRaw && !@handoffExecutor {', self.source)

    def test_factory_is_safari_only_and_fail_closed(self):
        self.assertIn('if target != "safari" {', self.source)
        self.assertIn('unsupported_shortcut_factory_target', self.source)
        self.assertIn('set target=safari', self.source)

    def test_terminal_app_handoff_stop_is_preserved(self):
        self.assertIn('openApp("com.openai.chat")\n        stop()', self.source)
        self.assertIn('openURL("https://yskn0008-bot.github.io/ProjectY/yos/")\n    stop()', self.source)

    def test_factory_request_marker_remains_for_post_compile_patch(self):
        self.assertIn('const shortcutFactoryRequest = text("{@handoffFactoryRequest}")', self.source)

    def test_local_fallback_uses_hubsign_not_vercel_factory(self):
        self.assertIn('HUBSIGN_ENDPOINT = "https://hubsign.routinehub.services/sign"', self.patch)
        self.assertNotIn('FACTORY_ENDPOINT =', self.patch)
        self.assertIn('YOS Safari Auto.shortcut', self.patch)
        self.assertIn('com.apple.mobilesafari', self.patch)

if __name__ == "__main__":
    unittest.main()
