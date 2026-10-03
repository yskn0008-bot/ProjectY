import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "tools" / "factory-core" / "recover_flow_artifact.py"
SPEC = importlib.util.spec_from_file_location("recover_flow_artifact", MODULE_PATH)
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


class FlowSourceContractTests(unittest.TestCase):
    def test_manifest_has_exact_four_existing_flow_names(self):
        manifest = module.load_manifest()
        self.assertEqual(
            list(manifest["flows"].keys()),
            ["Morning Flow", "Home Flow", "Work Flow", "Out Flow"],
        )
        self.assertTrue(manifest["policy"]["do_not_rebuild_morning_flow"])
        self.assertTrue(manifest["policy"]["do_not_infer_missing_flows_from_names"])
        self.assertTrue(manifest["policy"]["main_direct_changes_forbidden"])

    def test_recovered_morning_flow_is_byte_identical_and_signed_aea(self):
        manifest = module.load_manifest()
        result = module.validate_flow("Morning Flow", manifest["flows"]["Morning Flow"])
        self.assertEqual(result["sha256"], "c5eea8d5dd144733e14c3d3ca12f5f16f259316c64b7f1039f8eb3559004a9c0")
        self.assertEqual(result["aea"]["magic"], "AEA1")
        self.assertEqual(result["aea"]["profile"], 0)
        self.assertEqual(result["aea"]["archive_size"], 26444)
        self.assertEqual(result["aea"]["original_shortcut_plist_size"], 9971)
        self.assertGreaterEqual(result["aea"]["certificate_count"], 1)

    def test_missing_flows_remain_wait_user_and_are_not_fabricated(self):
        manifest = module.load_manifest()
        for name in ("Home Flow", "Work Flow", "Out Flow"):
            entry = manifest["flows"][name]
            self.assertEqual(entry["status"], "WAIT_USER_RECOVERY")
            self.assertTrue(entry["must_not_infer"])
            result = module.validate_flow(name, entry)
            self.assertEqual(result["status"], "WAIT_USER_RECOVERY")

    def test_morning_runtime_contract_preserves_existing_scope(self):
        manifest = module.load_manifest()
        runtime = manifest["flows"]["Morning Flow"]["runtime_contract"]
        self.assertEqual(runtime["calls_existing_yos_assets"], [])
        self.assertIn("Morning Brief", runtime["parent_siblings"])
        self.assertIn("YOS Today Note", runtime["parent_siblings"])
        self.assertIn("Calendar", " ".join(runtime["actions"]))
        self.assertNotIn("Home Flow", " ".join(runtime["actions"]))
        self.assertNotIn("Work Flow", " ".join(runtime["actions"]))
        self.assertNotIn("Out Flow", " ".join(runtime["actions"]))


if __name__ == "__main__":
    unittest.main()
