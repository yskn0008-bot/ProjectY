from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "YOS Home Bridge.js"
CHILD = ROOT / "YOS_Home.cherri"
PATCH = ROOT / "patch_home_inline.py"

class HomeBridgeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bridge = BRIDGE.read_text(encoding="utf-8")
        cls.child = CHILD.read_text(encoding="utf-8")
        cls.patch = PATCH.read_text(encoding="utf-8")

    def test_child_uses_scriptable_inline_without_app_handoff(self):
        self.assertIn("dk.simonbs.Scriptable.RunScriptInlineIntent", self.child)
        self.assertIn('"runInApp": false', self.child)
        self.assertIn('"ShowWhenRun": false', self.child)
        self.assertIn("__YOS_HOME_INLINE__", self.child)

    def test_bridge_reuses_existing_remote_boundaries(self):
        self.assertIn("yos.bravia.scriptable.host", self.bridge)
        self.assertIn("yos.bravia.scriptable.psk", self.bridge)
        self.assertIn("リモコン/内部/Tapo共通", self.bridge)
        self.assertIn("YOS Tapo H110 Core", self.bridge)
        self.assertNotRegex(self.bridge, r"192\\.168\\.\\d+\\.\\d+")
        self.assertNotIn("BEGIN " + "PRIVATE KEY", self.bridge)

    def test_explicit_commands_are_supported(self):
        for marker in (
            "power_on","power_off","volume_up","volume_down","mute",
            "set_temperature","temperature_up","temperature_down",
            "brightness_up","brightness_down",
        ):
            self.assertIn(marker, self.bridge)
        self.assertIn("(1[89]|2\\d|30)", self.bridge)

    def test_ambiguous_commands_fail_closed(self):
        self.assertIn("全部.*消", self.bridge)
        self.assertIn("家電操作が曖昧なので実行しませんでした", self.bridge)
        self.assertIn("throw new Error", self.bridge)

    def test_percentage_brightness_uses_existing_calibration(self):
        self.assertIn("brightness_percent", self.bridge)
        self.assertIn("LIGHT_BRIGHTNESS_STEPS = 20", self.bridge)
        self.assertIn("fireBurst", self.bridge)
        self.assertIn("pct === 0", self.bridge)

    def test_scriptable_receives_shortcut_input_without_manual_parameter_edit(self):
        self.assertIn('"parameter"', self.patch)
        self.assertIn('"WFTextTokenAttachment"', self.patch)
        self.assertIn('"Type": "ExtensionInput"', self.patch)

    def test_patch_injects_reviewed_bridge(self):
        self.assertIn("WFTextTokenString", self.patch)
        self.assertIn("YOS Home Bridge", self.patch)
        self.assertIn("runInApp", self.patch)

if __name__ == "__main__":
    unittest.main()
