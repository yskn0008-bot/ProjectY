from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
HOME = ROOT / "YOS_Home.cherri"
BRIDGE = ROOT / "YOS Home Bridge.js"
PATCH = ROOT / "patch_home_inline.py"

class UnifiedHomeRouterContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = HOME.read_text(encoding="utf-8")
        cls.bridge = BRIDGE.read_text(encoding="utf-8")
        cls.patch = PATCH.read_text(encoding="utf-8")

    def test_home_child_is_single_hub_agnostic_entry(self):
        self.assertIn("#define name YOS_Home", self.home)
        self.assertIn('if @incoming beginsWith "floor_lamp|"', self.home)
        self.assertIn('run("YOS_Floor_Lamp", floorPayload)', self.home)
        self.assertIn("YOS Home Bridge", self.bridge)

    def test_existing_adapters_are_reused(self):
        self.assertIn("YOS Tapo H110 Core", self.bridge)
        self.assertIn("yos.bravia.scriptable.host", self.bridge)
        self.assertIn("performAC", self.bridge)
        self.assertIn("performLight", self.bridge)
        self.assertIn("performTV", self.bridge)

    def test_bridge_accepts_only_canonical_commands(self):
        self.assertIn("device|action|value", self.bridge)
        self.assertIn("new Set(['tv','ac','ceiling_light'])", self.bridge)
        self.assertIn("parseHomePayload", self.bridge)
        self.assertNotIn("parseHomeCommand", self.bridge)
        self.assertNotIn("暗い|明るい", self.bridge)

    def test_floor_lamp_is_not_misrouted_to_ir(self):
        self.assertNotIn("'floor_lamp'", self.bridge.split("const DEVICES",1)[1].split(";",1)[0])
        self.assertIn("Tapo AppIntent child", self.home)

    def test_inline_patch_is_fail_closed(self):
        self.assertIn('expected exactly one Scriptable inline action', self.patch)
        self.assertIn('home inline placeholder missing before patch', self.patch)
        self.assertIn('YOS Home Bridge', self.patch)

if __name__ == "__main__":
    unittest.main()
