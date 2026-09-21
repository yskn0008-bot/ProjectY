#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import plistlib
import sys
import uuid
from pathlib import Path

APP_ALLOWLIST = {
    "safari": ("Safari", "com.apple.mobilesafari"),
    "shortcuts": ("ショートカット", "com.apple.shortcuts"),
}

def new_uuid() -> str:
    return str(uuid.uuid4()).upper()

def load_definition(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != "1.0":
        raise ValueError("unsupported schema_version")
    if not isinstance(data.get("name"), str) or not data["name"].strip():
        raise ValueError("name is required")
    actions = data.get("actions")
    if not isinstance(actions, list) or not actions:
        raise ValueError("actions must be a non-empty list")
    return data

def compile_action(item: dict) -> dict:
    if item.get("type") != "open_app":
        raise ValueError(f"unsupported action type: {item.get('type')!r}")
    key = str(item.get("app", "")).strip().lower()
    if key not in APP_ALLOWLIST:
        raise ValueError(f"unsupported app: {key!r}")
    display_name, bundle_id = APP_ALLOWLIST[key]
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.openapp",
        "WFWorkflowActionParameters": {
            "UUID": new_uuid(),
            "WFAppIdentifier": bundle_id,
            "WFSelectedApp": {
                "BundleIdentifier": bundle_id,
                "Name": display_name,
            },
        },
    }

def build_workflow(definition: dict) -> dict:
    return {
        "WFWorkflowName": definition["name"].strip(),
        "WFWorkflowActions": [compile_action(x) for x in definition["actions"]],
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

def validate_output(path: Path, definition: dict) -> None:
    raw = path.read_bytes()
    if not raw.startswith(b"bplist00"):
        raise ValueError("compiled output is not a binary plist")
    root = plistlib.loads(raw)
    if root.get("WFWorkflowName") != definition["name"].strip():
        raise ValueError("workflow name mismatch")
    actual = root.get("WFWorkflowActions")
    expected_count = len(definition["actions"])
    if not isinstance(actual, list) or len(actual) != expected_count:
        raise ValueError(f"action count mismatch: expected {expected_count}")
    for action in actual:
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.openapp":
            raise ValueError("unexpected compiled action identifier")

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--definition", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        definition = load_definition(args.definition)
        workflow = build_workflow(definition)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("wb") as fh:
            plistlib.dump(workflow, fh, fmt=plistlib.FMT_BINARY, sort_keys=False)
        validate_output(args.output, definition)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(f"PASS: compiled {args.output} ({args.output.stat().st_size} bytes)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
