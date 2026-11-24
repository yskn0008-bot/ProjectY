#!/usr/bin/env python3
"""Embed and validate the single-action Installer 2 bootstrap."""
import plistlib
import sys
from pathlib import Path
action_id = "dk.simonbs.Scriptable.RunScriptInlineIntent"
placeholder = "__YOS_INSTALLER_2_BOOTSTRAP__"
runtime = Path("tools/shortcut-factory/inline/common-installer-2-bootstrap.js").read_text(encoding="utf-8")
assert runtime.startswith("// YOS Common Installer 2")
assert "ed5a0dd48a73f3602eeef0fe8017ddd2a22682a5" in runtime and "c113d032e377be85acb8767672a67ebd5c473e66fa0b3b0ee34d90dc6681c301" in runtime
assert len(runtime) < 30000
p = Path(sys.argv[1])
w = plistlib.loads(p.read_bytes())
actions = w["WFWorkflowActions"]
assert len(actions) == 1 and actions[0]["WFWorkflowActionIdentifier"] == action_id
params = actions[0]["WFWorkflowActionParameters"]
assert params["runInApp"] is True and params["script"] == placeholder
params["script"] = {"Value": {"string": runtime}, "WFSerializationType": "WFTextTokenString"}
assert placeholder not in repr(w)
p.write_bytes(plistlib.dumps(w, fmt=plistlib.FMT_XML, sort_keys=False))
print("Single-action bootstrap verified")
