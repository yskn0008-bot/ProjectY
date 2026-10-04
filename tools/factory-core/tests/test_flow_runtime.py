import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "tools" / "factory-core" / "build_flow_runtime.py"
SPEC = importlib.util.spec_from_file_location("build_flow_runtime", MODULE_PATH)
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(module)


class FlowRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.plan = module.load_plan()

    def test_plan_reuses_one_existing_child_without_new_router(self):
        policy = self.plan["policy"]
        self.assertTrue(policy["morning_flow_unchanged"])
        self.assertTrue(policy["no_new_flow_router"])
        self.assertTrue(policy["no_new_ssot"])
        self.assertEqual(policy["shared_child"], "YOS Battery Sync")
        for name in ("Home Flow", "Work Flow", "Out Flow"):
            self.assertEqual(
                self.plan["flows"][name]["children"],
                ["YOS Battery Sync"],
            )

    def test_recovered_focus_trigger_is_preserved_around_compiled_action(self):
        name = "Home Flow"
        entry = self.plan["flows"][name]
        baseline = module.load_plist(module.repo_path(entry["baseline"]))
        compiled = {
            "WFWorkflowActions": [{
                "WFWorkflowActionIdentifier": "is.workflow.actions.runworkflow",
                "WFWorkflowActionParameters": {
                    "WFWorkflowName": "YOS Battery Sync",
                },
            }],
            "WFWorkflowName": name,
        }
        result = module.compose_flow(name, compiled, baseline, entry)
        self.assertEqual(
            result["WFWorkflowTriggers"],
            baseline["WFWorkflowTriggers"],
        )
        module.validate_runtime_workflow(name, result, entry)

    def test_side_effect_actions_fail_closed(self):
        name = "Work Flow"
        entry = self.plan["flows"][name]
        baseline = module.load_plist(module.repo_path(entry["baseline"]))
        compiled = {
            "WFWorkflowActions": [
                {
                    "WFWorkflowActionIdentifier": "is.workflow.actions.runworkflow",
                    "WFWorkflowActionParameters": {
                        "WFWorkflowName": "YOS Battery Sync",
                    },
                },
                {
                    "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
                    "WFWorkflowActionParameters": {},
                },
            ],
            "WFWorkflowName": name,
        }
        with self.assertRaises(AssertionError):
            module.compose_flow(name, compiled, baseline, entry)


if __name__ == "__main__":
    unittest.main()
