#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
import uuid
from pathlib import Path


def uid() -> str:
    return str(uuid.uuid4()).upper()


def variable_for(output_uuid: str, output_name: str) -> dict:
    return {
        "Type": "Variable",
        "Variable": {
            "Value": {
                "OutputUUID": output_uuid,
                "Type": "ActionOutput",
                "OutputName": output_name,
            },
            "WFSerializationType": "WFTextTokenAttachment",
        },
    }


def build(name: str) -> dict:
    search_uuid = uid()
    group = uid()
    return {
        "WFWorkflowName": name,
        "WFWorkflowActions": [
            {
                "WFWorkflowActionIdentifier": "is.workflow.actions.searchlocalbusinesses",
                "WFWorkflowActionParameters": {
                    "WFInput": {"isCurrentLocation": True},
                    "WFSearchQuery": "ローソン",
                    "UUID": search_uuid,
                },
            },
            {
                "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
                "WFWorkflowActionParameters": {
                    "WFInput": variable_for(search_uuid, "近くの店舗や企業"),
                    "WFControlFlowMode": 0,
                    "GroupingIdentifier": group,
                    "WFCondition": 100,
                },
            },
            {
                "WFWorkflowActionIdentifier": "is.workflow.actions.openapp",
                "WFWorkflowActionParameters": {
                    "UUID": uid(),
                    "WFAppIdentifier": "com.apple.mobilesafari",
                    "WFSelectedApp": {
                        "BundleIdentifier": "com.apple.mobilesafari",
                        "Name": "Safari",
                    },
                },
            },
            {
                "WFWorkflowActionIdentifier": "is.workflow.actions.exit",
                "WFWorkflowActionParameters": {},
            },
            {
                "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
                "WFWorkflowActionParameters": {
                    "WFControlFlowMode": 2,
                    "GroupingIdentifier": group,
                },
            },
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
        "WFWorkflowInputContentItemClasses": [
            "WFLocationContentItem", "WFStringContentItem", "WFAppContentItem"
        ],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", default="YOS PoC3 - Location Safari")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as f:
        plistlib.dump(build(args.name), f, fmt=plistlib.FMT_BINARY, sort_keys=False)
    workflow = plistlib.loads(args.output.read_bytes())
    actions = workflow["WFWorkflowActions"]
    assert [a["WFWorkflowActionIdentifier"] for a in actions] == [
        "is.workflow.actions.searchlocalbusinesses",
        "is.workflow.actions.conditional",
        "is.workflow.actions.openapp",
        "is.workflow.actions.exit",
        "is.workflow.actions.conditional",
    ]
    search_uuid = actions[0]["WFWorkflowActionParameters"]["UUID"]
    cond = actions[1]["WFWorkflowActionParameters"]
    assert cond["WFInput"]["Variable"]["Value"]["OutputUUID"] == search_uuid
    assert cond["WFInput"]["Variable"]["Value"]["OutputName"] == "近くの店舗や企業"
    assert cond["WFCondition"] == 100
    print(f"OK: {args.output}")


if __name__ == "__main__":
    main()
