#!/usr/bin/env python3
import plistlib, sys
from pathlib import Path

p=Path(sys.argv[1])
root=plistlib.loads(p.read_bytes())
actions=root["WFWorkflowActions"]

assert root["WFWorkflowClientVersion"]=="5037.109"
assert root["WFWorkflowMinimumClientVersionString"]=="900"
assert root["WFWorkflowMinimumClientVersion"]==900
assert root["WFWorkflowInputContentItemClasses"]==["WFStringContentItem"]
assert root["WFWorkflowTypes"]==["Watch"]
assert root["WFQuickActionSurfaces"]==[]
assert root["WFWorkflowHasShortcutInputVariables"] is False
assert len(actions)==1

a=actions[0]
assert a["WFWorkflowActionIdentifier"]=="dk.simonbs.Scriptable.RunScriptInlineIntent"
params=a["WFWorkflowActionParameters"]
assert set(params)=={"script","runInApp","ShowWhenRun"}
assert params["runInApp"] is False
assert params["ShowWhenRun"] is False

script_token=params["script"]
assert script_token["WFSerializationType"]=="WFTextTokenString"
assert set(script_token["Value"])=={"string"}
script=script_token["Value"]["string"]

for token in [
  "function inputText()",
  "args.shortcutParameter",
  "function parseHomeCommand",
  "if (/エアコン/.test(s))",
  "return command('ac', 'power_off')",
  "return command('ac', 'power_on')",
  "return command('ac', 'set_temperature'",
  "async function performAC",
  "await client.controlAc",
  "Script.setShortcutOutput(result)",
]:
  assert token in script, token

print("YOS_Home exact-wire-format audit: PASS")
