#!/usr/bin/env python3
"""Build the native YOS Weight iOS Shortcut (unsigned). No runtime health data here.

Uses existing ProjectY HubSign boundary for signing. iPhone Health permissions are
requested by iOS on first actual run, not in this generator.
"""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

SHORTCUT_NAME = "YOS 体重"
ASK_UUID = str(uuid5(NAMESPACE_URL, "projecty/yos-weight/ask/v1")).upper()
LOG_UUID = str(uuid5(NAMESPACE_URL, "projecty/yos-weight/log-health/v1")).upper()


def make_shortcut() -> dict:
    ask = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
        "WFWorkflowActionParameters": {
            "UUID": ASK_UUID,
            "WFAskActionPrompt": "体重を入力（kg）",
            "WFInputType": "Number",
        },
    }
    quantity = {
        "WFSerializationType": "WFQuantityFieldValue",
        "Value": {
            "Magnitude": {
                "WFSerializationType": "WFTextTokenAttachment",
                "Value": {
                    "Type": "ActionOutput",
                    "OutputUUID": ASK_UUID,
                    "OutputName": "Provided Input",
                },
            },
            "Unit": "kg",
        },
    }
    log = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.health.quantity.log",
        "WFWorkflowActionParameters": {
            "UUID": LOG_UUID,
            "WFQuantitySampleType": "Weight",
            "WFQuantitySampleQuantity": quantity,
            "WFQuantitySampleDate": {
                "WFSerializationType": "WFTextTokenAttachment",
                "Value": {"Type": "CurrentDate"},
            },
        },
    }
    return {
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 2071128575,
            "WFWorkflowIconGlyphNumber": 61440,
        },
        "WFWorkflowClientVersion": "5037.109",
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowActions": [ask, log],
        "WFWorkflowInputContentItemClasses": ["WFNumberContentItem", "WFStringContentItem"],
        "WFWorkflowImportQuestions": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowTypes": ["WFWorkflowTypeShowInSearch"],
        "WFWorkflowHasShortcutInputVariables": False,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(plistlib.dumps(make_shortcut(), sort_keys=False))
    actual = plistlib.loads(args.output.read_bytes())
    if actual != make_shortcut():
        raise RuntimeError("plist did not round-trip")
    print(f"Created unsigned {SHORTCUT_NAME}: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
