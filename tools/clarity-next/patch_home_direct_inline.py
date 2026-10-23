"""Inline the existing YOS_Home Scriptable bridge into Clarity Next's home path.

This removes the runtime dependency on another installed Shortcut while preserving
exactly the existing MY REMOTE code and Shortcut Input binding.
"""
from pathlib import Path
import copy
import plistlib
import sys

CHILD_NAME = "YOS_Home"
RUN = "is.workflow.actions.runworkflow"
INLINE = "dk.simonbs.Scriptable.RunScriptInlineIntent"

def patch(core_path: Path, bridge_path: Path) -> None:
    core = plistlib.loads(core_path.read_bytes())
    actions = core["WFWorkflowActions"]
    hits = [
        a for a in actions
        if a.get("WFWorkflowActionIdentifier") == RUN
        and a.get("WFWorkflowActionParameters", {}).get("WFWorkflowName") == CHILD_NAME
    ]
    if len(hits) != 1:
        raise ValueError(f"expected one {CHILD_NAME} Run Shortcut action; found {len(hits)}")
    action = hits[0]
    old_params = action.get("WFWorkflowActionParameters", {})
    wf_input = old_params.get("WFInput")
    if not isinstance(wf_input, dict):
        raise ValueError("YOS_Home Run Shortcut input is missing")
    if wf_input.get("WFSerializationType") != "WFTextTokenAttachment":
        raise ValueError("YOS_Home input is not a typed variable attachment")
    ref = wf_input.get("Value", {})
    if ref.get("Type") != "ActionOutput" or ref.get("OutputName") != "homeCommand":
        raise ValueError("YOS_Home did not receive the planned homeCommand")
    script = bridge_path.read_text(encoding="utf-8")
    if "parseHomeCommand" not in script or "YOS Home Bridge" not in script:
        raise ValueError("expected the existing, reviewed MY REMOTE bridge")
    action["WFWorkflowActionIdentifier"] = INLINE
    action["WFWorkflowActionParameters"] = {
        "ShowWhenRun": False,
        "runInApp": False,
        "script": {
            "Value": {"string": script},
            "WFSerializationType": "WFTextTokenString",
        },
        # Reuse exactly the Cherri-compiled homeCommand variable.
        "parameter": copy.deepcopy(wf_input),
    }
    data = plistlib.dumps(core, fmt=plistlib.FMT_BINARY, sort_keys=False)
    check = plistlib.loads(data)
    check_actions = check["WFWorkflowActions"]
    assert not any(
        a.get("WFWorkflowActionIdentifier") == RUN
        and a.get("WFWorkflowActionParameters", {}).get("WFWorkflowName") == CHILD_NAME
        for a in check_actions
    ), "home child dependency survived"
    direct = [
        a for a in check_actions
        if a.get("WFWorkflowActionIdentifier") == INLINE
        and a.get("WFWorkflowActionParameters", {}).get("parameter") == wf_input
    ]
    assert len(direct) == 1, "failed to link the original homeCommand"
    assert direct[0]["WFWorkflowActionParameters"]["runInApp"] is False
    assert "parseHomeCommand" in repr(direct[0])
    core_path.write_bytes(data)
    print("YOS_Home direct inline + original homeCommand binding: PASS")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_home_direct_inline.py <core-unsigned.shortcut> <bridge-js>")
    patch(Path(sys.argv[1]), Path(sys.argv[2]))
