#!/usr/bin/env python3
import plistlib, sys
from pathlib import Path
p=Path(sys.argv[1]); root=plistlib.loads(p.read_bytes())
a=root["WFWorkflowActions"]
assert root["WFWorkflowName"]=="YOS_Home"
assert root["WFWorkflowHasShortcutInputVariables"] is True
assert len(a)==1
x=a[0]
assert x["WFWorkflowActionIdentifier"]=="dk.simonbs.Scriptable.RunScriptInlineIntent"
pms=x["WFWorkflowActionParameters"]
assert pms["ShowWhenRun"] is False
assert pms["runInApp"] is False
param=pms["parameter"]
assert param["WFSerializationType"]=="WFTextTokenAttachment"
assert param["Value"]["Type"]=="ExtensionInput"
assert param["Value"]["VariableName"]=="ShortcutInput"
s=pms["script"]
for token in [
  "function parseHomeCommand",
  "if (/エアコン/.test(s))",
  "return command('ac', 'power_off')",
  "async function performAC",
  "await client.controlAc",
  "Script.setShortcutOutput(result)"
]:
  assert token in s, token
print("YOS_Home structural audit: PASS")
