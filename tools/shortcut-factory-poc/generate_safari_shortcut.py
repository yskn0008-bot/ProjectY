#!/usr/bin/env python3
"""Generate the smallest useful YOS Shortcut Factory PoC.

The output is an unsigned Apple Shortcuts plist containing one action:
Open Safari.  Apple does not publish the .shortcut plist schema; the fields
below intentionally stay minimal and are validated before signing in CI.
"""

from __future__ import annotations

import argparse
import plistlib
import sys
import uuid
from pathlib import Path


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


def build_workflow(name: str) -> dict:
    return {
        "WFWorkflowName": name,
        "WFWorkflowActions": [
            {
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
            "WFAppContentItem",
            "WFStringContentItem",
        ],
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowTypes": [],
        "WFQuickActionSurfaces": [],
        "WFWorkflowHasOutputFallback": False,
        "WFWorkflowHasShortcutInputVariables": False,
    }


def write_shortcut(path: Path, name: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as fh:
        plistlib.dump(build_workflow(name), fh, fmt=plistlib.FMT_BINARY, sort_keys=False)


def validate_shortcut(path: Path) -> None:
    raw = path.read_bytes()
    if not raw.startswith(b"bplist00"):
        raise ValueError("output is not a binary plist (missing bplist00 header)")

    workflow = plistlib.loads(raw)
    actions = workflow.get("WFWorkflowActions")
    if not isinstance(actions, list) or len(actions) != 1:
        raise ValueError("expected exactly one workflow action")

    action = actions[0]
    if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.openapp":
        raise ValueError("expected Open App action")

    params = action.get("WFWorkflowActionParameters", {})
    if params.get("WFAppIdentifier") != "com.apple.mobilesafari":
        raise ValueError("expected Safari bundle identifier")
    if params.get("WFSelectedApp", {}).get("BundleIdentifier") != "com.apple.mobilesafari":
        raise ValueError("expected Safari selected-app metadata")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--name", default="YOS PoC - Safari")
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    try:
        if not args.validate_only:
            write_shortcut(args.output, args.name)
        validate_shortcut(args.output)
    except Exception as exc:  # CI should show a compact actionable error.
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"OK: {args.output} is a valid PoC plist")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
