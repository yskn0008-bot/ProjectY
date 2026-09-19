import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT / "clarity-formal-v2.cherri"
CHILD = ROOT / "clarity-actions-formal-v2.cherri"
CONTRACT = ROOT / "clarity-module-contract-v1.json"
REGISTRY = ROOT / "clarity-capability-registry-v1.json"

APPS = {
    "safari","shortcuts","files","notes","phone","reminders","mail","music",
    "calendar","maps","contacts","health","photos","appstore","facetime",
    "chatgpt","scriptable","youtube","spotify","google_sheets"
}
SETTINGS = {
    "wifi","bluetooth","low_power_mode","brightness","volume",
    "appearance","flashlight","do_not_disturb"
}

class FormalV2SourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parent = PARENT.read_text(encoding="utf-8")
        cls.child = CHILD.read_text(encoding="utf-8")
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
        cls.registry = json.loads(REGISTRY.read_text(encoding="utf-8"))

    def test_unique_candidate_names_and_production_unchanged(self):
        self.assertIn("#define name Clarity Formal v2", self.parent)
        self.assertIn('#define name Clarity Actions Formal v2', self.child)
        self.assertIn('run("Clarity Actions Formal v2"', self.parent)

    def test_parent_preserves_raw_first_and_use_model(self):
        self.assertIn('Clarity Inbox.txt', self.parent)
        self.assertIn('askChatGPT(modelPrompt, false, "Dictionary")', self.parent)
        self.assertIn('original_input mismatch', self.parent)
        self.assertIn('needs_review', self.parent)

    def test_parent_allowlists_new_modules_and_blocks_other(self):
        for module in ("OpenApp","DeviceSetting","MyWay"):
            self.assertIn(module, self.parent)
        self.assertIn('@module == "Other"', self.parent)
        self.assertIn('@blocked = true', self.parent)

    def test_display_switch_actions_are_last(self):
        self.assertIn("@seenDisplaySwitch", self.parent)
        self.assertIn('@module != "OpenApp" && @module != "MyWay"', self.parent)

    def test_exact_app_allowlist(self):
        contract_apps = set(self.contract["formal_v2"]["new_modules"]["OpenApp"]["allowlist"])
        self.assertEqual(contract_apps, APPS)
        for app in APPS:
            self.assertIn(f'@target == "{app}"', self.child)
        self.assertIn("UNSUPPORTED_APP", self.child)

    def test_device_setting_scope_is_reversible_and_bounded(self):
        supported = set(self.contract["formal_v2"]["new_modules"]["DeviceSetting"]["supported"])
        self.assertEqual(supported, SETTINGS)
        self.assertEqual(set(self.contract["formal_v2"]["new_modules"]["DeviceSetting"]["unsupported_direct"]),
                         {"cellular_data","airplane_mode"})
        self.assertNotIn('setCellularData(', self.child)
        self.assertNotIn('setAirplaneMode(', self.child)
        for setting in SETTINGS:
            self.assertIn(setting, self.child)
        self.assertIn("UNSUPPORTED_DEVICE_SETTING", self.child)
        self.assertIn("brightness_out_of_range", self.child)
        self.assertIn("volume_out_of_range", self.child)

    def test_myway_reuses_existing_home(self):
        url = self.contract["formal_v2"]["new_modules"]["MyWay"]["url"]
        self.assertEqual(url, "https://yskn0008-bot.github.io/ProjectY/yos/")
        self.assertIn(url, self.child)
        self.assertEqual(self.contract["formal_v2"]["new_modules"]["MyWay"]["write_path"],
                         "pending_not_added")

    def test_registry_does_not_claim_physical_completion(self):
        by_id = {item["id"]: item for item in self.registry["capabilities"]}
        for cid in ("apps.open","device.brightness.set","device.volume.set","myway.home.open"):
            self.assertEqual(by_id[cid]["status"], "needs_device_verification")
        self.assertEqual(by_id["myway.input.route"]["status"], "pending_module")

if __name__ == "__main__":
    unittest.main()
