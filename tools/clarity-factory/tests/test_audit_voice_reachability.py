"""Synthetic-only tests: avoid checking personal user shortcuts into public repo."""
import plistlib
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit_voice_reachability import analyze


def action(name, group=None, mode=None):
    p = {} if group is None else {"GroupingIdentifier": group, "WFControlFlowMode": mode}
    return {"WFWorkflowActionIdentifier": "is.workflow.actions." + name,
            "WFWorkflowActionParameters": p}


def workflow(actions):
    return plistlib.dumps({"WFWorkflowActions": actions}, fmt=plistlib.FMT_BINARY)


class ReachabilityTests(unittest.TestCase):
    def unreachable(self, actions):
        return analyze(workflow(actions))["unreachable"]

    def test_simple_chain(self):
        self.assertEqual(self.unreachable([action("gettext"), action("gettext")]), 0)

    def test_exit_drops_tail(self):
        self.assertEqual(self.unreachable([action("exit"), action("gettext"), action("nothing")]), 2)

    def test_exit_inside_branch_keeps_false_path(self):
        seq = [action("conditional", "A", 0), action("exit"), action("gettext"),
               action("conditional", "A", 2), action("gettext")]
        self.assertEqual(self.unreachable(seq), 2)

    def test_else_marker_can_be_unreachable(self):
        seq = [action("conditional", "A", 0), action("exit"),
               action("conditional", "A", 1), action("gettext"),
               action("conditional", "A", 2)]
        self.assertEqual(self.unreachable(seq), 1)

    def test_nested_branch(self):
        seq = [action("conditional", "A", 0), action("conditional", "B", 0),
               action("exit"), action("conditional", "B", 2),
               action("conditional", "A", 1), action("gettext"),
               action("conditional", "A", 2), action("gettext")]
        self.assertEqual(self.unreachable(seq), 1)

    def test_repeat_cycle_terminates(self):
        seq = [action("repeat.each", "R", 0), action("gettext"),
               action("repeat.each", "R", 2), action("gettext")]
        report = analyze(workflow(seq))
        self.assertEqual(report["unreachable"], 0)
        self.assertEqual(report["repeat_groups"], 1)

    def test_mismatched_group_refused(self):
        with self.assertRaises(ValueError):
            analyze(workflow([action("conditional", "A", 0),
                              action("conditional", "B", 2),
                              action("conditional", "A", 2)]))

    def test_signed_refused(self):
        with self.assertRaises(ValueError):
            analyze(b"AEA1")

    def test_bad_else_refused(self):
        with self.assertRaises(ValueError):
            analyze(workflow([action("conditional", "A", 0),
                              action("conditional", "A", 1),
                              action("conditional", "A", 1),
                              action("conditional", "A", 2)]))


if __name__ == "__main__":
    unittest.main()
