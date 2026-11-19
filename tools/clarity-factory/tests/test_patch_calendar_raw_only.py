"""Synthetic, privacy-safe tests for the offline Clarity Calendar delta."""
import copy
import importlib.util
import plistlib
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "patch_calendar_raw_only.py"
spec = importlib.util.spec_from_file_location("patch_calendar_raw_only", SOURCE)
patcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patcher)


def sample():
    # Synthetic-only workflow: no actual user Shortcut, token or personal data.
    actions = [
        {"WFWorkflowActionIdentifier": "is.workflow.actions.nothing",
         "WFWorkflowActionParameters": {"UUID": f"fake-unique-{i:04}"}} 
        for i in range(1000)
    ]
    for i, name in ((0, "resolvedInput"), (1, "inputMode")):
        actions[i] = {
            "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
            "WFWorkflowActionParameters": {
                "WFVariableName": name,
                "WFInput": {"Value": {"string": "synthetic-only"}},
            },
        }
    actions[420] = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.addnewevent",
        "WFWorkflowActionParameters": {"UUID": "fake-calendar-uuid"},
    }
    return {"WFWorkflowActions": actions, "WFWorkflowTypes": ["synthetic"]}


def packed(workflow):
    return plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY,
                          sort_keys=False)


class CalendarRawOnlyDeltaTest(unittest.TestCase):
    def test_inserts_exactly_two_actions_and_preserves_1000_originals(self):
        original = sample()
        output, report = patcher.patch(packed(original))
        result = plistlib.loads(output)
        old = original["WFWorkflowActions"]
        new = result["WFWorkflowActions"]
        self.assertEqual(len(new), 1002)
        self.assertEqual(new[:421], old[:421])
        self.assertEqual(new[423:], old[421:])
        self.assertEqual(result["WFWorkflowTypes"], original["WFWorkflowTypes"])
        self.assertEqual(report["original_actions_preserved"], 1000)
        self.assertFalse(report["signed"])
        self.assertFalse(report["installed"])
        self.assertFalse(report["iphone_tested"])

    def test_packet_routes_only_raw_with_original_input_variables(self):
        result, _ = patcher.patch(packed(sample()))
        a = plistlib.loads(result)["WFWorkflowActions"]
        data, runner = a[421:423]
        self.assertEqual(data["WFWorkflowActionIdentifier"], patcher.DICTIONARY)
        self.assertEqual(runner["WFWorkflowActionIdentifier"], patcher.SCRIPTABLE)
        items = data["WFWorkflowActionParameters"]["WFItems"]["Value"]["WFDictionaryFieldValueItems"]
        values = {i["WFKey"]["Value"]["string"]: i["WFValue"] for i in items}
        self.assertEqual(values["rawText"]["Value"]["attachmentsByRange"]["{0, 1}"],
                         {"Type": "Variable", "VariableName": "resolvedInput"})
        self.assertEqual(values["source"]["Value"]["attachmentsByRange"]["{0, 1}"],
                         {"Type": "Variable", "VariableName": "inputMode"})
        self.assertEqual(values["routeMode"]["Value"]["string"], "raw-only")
        self.assertEqual(values["executionTarget"]["Value"]["string"], "calendar.create")
        self.assertEqual(runner["WFWorkflowActionParameters"]["fileName"],
                         "YOS Clarity Inbox Bridge")
        self.assertEqual(
            runner["WFWorkflowActionParameters"]["parameter"]["Value"]["OutputUUID"],
            data["WFWorkflowActionParameters"]["UUID"],
        )

    def test_refuses_signed_shortcut(self):
        with self.assertRaises(ValueError):
            patcher.patch(b"AEA1" + packed(sample()))

    def test_refuses_already_patched_shortcut(self):
        patched, _ = patcher.patch(packed(sample()))
        with self.assertRaises(ValueError):
            patcher.patch(patched)

    def test_refuses_moved_or_duplicate_calendar(self):
        original = sample()
        original["WFWorkflowActions"][420], original["WFWorkflowActions"][421] = (
            original["WFWorkflowActions"][421], original["WFWorkflowActions"][420]
        )
        with self.assertRaises(ValueError):
            patcher.patch(packed(original))
        original = sample()
        original["WFWorkflowActions"][300] = copy.deepcopy(original["WFWorkflowActions"][420])
        with self.assertRaises(ValueError):
            patcher.patch(packed(original))

    def test_refuses_missing_input_and_changed_following_action(self):
        original = sample()
        original["WFWorkflowActions"][1]["WFWorkflowActionParameters"]["WFVariableName"] = "other"
        with self.assertRaises(ValueError):
            patcher.patch(packed(original))
        original = sample()
        original["WFWorkflowActions"][421] = {
            "WFWorkflowActionIdentifier": "is.workflow.actions.exit",
            "WFWorkflowActionParameters": {},
        }
        with self.assertRaises(ValueError):
            patcher.patch(packed(original))


if __name__ == "__main__":
    unittest.main()
