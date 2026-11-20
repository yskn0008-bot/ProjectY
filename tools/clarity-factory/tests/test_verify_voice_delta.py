"""Synthetic no-secrets tests for strict optimization-delta guard."""
import plistlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_voice_delta import audit

PREFIX = "is.workflow.actions."


def action(name, params=None):
    return {"WFWorkflowActionIdentifier": PREFIX + name,
            "WFWorkflowActionParameters": params or {}}


def encoded(actions):
    return plistlib.dumps(
        {"WFWorkflowActions": actions, "WFWorkflowIcon": {"glyph": 1}},
        fmt=plistlib.FMT_BINARY)


class DeltaAuditTests(unittest.TestCase):
    def setUp(self):
        self.base = [
            action("gettext", {"WFTextActionText": "before"}),
            action("exit"), action("nothing"),
            action("urlencode", {"WFInput": "x"}),
            action("gettext", {"WFTextActionText": "Apple URL"}),
            action("openurl", {"WFInput": "apple"}),
            action("gettext", {"WFTextActionText": "after"}),
        ]
        self.candidate = [
            self.base[0], self.base[1],
            action("urlencode", {"WFInput": "x"}),
            action("gettext", {"WFTextActionText": "Google URL"}),
            action("openurl", {"WFInput": "google"}),
            self.base[-1],
        ]

    def test_only_navigation_and_dead_nothing_changed(self):
        result = audit(encoded(self.base), encoded(self.candidate))
        self.assertEqual(
            (result["unchanged_actions"],
             result["deleted_unreachable_noops"],
             result["navigation_replacements"]), (3, 1, 1))

    def test_refuse_changed_normal_action(self):
        actions = list(self.candidate)
        actions[-1] = action("gettext", {"WFTextActionText": "changed"})
        with self.assertRaises(ValueError):
            audit(encoded(self.base), encoded(actions))

    def test_refuse_removed_live_action(self):
        with self.assertRaises(ValueError):
            audit(encoded(self.base), encoded(self.candidate[:-1]))

    def test_refuse_unexpected_extra_action(self):
        with self.assertRaises(ValueError):
            audit(encoded(self.base), encoded(self.candidate + [action("alert")]))

    def test_refuse_signed(self):
        with self.assertRaises(ValueError):
            audit(b"AEA1", encoded(self.candidate))


if __name__ == "__main__":
    unittest.main()
