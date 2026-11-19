#!/usr/bin/env python3
"""Verify the single native Scriptable action of YOS Shopping 起動.

No URL, browser, output preview, embedded Notion credential or copied shopping
JavaScript is allowed. This shortcut only runs the existing iPhone Scriptable.
"""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

IDENTIFIER = "dk.simonbs.Scriptable.ParameterizedRunScriptIntent"
SCRIPT = "YOS Shopping"
SHORTCUT = "YOS Shopping 起動"


def verify(path: Path) -> None:
    data = plistlib.loads(path.read_bytes())
    actions = data.get("WFWorkflowActions")
    if not isinstance(actions, list) or len(actions) != 1:
        raise AssertionError(f"Only one Scriptable Run Script action allowed: {actions!r}")
    action = actions[0]
    if action.get("WFWorkflowActionIdentifier") != IDENTIFIER:
        raise AssertionError(f"Wrong native action: {action!r}")
    p = action.get("WFWorkflowActionParameters", {})
    name = p.get("fileName")
    # Cherri rawAction may encode a constant text field as a text-token string.
    if isinstance(name, dict):
        name = name.get("Value", {}).get("string")
    if name != SCRIPT:
        raise AssertionError(f"Wrong Scriptable target: {name!r}")
    if p.get("runInApp") is not True:
        raise AssertionError(f"Run In App must be true: {p!r}")
    if p.get("ShowWhenRun", False) is not False:
        raise AssertionError("Interactive shortcut must not show a Shortcuts preview")
    if any(x in str(data).lower() for x in (
        "scriptable:///run", "open.scriptable.app", "is.workflow.actions.openurl",
        "is.workflow.actions.quicklook", "is.workflow.actions.showresult",
        "yos_notion_integration_token", "api.notion.com", "vercel.app"
    )):
        raise AssertionError("Embedded URL/API/credential or preview detected")
    if len(data.get("WFWorkflowImportQuestions", [])) != 0:
        raise AssertionError("An install question was accidentally added")
    print(f"Native Scriptable '{SHORTCUT}' -> '{SCRIPT}' (runInApp=true): PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("plist", type=Path)
    verify(parser.parse_args().plist)
