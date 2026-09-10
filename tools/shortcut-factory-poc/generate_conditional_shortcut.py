#!/usr/bin/env python3
"""Generate a deterministic If/Otherwise Shortcut for YOS Automation Factory PoC2."""

from __future__ import annotations

import argparse
import plistlib
import sys
import uuid
from pathlib import Path


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


def build_workflow(name: str) -> dict:
    text_uuid = new_uuid()
    group_uuid = new_uuid()

    text_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": text_uuid,
            "WFTextActionText": "YES",
        },
    }

    if_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group_uuid,
            "WFControlFlowMode": 0,
            "WFCondition": 4,
            "WFConditionalActionString": "YES",
            "WFInput": {
                "Type": "Variable",
                "Variable": {
                    "Value": {
                        "OutputUUID": text_uuid,
                        "Type": "ActionOutput",
                        "OutputName": "Text",
                    },
                    "WFSerializationType": "WFTextTokenAttachment",
                },
            },
        },
    }

    open_safari = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.openapp",
        "WFWorkflowActionParameters": {
            "UUID": new_uuid(),
            "WFAppIdentifier": "com.apple.mobilesafari",
            "WFSelectedApp": {
                "BundleIdentifier": "com.apple.mobilesafari",
                "Name": "Safari",
            },
        },
    }

    otherwise_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group_uuid,
            "WFControlFlowMode": 1,
        },
    }

    end_if_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group_uuid,
            "WFControlFlowMode": 2,
        },
    }

    return {
        "WFWorkflowName": name,
        "WFWorkflowActions": [
            text_action,
            if_action,
            open_safari,
            otherwise_action,
            end_if_action,
        ],
        "WFWorkflowClientVersion": "2607.1.3",
        "WFWorkflowClientRelease": "26.0",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 463140863,
            "WFWorkflowIconGlyphNumber": 59511,
        },
        "WFWorkflowImportQuestions": [],
        "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
    }


def validate(path: Path) -> None:
    raw = path.read_bytes()
    if not raw.startswith(b"bplist00"):
        raise ValueError("not a binary plist")
    workflow = plistlib.loads(raw)
    actions = workflow.get("WFWorkflowActions", [])
    if len(actions) != 5:
        raise ValueError("expected 5 actions")
    ids = [a.get("WFWorkflowActionIdentifier") for a in actions]
    if ids != [
        "is.workflow.actions.gettext",
        "is.workflow.actions.conditional",
        "is.workflow.actions.openapp",
        "is.workflow.actions.conditional",
        "is.workflow.actions.conditional",
    ]:
        raise ValueError(f"unexpected actions: {ids}")
    modes = [actions[i]["WFWorkflowActionParameters"].get("WFControlFlowMode") for i in (1, 3, 4)]
    if modes != [0, 1, 2]:
        raise ValueError(f"unexpected control-flow modes: {modes}")
    groups = [actions[i]["WFWorkflowActionParameters"].get("GroupingIdentifier") for i in (1, 3, 4)]
    if len(set(groups)) != 1:
        raise ValueError("conditional group identifiers do not match")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", default="YOS PoC2 - If Safari")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    try:
        if not args.validate_only:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("wb") as fh:
                plistlib.dump(build_workflow(args.name), fh, fmt=plistlib.FMT_BINARY, sort_keys=False)
        validate(args.output)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"OK: {args.output} conditional structure is valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
