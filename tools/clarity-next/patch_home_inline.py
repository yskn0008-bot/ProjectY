from pathlib import Path
import plistlib
import sys

PLACEHOLDER = "__YOS_HOME_INLINE__"
IDENTIFIER = "dk.simonbs.Scriptable.RunScriptInlineIntent"

def fail(message):
    raise SystemExit(message)

if len(sys.argv) != 3:
    fail("usage: patch_home_inline.py <shortcut> <bridge-js>")

shortcut = Path(sys.argv[1])
bridge_path = Path(sys.argv[2])
workflow = plistlib.loads(shortcut.read_bytes())
bridge = bridge_path.read_text(encoding="utf-8")
actions = workflow.get("WFWorkflowActions", [])
matches = [a for a in actions if a.get("WFWorkflowActionIdentifier") == IDENTIFIER]
if len(matches) != 1:
    fail(f"expected exactly one Scriptable inline action, got {len(matches)}")
params = matches[0].setdefault("WFWorkflowActionParameters", {})
if PLACEHOLDER not in repr(params):
    fail("home inline placeholder missing before patch")
params["script"] = {
    "Value": {"string": bridge},
    "WFSerializationType": "WFTextTokenString",
}
# Required: the real iPhone Shortcut Input must flow into args.shortcutParameter.
# PR #537 originally needed this Parameter binding to be set manually on device.
params["parameter"] = {
    "Value": {"Type": "ExtensionInput"},
    "WFSerializationType": "WFTextTokenAttachment",
}
params["ShowWhenRun"] = False
params["runInApp"] = False
shortcut.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY, sort_keys=False))

check = plistlib.loads(shortcut.read_bytes())
blob = repr(check)
bound = check["WFWorkflowActions"]
inline = [a for a in bound if a.get("WFWorkflowActionIdentifier") == IDENTIFIER]
assert inline[0]["WFWorkflowActionParameters"].get("parameter") == {
    "Value": {"Type": "ExtensionInput"},
    "WFSerializationType": "WFTextTokenAttachment",
}, "missing Shortcut Input to Scriptable parameter binding"
if PLACEHOLDER in blob:
    fail("home inline placeholder survived patch")
if "YOS Home Bridge" not in blob or "parseHomeCommand" not in blob:
    fail("home bridge content missing after patch")
print("YOS_Home inline bridge patch: PASS")
