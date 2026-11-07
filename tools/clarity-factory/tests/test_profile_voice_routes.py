"""Synthetic, secret-free unit tests for the control-flow profiler."""
import plistlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from profile_voice_routes import profile

IF = "is.workflow.actions.conditional"
EXIT = "is.workflow.actions.exit"
MODEL = "is.workflow.actions.askllm"
TEXT = "is.workflow.actions.gettext"


def action(identifier, **kwargs):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": kwargs}


def packed(actions):
    return plistlib.dumps({"WFWorkflowActions": actions}, fmt=plistlib.FMT_BINARY)


def condition(group, mode):
    return action(IF, GroupingIdentifier=group, WFControlFlowMode=mode)


class ProfileTests(unittest.TestCase):
    def test_plain(self):
        actual = profile(packed([action(TEXT), action(TEXT), action(MODEL)]))
        self.assertEqual((actual["shortest_path_actions_before_model"],
                          actual["longest_path_actions_before_model"]), (2, 2))

    def test_if_without_else(self):
        a = [action(TEXT), condition("A", 0), action(TEXT), action(TEXT),
             condition("A", 2), action(MODEL)]
        p = profile(packed(a))
        self.assertEqual((p["shortest_path_actions_before_model"],
                          p["longest_path_actions_before_model"]), (2, 5))

    def test_else(self):
        a = [condition("A", 0), action(TEXT), condition("A", 1), action(TEXT),
             action(TEXT), condition("A", 2), action(MODEL)]
        p = profile(packed(a))
        self.assertEqual((p["shortest_path_actions_before_model"],
                          p["longest_path_actions_before_model"]), (3, 4))

    def test_nested_exit(self):
        a = [condition("A", 0), condition("B", 0), action(EXIT),
             condition("B", 2), condition("A", 2), action(MODEL)]
        p = profile(packed(a))
        self.assertEqual((p["shortest_path_actions_before_model"],
                          p["longest_path_actions_before_model"]), (1, 3))
        self.assertEqual(p["early_exit_positions_1based"], [3])

    def test_unreachable_model(self):
        with self.assertRaisesRegex(ValueError, "unreachable"):
            profile(packed([action(EXIT), action(MODEL)]))

    def test_unbalanced(self):
        with self.assertRaisesRegex(ValueError, "Unbalanced"):
            profile(packed([condition("A", 0), action(MODEL)]))

    def test_mismatched_end(self):
        with self.assertRaisesRegex(ValueError, "Non-nested"):
            profile(packed([condition("A", 0), condition("B", 2),
                            condition("A", 2), action(MODEL)]))

    def test_signed_rejected(self):
        with self.assertRaisesRegex(ValueError, "Signed"):
            profile(b"AEA1secret")


if __name__ == "__main__":
    unittest.main()
