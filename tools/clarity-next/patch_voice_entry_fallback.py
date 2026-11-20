#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path


def params(action: dict) -> dict:
    value = action.get("WFWorkflowActionParameters", {})
    return value if isinstance(value, dict) else {}


def variable_names(value: object) -> set[str]:
    names: set[str] = set()

    def walk(node: object) -> None:
        if isinstance(node, dict):
            name = node.get("VariableName")
            if isinstance(name, str):
                names.add(name)
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(value)
    return names


def shortcut_input() -> dict:
    # Bind the If action directly to the native Shortcut Input magic variable.
    # Do not test a Text action that merely contains Shortcut Input: on iPhone,
    # an empty Text action can still count as "has a value" and skip dictation.
    return {
        "Type": "Variable",
        "Variable": {
            "Value": {
                "Type": "ExtensionInput",
                "VariableName": "ShortcutInput",
            },
            "WFSerializationType": "WFTextTokenAttachment",
        },
    }


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    incoming_gate = None
    voice_fallback_gate = None

    for action in actions:
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        p = params(action)
        if p.get("WFControlFlowMode") != 0:
            continue
        refs = variable_names(p.get("WFInput"))
        if p.get("WFCondition") == 100 and refs == {"incoming"}:
            incoming_gate = p
        if p.get("WFCondition") == 101 and refs == {"resolvedInput"}:
            voice_fallback_gate = p

    if incoming_gate is None:
        raise SystemExit("incoming Shortcut Input gate not found")
    if voice_fallback_gate is None:
        raise SystemExit("voice fallback gate not found")

    incoming_gate["WFInput"] = shortcut_input()
    voice_fallback_gate["WFInput"] = shortcut_input()

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)

    direct = []
    for action in verify["WFWorkflowActions"]:
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        p = params(action)
        if p.get("WFControlFlowMode") != 0:
            continue
        if "ExtensionInput" in repr(p.get("WFInput")) and "ShortcutInput" in repr(p.get("WFInput")):
            direct.append(p.get("WFCondition"))

    if 100 not in direct or 101 not in direct:
        raise SystemExit(f"native Shortcut Input gates missing: {direct!r}")

    print("Clarity Next native Shortcut Input voice fallback patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
