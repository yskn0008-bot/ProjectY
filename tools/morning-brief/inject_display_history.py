#!/usr/bin/env python3
import copy
import plistlib
import sys
import uuid
from pathlib import Path

def fail(message):
    raise SystemExit(message)

def find_one(actions, identifier):
    matches=[(i,a) for i,a in enumerate(actions) if a.get("WFWorkflowActionIdentifier")==identifier]
    if len(matches)!=1:
        fail(f"expected one {identifier}, found {len(matches)}")
    return matches[0]

def remap_fragment(actions):
    mapping={}
    for action in actions:
        old=action.get("WFWorkflowActionParameters",{}).get("UUID")
        if old:
            mapping[str(old)]=str(uuid.uuid4()).upper()
    def walk(value):
        if isinstance(value, dict):
            if value.get("Type")=="ExtensionInput":
                return {"Type":"__MORNING_LLM_OUTPUT__"}
            return {k:walk(v) for k,v in value.items()}
        if isinstance(value, list):
            return [walk(v) for v in value]
        if isinstance(value, str) and value in mapping:
            return mapping[value]
        return value
    return walk(copy.deepcopy(actions))

def replace_marker(value, llm_uuid):
    if isinstance(value, dict):
        if value.get("Type")=="__MORNING_LLM_OUTPUT__":
            return {
                "OutputUUID": llm_uuid,
                "Type":"ActionOutput",
                "OutputName":"応答",
            }
        return {k:replace_marker(v,llm_uuid) for k,v in value.items()}
    if isinstance(value,list):
        return [replace_marker(v,llm_uuid) for v in value]
    return value

def patch(morning_path, fragment_path, destination):
    morning=plistlib.loads(Path(morning_path).read_bytes())
    fragment=plistlib.loads(Path(fragment_path).read_bytes())
    actions=morning.get("WFWorkflowActions")
    fragment_actions=fragment.get("WFWorkflowActions")
    if not isinstance(actions,list) or not isinstance(fragment_actions,list):
        fail("workflow actions missing")

    llm_index,llm=find_one(actions,"is.workflow.actions.askllm")
    llm_uuid=str(llm.get("WFWorkflowActionParameters",{}).get("UUID") or "")
    if not llm_uuid:
        fail("Morning LLM UUID missing")

    injected=replace_marker(remap_fragment(fragment_actions),llm_uuid)
    actions[llm_index+1:llm_index+1]=injected
    morning["WFWorkflowHasShortcutInputVariables"]=False

    Path(destination).write_bytes(plistlib.dumps(morning,fmt=plistlib.FMT_XML,sort_keys=False))

    patched=plistlib.loads(Path(destination).read_bytes())
    ids=[a.get("WFWorkflowActionIdentifier","") for a in patched["WFWorkflowActions"]]
    blob=repr(patched)
    if ids.count("is.workflow.actions.documentpicker.save") != 1:
        fail("Morning display history save missing")
    if "YOS Display History" not in blob or "【Morning Brief】" not in blob:
        fail("Morning display history payload missing")
    if "ExtensionInput" in repr(injected):
        fail("fragment Shortcut Input was not replaced")
    print(f"Morning display history injection: PASS ({len(injected)} actions)")

if __name__=="__main__":
    if len(sys.argv)!=4:
        fail("usage: inject_display_history.py MORNING.plist FRAGMENT.plist DESTINATION.plist")
    patch(sys.argv[1],sys.argv[2],sys.argv[3])
