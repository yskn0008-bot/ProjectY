#!/usr/bin/env python3
"""Privacy-safe static route-length audit of a decoded Shortcut plist.

Counts possible executed actions up to the first model invocation; does not
measure milliseconds, execute actions, or disclose workflow parameters.
Never send the user's private Shortcut plist to public GitHub.
"""
import argparse
import json
import plistlib
from functools import lru_cache
from pathlib import Path

IF = "is.workflow.actions.conditional"
STOP = "is.workflow.actions.exit"
MODEL = "is.workflow.actions.askllm"
SCRIPTABLE = "dk.simonbs.Scriptable.RunScriptInlineIntent"


def profile(raw: bytes) -> dict:
    if raw.startswith(b"AEA1"):
        raise ValueError("Signed Shortcut: decode privately first")
    data = plistlib.loads(raw)
    if not isinstance(data, dict) or not isinstance(data.get("WFWorkflowActions"), list):
        raise ValueError("Invalid shortcut plist")
    actions = data["WFWorkflowActions"]
    models = [i for i, action in enumerate(actions)
              if action["WFWorkflowActionIdentifier"] == MODEL]
    if len(models) != 1:
        raise ValueError("Expected exactly one model call")
    limit = models[0]
    before = actions[:limit]
    groups, modes, stack = {}, {}, []
    for i, action in enumerate(before):
        if action["WFWorkflowActionIdentifier"] != IF:
            continue
        p = action["WFWorkflowActionParameters"]
        group, mode = p.get("GroupingIdentifier"), p.get("WFControlFlowMode")
        if not group or mode not in (0, 1, 2):
            raise ValueError("Unexpected conditional")
        if mode == 0:
            if group in groups:
                raise ValueError("Duplicate group")
            stack.append(group)
            groups[group] = {"begin": i, "otherwise": None, "end": None}
        elif mode == 1:
            if not stack or stack[-1] != group or groups[group]["otherwise"] is not None:
                raise ValueError("Invalid otherwise")
            groups[group]["otherwise"] = i
        else:
            if not stack or stack[-1] != group:
                raise ValueError("Non-nested conditional")
            groups[group]["end"] = i
            stack.pop()
        modes[i] = (group, mode)
    if stack:
        raise ValueError("Unbalanced conditionals before model")
    edges = {}
    for i, action in enumerate(before):
        identifier = action["WFWorkflowActionIdentifier"]
        if identifier == STOP:
            edges[i] = []
        elif identifier == IF:
            group, mode = modes[i]
            item = groups[group]
            if mode == 0:
                other = item["otherwise"]
                edges[i] = [i + 1, (other + 1 if other is not None else item["end"] + 1)]
            elif mode == 1:
                edges[i] = [item["end"] + 1]
            else:
                edges[i] = [i + 1]
        elif identifier == "is.workflow.actions.repeat.each":
            raise ValueError("Pre-model loop requires bounded iteration analysis")
        else:
            edges[i] = [i + 1]

    @lru_cache(None)
    def to_model(i):
        if i == limit:
            return (0, 0)
        if i > limit:
            return None
        descendants = [to_model(j) for j in edges[i]]
        live = [x for x in descendants if x is not None]
        if not live:
            return None
        return (1 + min(v[0] for v in live), 1 + max(v[1] for v in live))

    lengths = to_model(0)
    if lengths is None:
        raise ValueError("Model unreachable")
    visited, queue, exits = set(), [0], []
    while queue:
        i = queue.pop()
        if i in visited or i >= limit:
            continue
        visited.add(i)
        if before[i]["WFWorkflowActionIdentifier"] == STOP:
            exits.append(i + 1)
        queue.extend(edges[i])
    return {
        "total_actions": len(actions),
        "pre_model_declared_actions": limit,
        "reachable_pre_model_actions": len(visited),
        "shortest_path_actions_before_model": lengths[0],
        "longest_path_actions_before_model": lengths[1],
        "early_exit_positions_1based": sorted(exits),
        "conditional_groups_before_model": len(groups),
        "model_position_1based": limit + 1,
        "scriptable_action_count":
            sum(x["WFWorkflowActionIdentifier"] == SCRIPTABLE for x in actions),
        "warning": "Static action counts, not elapsed time; conditions may be mutually exclusive",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    print(json.dumps(profile(args.file.read_bytes()), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
