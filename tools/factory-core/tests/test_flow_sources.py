import importlib.util
import sys
import tempfile
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
    def setUp(self):
        self.manifest = module.load_manifest()

    def test_manifest_has_exact_four_existing_flow_names(self):
        self.assertEqual(
            list(self.manifest["flows"].keys()),
            ["Morning Flow", "Home Flow", "Work Flow", "Out Flow"],
        )
        policy = self.manifest["policy"]
        self.assertTrue(policy["do_not_rebuild_morning_flow"])
        self.assertTrue(policy["do_not_infer_flow_actions_from_names"])
        self.assertTrue(policy["main_direct_changes_forbidden"])

    def test_all_four_current_flows_are_recovered(self):
        results = module.validate_all()
        self.assertEqual(len(results), 4)
        self.assertTrue(all(r["status"] == "recovered_current_artifact" for r in results))

    def test_current_morning_is_triggerless_and_preserves_full_action_sequence(self):
        result = module.validate_flow(
            "Morning Flow", self.manifest["flows"]["Morning Flow"]
        )
        self.assertEqual(result["action_count"], 45)
        self.assertEqual(result["triggers"], [])
        self.assertEqual(
            result["signed_sha256"],
            "b68edca63d2476a1ca3660bbbb342c843a294be4b496c2cb8aaed91ec88c20f2",
        )
        self.assertEqual(result["aea"]["profile"], 0)
        self.assertEqual(result["aea"]["archive_size"], 26278)

    def test_home_work_out_are_exact_recovered_safe_noops(self):
        expected = {
            "Home Flow": ("Home", "com.apple.donotdisturb.mode.bookmarkfill"),
            "Work Flow": ("Work", "com.apple.donotdisturb.mode.mappin"),
            "Out Flow": ("Out", "com.apple.donotdisturb.mode.booksverticalfill"),
        }
        for name, (focus_name, identifier) in expected.items():
            result = module.validate_flow(name, self.manifest["flows"][name])
            self.assertEqual(result["action_count"], 0)
            self.assertEqual(len(result["triggers"]), 1)
            self.assertEqual(result["triggers"][0]["event"], "enable")
            self.assertEqual(result["triggers"][0]["focus_name"], focus_name)
            self.assertEqual(result["triggers"][0]["focus_identifier"], identifier)


    def test_home_out_appliance_automation_is_owned_by_tapo(self):
        policy = self.manifest["policy"]
        self.assertIn("Tapo H110", policy["appliance_automation_rule"])
        home = self.manifest["flows"]["Home Flow"]["runtime_contract"]["external_automation"]
        out = self.manifest["flows"]["Out Flow"]["runtime_contract"]["external_automation"]
        self.assertEqual(home["owner"], "Tapo H110 Smart Actions / Geofencing")
        self.assertEqual(home["selected_actions"], ["Light ON"])
        self.assertEqual(out["owner"], "Tapo H110 Smart Actions / Geofencing")
        self.assertEqual(out["selected_actions"], ["Light OFF", "Air conditioner OFF"])
        self.assertTrue(any("power toggle" in item for item in out["conditional_actions"]))

    def test_older_supplied_morning_variant_is_noncanonical_duplicate_risk(self):
        variants = self.manifest["supplied_variants"]
        self.assertEqual(len(variants), 1)
        result = module.validate_variant(variants[0])
        self.assertFalse(result["canonical"])
        self.assertEqual(result["name"], "Morning Flow")
        self.assertEqual(result["action_count"], 26)
        self.assertEqual(variants[0]["embedded_trigger"]["focus_name"], "Morning")

    def test_runtime_contract_does_not_invent_child_shortcuts(self):
        for entry in self.manifest["flows"].values():
            self.assertEqual(entry["runtime_contract"]["calls_existing_yos_assets"], [])

    def test_factory_packages_exact_existing_signed_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            written = module.package_artifacts(output)
            self.assertEqual({p.name for p in written}, {
                "Morning Flow.shortcut",
                "Home Flow.shortcut",
                "Work Flow.shortcut",
                "Out Flow.shortcut",
            })
            for name, entry in self.manifest["flows"].items():
                data = (output / f"{name}.shortcut").read_bytes()
                self.assertEqual(module.sha256(data), entry["signed_sha256"])
                self.assertEqual(len(data), entry["signed_size"])
            self.assertTrue((output / "manifest.json").is_file())


if __name__ == "__main__":
    unittest.main()
