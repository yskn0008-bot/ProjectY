from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "YOS_Floor_Lamp.cherri").read_text(encoding="utf-8")
PATCH = (ROOT / "patch_floor_lamp_import_questions.py").read_text(encoding="utf-8")

class FloorLampContractTests(unittest.TestCase):
    def test_tapo_intents_match_physical_reference(self):
        self.assertIn("com.tplink.tapo.TapoDeviceToggleIntent", SOURCE)
        self.assertIn("com.tplink.tapo.TapoBulbColorSetIntent", SOURCE)
        self.assertIn('"state": "on"', SOURCE)
        self.assertIn('"state": "off"', SOURCE)
        self.assertIn('"brightness": "' + "$" + '{brightness}"', SOURCE)
        self.assertIn('"color": "temp_warm_white"', SOURCE)

    def test_public_source_has_no_real_device_identifier(self):
        self.assertIn("__SELECT_FLOOR_LAMP__", SOURCE)
        self.assertNotIn('"identifier": "L535E', SOURCE)
        self.assertNotIn('"identifier": "802', SOURCE)

    def test_import_questions_bind_device_entity(self):
        self.assertIn('PARAMETER_KEY = "devices"', PATCH)
        self.assertIn('QUESTION = "操作するTapoのフロアランプを選んでください"', PATCH)
        self.assertIn("expected four Tapo device actions", PATCH)

    def test_floor_lamp_accepts_only_verified_controls(self):
        for action in ("power_on", "power_off", "set_brightness", "set_warm_white"):
            self.assertIn(action, SOURCE)
        self.assertNotIn("set_color_temperature", SOURCE)

if __name__ == "__main__":
    unittest.main()
