"""Conservative regression check for an offline, decoded Clarity shortcut plist.

Never commit real Shortcut plist, prompt contents, API keys or Scriptable configuration.
A PASS is NOT an iPhone functional/performance result.
"""
import plistlib
import unittest

MODEL = "is.workflow.actions.askllm"
SCRIPTABLE = "dk.simonbs.Scriptable.RunScriptInlineIntent"
EXIT = "is.workflow.actions.exit"


def guard(reference: bytes, proposed: bytes):
    def decode(raw):
        if raw.startswith(b"AEA1"):
            raise ValueError("Private signed shortcut: decode offline first")
        v = plistlib.loads(raw)
        if not isinstance(v, dict) or not isinstance(v.get("WFWorkflowActions"), list):
            raise ValueError("Invalid workflow")
        return v

    old, new = decode(reference), decode(proposed)
    a, b = old["WFWorkflowActions"], new["WFWorkflowActions"]
    old_model = [i for i, v in enumerate(a) if v["WFWorkflowActionIdentifier"] == MODEL]
    new_model = [i for i, v in enumerate(b) if v["WFWorkflowActionIdentifier"] == MODEL]
    if len(old_model) != 1 or len(new_model) != 1:
        raise ValueError("Unexpected model call count")
    ai, bi = old_model[0], new_model[0]
    original_early = sum(v["WFWorkflowActionIdentifier"] == EXIT for v in a[:ai])
    candidate_early = sum(v["WFWorkflowActionIdentifier"] == EXIT for v in b[:bi])
    old_bridge = [v for v in a if v["WFWorkflowActionIdentifier"] == SCRIPTABLE]
    new_bridge = [v for v in b if v["WFWorkflowActionIdentifier"] == SCRIPTABLE]
    checks = {
        "pre_model_actions_unchanged": a[:ai] == b[:bi],
        "new_early_exit_not_added": candidate_early <= original_early,
        "model_unchanged": a[ai] == b[bi],
        "scriptable_bridges_unchanged": old_bridge == new_bridge,
        "workflow_settings_unchanged":
            {k: v for k, v in old.items() if k != "WFWorkflowActions"} ==
            {k: v for k, v in new.items() if k != "WFWorkflowActions"},
    }
    return checks


def action(identifier, **kwargs):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": kwargs}


def packed(actions, icon=1):
    return plistlib.dumps({"WFWorkflowActions": actions, "WFWorkflowIcon": {"a": icon}},
                          fmt=plistlib.FMT_BINARY)


class SafetyGateTests(unittest.TestCase):
    def setUp(self):
        self.actions = [
            action("is.workflow.actions.gettext", UUID="A"),
            action(EXIT),
            action("is.workflow.actions.gettext", UUID="B"),
            action(MODEL, UUID="C"),
            action(SCRIPTABLE, script="synthetic"),
            action("is.workflow.actions.openurl", UUID="D"),
        ]
        self.base = packed(self.actions)

    def check(self, actions, expected):
        report = guard(self.base, packed(actions))
        self.assertEqual(all(report.values()), expected)

    def test_unchanged(self):
        self.check(self.actions, True)

    def test_post_model_routing_change_allowed(self):
        revised = list(self.actions)
        revised[-1] = action("is.workflow.actions.runworkflow", UUID="D")
        self.check(revised, True)

    def test_new_early_exit_flagged(self):
        revised = list(self.actions)
        revised.insert(3, action(EXIT))
        self.check(revised, False)
        self.assertFalse(guard(self.base, packed(revised))["new_early_exit_not_added"])

    def test_pre_model_change_flagged(self):
        revised = list(self.actions)
        revised[0] = action("is.workflow.actions.gettext", UUID="DIFFERENT")
        self.check(revised, False)

    def test_model_change_flagged(self):
        revised = list(self.actions)
        revised[3] = action(MODEL, UUID="C", FollowUp=True)
        self.check(revised, False)

    def test_scriptable_bridge_change_flagged(self):
        revised = list(self.actions)
        revised[4] = action(SCRIPTABLE, script="changed")
        self.check(revised, False)

    def test_metadata_change_flagged(self):
        self.assertFalse(guard(self.base, packed(self.actions, icon=2))[
            "workflow_settings_unchanged"])

    def test_signed_shortcut_rejected(self):
        with self.assertRaises(ValueError):
            guard(self.base, b"AEA1abc")

    def test_unknown_model_count_rejected(self):
        with self.assertRaises(ValueError):
            guard(self.base, packed(self.actions + [action(MODEL)]))


if __name__ == "__main__":
    unittest.main()
