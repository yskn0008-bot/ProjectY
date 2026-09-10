#!/usr/bin/env python3
"""Generate a donor-derived location shortcut with an explicit distance gate.

Synthetic PoC only: find the nearest Lawson, take the first result, measure the
direct distance from Current Location in kilometers, and open Safari when the
result is under a configurable threshold.
"""
from __future__ import annotations

import argparse
import plistlib
import uuid
from pathlib import Path


def uid() -> str:
    return str(uuid.uuid4()).upper()


def attachment(output_uuid: str, output_name: str) -> dict:
    return {
        "Value": {
            "OutputUUID": output_uuid,
            "Type": "ActionOutput",
            "OutputName": output_name,
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }


def wrapped_variable(output_uuid: str, output_name: str) -> dict:
    return {
        "Type": "Variable",
        "Variable": attachment(output_uuid, output_name),
    }


def build(threshold_km: float) -> dict:
    search_uuid = uid()
    first_uuid = uid()
    distance_uuid = uid()
    group = uid()

    actions = [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.searchlocalbusinesses",
            "WFWorkflowActionParameters": {
                "WFInput": {"isCurrentLocation": True},
                "WFSearchQuery": "ローソン",
                "UUID": search_uuid,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "WFInput": attachment(search_uuid, "近くの店舗や企業"),
                "UUID": first_uuid,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getdistance",
            "WFWorkflowActionParameters": {
                "WFGetDistanceDestination": attachment(first_uuid, "Item from List"),
                "WFGetDirectionsFrom": "Current Location",
                "WFGetDirectionsActionMode": "Direct",
                "WFDistanceUnit": "Kilometers",
                "UUID": distance_uuid,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {
                "WFInput": wrapped_variable(distance_uuid, "Distance"),
                "WFControlFlowMode": 0,
                "GroupingIdentifier": group,
                "WFCondition": 1,
                "WFNumberValue": str(threshold_km),
                "UUID": uid(),
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
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {
                "WFControlFlowMode": 2,
                "GroupingIdentifier": group,
                "UUID": uid(),
            },
        },
    ]

    return {
        "WFWorkflowName": "YOS PoC4 - Near Lawson",
        "WFWorkflowActions": actions,
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
            "WFLocationContentItem",
            "WFStringContentItem",
        ],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
    }


def validate(path: Path, threshold_km: float) -> None:
    raw = path.read_bytes()
    if not raw.startswith(b"bplist00"):
        raise ValueError("not a binary plist")
    workflow = plistlib.loads(raw)
    actions = workflow["WFWorkflowActions"]
    expected = [
        "is.workflow.actions.searchlocalbusinesses",
        "is.workflow.actions.getitemfromlist",
        "is.workflow.actions.getdistance",
        "is.workflow.actions.conditional",
        "is.workflow.actions.openapp",
        "is.workflow.actions.conditional",
    ]
    actual = [a["WFWorkflowActionIdentifier"] for a in actions]
    if actual != expected:
        raise ValueError(f"unexpected actions: {actual}")
    search_uuid = actions[0]["WFWorkflowActionParameters"]["UUID"]
    first = actions[1]["WFWorkflowActionParameters"]
    if first["WFInput"]["Value"]["OutputUUID"] != search_uuid:
        raise ValueError("first-item input is not wired to search output")
    first_uuid = first["UUID"]
    distance = actions[2]["WFWorkflowActionParameters"]
    if distance["WFGetDistanceDestination"]["Value"]["OutputUUID"] != first_uuid:
        raise ValueError("distance destination is not wired to first item")
    if distance.get("WFDistanceUnit") != "Kilometers":
        raise ValueError("distance unit is not Kilometers")
    cond = actions[3]["WFWorkflowActionParameters"]
    if cond.get("WFCondition") != 1:
        raise ValueError("distance gate must use less-than condition")
    if cond.get("WFNumberValue") != str(threshold_km):
        raise ValueError("unexpected distance threshold")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threshold-km", type=float, default=100.0)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("wb") as f:
        plistlib.dump(build(args.threshold_km), f, fmt=plistlib.FMT_BINARY, sort_keys=False)
    validate(args.output, args.threshold_km)
    print(f"OK: {args.output}; threshold={args.threshold_km} km")


if __name__ == "__main__":
    main()
