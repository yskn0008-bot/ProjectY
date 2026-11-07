#!/usr/bin/env python3
"""Check a narrow local-only Clarity.Voice optimization delta.

Private Shortcut plists MUST NOT be committed or uploaded. Static equality is
not a runtime/performance test; this tool produces no signed shortcut.
"""
import argparse
import json
import plistlib
from pathlib import Path

NOP = "is.workflow.actions.nothing"
STOP = "is.workflow.actions.exit"
URLS = ["is.workflow.actions.urlencode",
        "is.workflow.actions.gettext", "is.workflow.actions.openurl"]
LEGACY = ["is.workflow.actions.location",
          "is.workflow.actions.searchmaps", NOP]


def audit(reference: bytes, candidate: bytes):
    if reference.startswith(b"AEA1") or candidate.startswith(b"AEA1"):
        raise ValueError("Decode signed Shortcut locally before audit")
    original = plistlib.loads(reference)
    proposed = plistlib.loads(candidate)
    if not isinstance(original, dict) or not isinstance(proposed, dict):
        raise ValueError("Invalid Shortcut plist")
    if {k: v for k, v in original.items() if k != "WFWorkflowActions"} != {
        k: v for k, v in proposed.items() if k != "WFWorkflowActions"
    }:
        raise ValueError("Workflow metadata changed")
    old = original["WFWorkflowActions"]
    new = proposed["WFWorkflowActions"]
    drops = [j for j in range(1, len(old))
             if old[j]["WFWorkflowActionIdentifier"] == NOP
             and old[j-1]["WFWorkflowActionIdentifier"] == STOP]
    for j in drops:
        uid = old[j].get("WFWorkflowActionParameters", {}).get("UUID")
        if uid and any(uid in str(item.get("WFWorkflowActionParameters", {}))
                       for i, item in enumerate(old) if i != j):
            raise ValueError(f"Unexpected consumer for removed no-op #{j+1}")
    removed = set(drops)
    expected = [item for i, item in enumerate(old) if i not in removed]
    if len(expected) != len(new):
        raise ValueError("Unexpected action count")
    candidates = []
    for i in range(len(new) - 2):
        before = [a["WFWorkflowActionIdentifier"] for a in expected[i:i+3]]
        after = [a["WFWorkflowActionIdentifier"] for a in new[i:i+3]]
        if before not in (URLS, LEGACY) or after != URLS:
            continue
        if expected[i:i+3] == new[i:i+3]:
            continue
        if all(expected[j] == new[j] for j in range(len(new))
               if not i <= j < i + 3):
            candidates.append(i)
    if len(candidates) != 1:
        raise ValueError("Unexpected changes outside one navigation triplet")
    return {
        "reference_actions": len(old),
        "candidate_actions": len(new),
        "unchanged_actions": len(new) - 3,
        "deleted_unreachable_noops": len(drops),
        "navigation_replacements": 1,
        "static_equality_pass": True,
        "iphone_tested": False,
        "warning": "No proof of behavior preservation or real-time speedup",
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("reference", type=Path)
    ap.add_argument("candidate", type=Path)
    args = ap.parse_args()
    print(json.dumps(
        audit(args.reference.read_bytes(), args.candidate.read_bytes()),
        ensure_ascii=False, indent=2,
    ))
