import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT / "clarity-final-v11.cherri"
CHILD = ROOT / "clarity-actions-v11a.cherri"


class V11DeferredHandoffTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parent = PARENT.read_text(encoding="utf-8")
        cls.child = CHILD.read_text(encoding="utf-8")

    def test_child_never_switches_foreground(self):
        self.assertNotIn('openApp(', self.child)
        self.assertNotIn('openURL(', self.child)
        self.assertIn('HANDOFF_READY', self.child)
        self.assertNotIn('APPLIED\\tOpenApp', self.child)
        self.assertNotIn('APPLIED\\tMyWay', self.child)

    def test_exactly_one_handoff_is_allowed(self):
        self.assertIn('MULTIPLE_UI_HANDOFFS', self.child)
        self.assertIn('@displaySwitchCount > 1', self.parent)

    def test_parent_performs_handoff_after_child_verification(self):
        verify = self.parent.index('if @childStatus != "success" || !@childVerified')
        myway = self.parent.index('if @handoffType == "myway"')
        app = self.parent.index('if @handoffType == "app"')
        self.assertLess(verify, myway)
        self.assertLess(verify, app)

    def test_result_display_only_when_no_handoff(self):
        self.assertIn('if @handoffType == ""', self.parent)
        self.assertNotIn('OpenApp: {@openApp}', self.parent)
        self.assertNotIn('MyWay: {@myWay}', self.parent)


if __name__ == "__main__":
    unittest.main()
