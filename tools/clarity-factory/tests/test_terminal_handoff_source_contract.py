from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "clarity-v1.cherri"

class TerminalHandoffSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")

    def test_open_app_uses_fixed_child_after_policy(self):
        run_i=self.source.index('run("YOS_OpenApp", @handoffTarget)')
        policy_i=self.source.index('if executor == "open_app" {')
        self.assertGreater(run_i, policy_i)

    def test_parent_does_not_embed_open_app_actions(self):
        self.assertNotIn('openApp("', self.source)

    def test_child_success_is_verified_before_applied(self):
        run_i=self.source.index('run("YOS_OpenApp", @handoffTarget)')
        verify_i=self.source.index('if "{childResult}" == "YOS_OPEN_APP_OK:{@handoffTarget}"')
        applied_i=self.source.index('APPLIED\\topen_app')
        self.assertLess(run_i, verify_i)
        self.assertLess(verify_i, applied_i)

    def test_myway_remains_terminal(self):
        self.assertIn('openURL("https://yskn0008-bot.github.io/ProjectY/yos/")\n    stop()', self.source)

if __name__ == "__main__":
    unittest.main()
