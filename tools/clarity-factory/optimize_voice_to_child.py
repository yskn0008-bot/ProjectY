#!/usr/bin/env python3
"""Offline, fail-closed Clarity.Voice optimization against decoded private plist only.

Never upload the user's actual shortcut, tokens, or decoded plist. Generated file
is unsigned and MUST NOT be mistaken for a ready-to-install shortcut.
"""
import argparse
import copy
import hashlib
import json
import plistlib
import uuid
from pathlib import Path

EXIT = "is.workflow.actions.exit"
NOP = "is.workflow.actions.nothing"
LEGACY = ["is.workflow.actions.location", "is.workflow.actions.searchmaps", NOP]
RUN = "is.workflow.actions.runworkflow"


def uses_uuid(actions, uid, exclude=()):
    return [i for i, a in enumerate(actions) if i not in exclude and uid and
            uid in str(a.get("WFWorkflowActionParameters", {}))]


def flow_signature(actions):
    return [
        (a["WFWorkflowActionIdentifier"],
         a.get("WFWorkflowActionParameters", {}).get("GroupingIdentifier"),
         a.get("WFWorkflowActionParameters", {}).get("WFControlFlowMode"))
        for a in actions
        if a["WFWorkflowActionIdentifier"] in (
            "is.workflow.actions.conditional", "is.workflow.actions.repeat.each")
    ]


def optimize(raw):
    if raw.startswith(b"AEA1"):
        raise ValueError("Signed Shortcut: decode locally first; never send secrets to third parties.")
    original = plistlib.loads(raw)
    if not isinstance(original, dict) or not isinstance(original.get("WFWorkflowActions"), list):
        raise ValueError("Not a Shortcut workflow plist")
    optimized = copy.deepcopy(original)
    actions = optimized["WFWorkflowActions"]
    source = original["WFWorkflowActions"]
    matches = [i for i in range(len(actions)-2)
               if [a["WFWorkflowActionIdentifier"] for a in actions[i:i+3]] == LEGACY]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one legacy navigation sequence; found {len(matches)}")
    i = matches[0]
    p = actions[i]["WFWorkflowActionParameters"]
    location_uuid = p.get("UUID")
    destination = p.get("WFLocation")
    maps = actions[i+1]["WFWorkflowActionParameters"]
    if not location_uuid or not destination or destination.get("Value", {}).get("Type") != "ActionOutput":
        raise ValueError("Unexpected navigation destination")
    if maps.get("WFInput", {}).get("Value", {}).get("OutputUUID") != location_uuid:
        raise ValueError("Navigation output linkage differs")
    nop_uuid = actions[i+2].get("WFWorkflowActionParameters", {}).get("UUID")
    if uses_uuid(actions, location_uuid, (i,i+1,i+2)) or uses_uuid(actions, nop_uuid, (i,i+1,i+2)):
        raise ValueError("An obsolete navigation action has another consumer")
    taken = {a.get("WFWorkflowActionParameters", {}).get("UUID") for a in actions}
    new_id = str(uuid.uuid4()).upper()
    while new_id in taken:
        new_id = str(uuid.uuid4()).upper()
    actions[i:i+3] = [{
        "WFWorkflowActionIdentifier": RUN,
        "WFWorkflowActionParameters": {
            "UUID": new_id,
            "WFInput": copy.deepcopy(destination),
            "WFWorkflow": {"workflowName": "YOS_Navigate", "isSelf": False},
            "WFWorkflowName": "YOS_Navigate",
        },
    }]
    drop = []
    for j in range(1, len(actions)):
        if actions[j-1]["WFWorkflowActionIdentifier"] == EXIT and actions[j]["WFWorkflowActionIdentifier"] == NOP:
            uid = actions[j].get("WFWorkflowActionParameters", {}).get("UUID")
            if not uid or uses_uuid(actions, uid, (j,)):
                raise ValueError(f"Unreachable Nothing action #{j+1} has unknown consumers")
            drop.append(j)
    ids = {id(actions[j]) for j in drop}
    optimized["WFWorkflowActions"] = [a for a in actions if id(a) not in ids]
    after = optimized["WFWorkflowActions"]
    assert len(after) == len(source) - 2 - len(drop)
    assert flow_signature(source) == flow_signature(after)
    assert all(original[k] == optimized[k] for k in original if k != "WFWorkflowActions")
    untouched = [a for j,a in enumerate(source) if j not in (i,i+1,i+2) and
                 not (a["WFWorkflowActionIdentifier"] == NOP and j > 0 and
                      source[j-1]["WFWorkflowActionIdentifier"] == EXIT)]
    assert len(untouched) + 1 == len(after)
    assert [a for a in after if a["WFWorkflowActionIdentifier"] != RUN or
            a["WFWorkflowActionParameters"].get("WFWorkflowName") != "YOS_Navigate"] == untouched
    result = plistlib.dumps(optimized, fmt=plistlib.FMT_BINARY, sort_keys=False)
    assert plistlib.loads(result) == optimized
    return result, {
        "source_actions": len(source), "optimized_actions": len(after),
        "reduced_actions": len(source)-len(after),
        "unreachable_nothing_removed": len(drop),
        "navigation_actions_replaced": 3, "navigation_actions_added": 1,
        "child_shortcut": "YOS_Navigate",
        "control_flow_unchanged": True, "top_level_metadata_unchanged": True,
        "signed": False, "installed_on_iphone": False, "iphone_speed_tested": False,
        "note": "Unreachable no-ops were never executed and do not explain runtime latency.",
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "optimized_sha256": hashlib.sha256(result).hexdigest()
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result, report = optimize(args.input.read_bytes())
    args.output.write_bytes(result)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
