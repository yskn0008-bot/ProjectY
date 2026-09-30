#!/usr/bin/env python3
import plistlib
import sys
import uuid
from pathlib import Path

path = Path(sys.argv[1])
root = plistlib.loads(path.read_bytes())
actions = root["WFWorkflowActions"]

dictate_index = next(i for i,a in enumerate(actions) if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.dictatetext")
dictate = actions[dictate_index]
old_uuid = dictate.get("WFWorkflowActionParameters", {}).get("UUID")
if not old_uuid:
    raise SystemExit("dictation UUID missing")

def uid():
    return str(uuid.uuid4()).upper()

def token(value):
    return {"Value": value, "WFSerializationType": "WFTextTokenAttachment"}

def action(identifier, params):
    return {"WFWorkflowActionIdentifier": identifier, "WFWorkflowActionParameters": params}

group = uid()
ask_uuid = uid()
replacement = [
    action("is.workflow.actions.conditional", {
        "WFInput": {
            "Type": "Variable",
            "Variable": token({"VariableName": "ShortcutInput", "Type": "ExtensionInput"}),
        },
        "WFControlFlowMode": 0,
        "GroupingIdentifier": group,
        "WFCondition": 100,
    }),
    action("is.workflow.actions.setvariable", {
        "WFInput": token({"VariableName": "ShortcutInput", "Type": "ExtensionInput"}),
        "WFVariableName": "userInput",
        "WFSerializationType": "WFTextTokenAttachment",
    }),
    action("is.workflow.actions.conditional", {
        "WFControlFlowMode": 1,
        "GroupingIdentifier": group,
        "UUID": uid(),
    }),
    action("is.workflow.actions.ask", {
        "UUID": ask_uuid,
        "WFAskActionPrompt": "Clarity",
        "WFInputType": "Text",
        "CustomOutputName": "AskedInput",
    }),
    action("is.workflow.actions.setvariable", {
        "WFInput": token({
            "OutputUUID": ask_uuid,
            "Type": "ActionOutput",
            "OutputName": "AskedInput",
        }),
        "WFVariableName": "userInput",
        "WFSerializationType": "WFTextTokenAttachment",
    }),
    action("is.workflow.actions.conditional", {
        "WFControlFlowMode": 2,
        "GroupingIdentifier": group,
        "UUID": uid(),
    }),
]
actions[dictate_index:dictate_index+1] = replacement

def rewrite(obj):
    if isinstance(obj, dict):
        if obj.get("OutputUUID") == old_uuid:
            return {"VariableName": "userInput", "Type": "Variable"}
        return {k: rewrite(v) for k,v in obj.items()}
    if isinstance(obj, list):
        return [rewrite(v) for v in obj]
    return obj

root = rewrite(root)
root["WFWorkflowHasShortcutInputVariables"] = True
root["WFWorkflowName"] = "Clarity Core"

llm = [a for a in root["WFWorkflowActions"] if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.askllm"]
if len(llm) != 1:
    raise SystemExit(f"expected one ChatGPT action, got {len(llm)}")
lp = llm[0]["WFWorkflowActionParameters"]
lp["WFLLMModel"] = "ChatGPT"
lp["WFGenerativeResultType"] = "Dictionary"
lp["FollowUp"] = False
lp["WFAllowWebSearch"] = True

# Keep one canonical ledger rather than creating a second money/clarity SSOT.
# Only visible alert title is renamed for the new parent shortcut.
for a in root["WFWorkflowActions"]:
    p = a.get("WFWorkflowActionParameters", {})
    if p.get("WFAlertActionTitle") == "Clarity Next":
        p["WFAlertActionTitle"] = "Clarity Core"

path.write_bytes(plistlib.dumps(root, fmt=plistlib.FMT_BINARY, sort_keys=False))
print(f"patched {path}: {len(root['WFWorkflowActions'])} actions")
