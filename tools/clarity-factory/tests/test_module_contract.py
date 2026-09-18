import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "clarity-module-contract-v1.json"


class ModuleContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    def test_use_model_is_preferred_understand_layer_without_removing_fallback(self):
        understand = self.contract["understand_layer"]
        self.assertEqual(understand["preferred_runtime"], "apple_shortcuts_use_model")
        self.assertEqual(understand["role"], "structure_intents_only")
        self.assertEqual(understand["output_contract"], "action")
        self.assertTrue(understand["supports_multiple_actions"])
        self.assertEqual(understand["fallback"], "existing_clarity_executor_path")
        observed = set(understand["physical_device_evidence"]["observed_domains"])
        self.assertTrue({"calendar", "shopping", "idea"}.issubset(observed))

    def test_action_contract_is_structured_and_planned_only(self):
        action = self.contract["action"]
        self.assertIn("module", action["required"])
        self.assertIn("input", action["required"])
        self.assertEqual(action["input_type"], "dictionary")
        self.assertEqual(action["status"], ["planned"])
        self.assertEqual(action["unknown_values"], "null_or_empty_never_guess")

    def test_child_result_requires_verification(self):
        result = self.contract["child_result"]
        self.assertIn("verified", result["required"])
        self.assertEqual(result["verified_type"], "boolean")
        self.assertEqual(set(result["status"]), {"success", "failed", "blocked"})

    def test_parent_fails_closed(self):
        policy = self.contract["parent_policy"]
        self.assertTrue(policy["registered_modules_only"])
        self.assertEqual(policy["unregistered_module"], "blocked")
        self.assertEqual(policy["invalid_action_schema"], "blocked")
        self.assertEqual(policy["missing_child_or_invalid_child_result"], "failed")
        self.assertFalse(policy["model_may_report_execution"])
        self.assertTrue(policy["success_requires_verified_true_for_applied"])
        self.assertTrue(policy["no_guessing_or_substitution"])

    def test_existing_executor_path_is_preserved_for_rollback(self):
        legacy = self.contract["legacy_compatibility"]
        self.assertTrue(legacy["keep_existing_executor_path"])
        self.assertTrue(legacy["keep_existing_requires_confirmation"])
        self.assertIn("Use Model", legacy["cutover"])

    def test_modules_are_disabled_until_their_phase_proves_them(self):
        registry = self.contract["initial_registry"]
        self.assertFalse(registry["YOS_Test"]["enabled"])
        self.assertFalse(registry["YOS_Timer"]["enabled"])
        self.assertFalse(registry["YOS_Money"]["enabled"])

    def test_money_module_is_clarity_only_and_preserves_raw_input(self):
        money = self.contract["initial_registry"]["YOS_Money"]
        self.assertEqual(money["entry_policy"], "clarity_only")
        self.assertTrue(money["preserve_original_input"])
        self.assertEqual(money["input_schema"], {"raw_input": "non_empty_string"})
        self.assertTrue(money["side_effect"])


if __name__ == "__main__":
    unittest.main()
