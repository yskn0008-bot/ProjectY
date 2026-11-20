#!/usr/bin/env python3
"""Conservative offline Shortcut control-flow audit; never upload personal plist.

A structurally unreachable block can still contain essential conditional
markers and MUST NOT automatically be removed. No performance claims.
"""
from collections import Counter, deque
import argparse
import json
import plistlib

CONTROL = {"is.workflow.actions.conditional", "is.workflow.actions.repeat.each"}
STOP = "is.workflow.actions.exit"
REPEAT = "is.workflow.actions.repeat.each"


def analyze(data: bytes) -> dict:
    if data.startswith(b"AEA1"):
        raise ValueError("Signed shortcut: decode locally; do not upload")
    doc = plistlib.loads(data)
    actions = doc.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise ValueError("Invalid workflow")
    groups, stack = {}, []
    for i, action in enumerate(actions):
        kind = action["WFWorkflowActionIdentifier"]
        if kind not in CONTROL:
            continue
        args = action["WFWorkflowActionParameters"]
        gid = args.get("GroupingIdentifier")
        mode = args.get("WFControlFlowMode")
        if not gid or mode not in (0, 1, 2):
            raise ValueError(f"Unsupported control flow #{i+1}")
        if mode == 0:
            if gid in groups:
                raise ValueError("Duplicate group")
            groups[gid] = {"kind": kind, "start": i, "else": None, "end": None}
            stack.append(gid)
        else:
            if not stack or stack[-1] != gid or groups[gid]["kind"] != kind:
                raise ValueError("Improperly nested group")
            if mode == 1:
                if kind != "is.workflow.actions.conditional" or groups[gid]["else"] is not None:
                    raise ValueError("Invalid else")
                groups[gid]["else"] = i
            else:
                groups[gid]["end"] = i
                stack.pop()
    if stack:
        raise ValueError("Unclosed control flow")
    controls = {}
    for group in groups.values():
        controls[group["start"]] = ("start", group)
        if group["else"] is not None:
            controls[group["else"]] = ("else", group)
        controls[group["end"]] = ("end", group)
    n = len(actions)
    edges = []
    for i, action in enumerate(actions):
        kind = action["WFWorkflowActionIdentifier"]
        if kind == STOP:
            successors = []
        elif i not in controls:
            successors = [i + 1]
        else:
            mode, grp = controls[i]
            if mode == "start":
                successors = [i + 1, grp["else"] + 1 if grp["else"] is not None else grp["end"] + 1]
            elif mode == "else":
                successors = [grp["end"] + 1]
            else:
                successors = [grp["start"], i + 1] if kind == REPEAT else [i + 1]
        edges.append([j for j in successors if j < n])
    reached, pending = set(), deque([0])
    while pending:
        index = pending.popleft()
        if index in reached or index >= n:
            continue
        reached.add(index)
        pending.extend(edges[index])
    unreachable = [i for i in range(n) if i not in reached]
    kinds = Counter(actions[i]["WFWorkflowActionIdentifier"].split(".")[-1] for i in unreachable)
    return {
        "actions_total": n,
        "structurally_reachable": len(reached),
        "unreachable": len(unreachable),
        "unreachable_kinds": dict(kinds),
        "conditional_groups": sum(g["kind"] != REPEAT for g in groups.values()),
        "repeat_groups": sum(g["kind"] == REPEAT for g in groups.values()),
        "deletion_safe": False,
        "note": "Only static reachability. Structural control markers are NOT safe to delete."
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("decoded_private_plist")
    args = parser.parse_args()
    with open(args.decoded_private_plist, "rb") as f:
        print(json.dumps(analyze(f.read()), ensure_ascii=False, indent=2))
