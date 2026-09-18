#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

REMINDER_ID = "is.workflow.actions.addnewreminder"


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    timed = 0
    untimed = 0
    for action in actions:
        if action.get("WFWorkflowActionIdentifier") != REMINDER_ID:
            continue
        params = action.get("WFWorkflowActionParameters")
        if not isinstance(params, dict):
            raise SystemExit("reminder parameters missing")

        # Current iOS Shortcuts wire format uses WFAlertEnabled string values.
        # Legacy WFCalendarItemAlert booleans can compile but are not reliable on-device.
        params.pop("WFCalendarItemAlert", None)
        if "WFAlertCustomTime" in params:
            params["WFAlertEnabled"] = "Alert"
            params["WFAlertTrigger"] = "At Time"
            timed += 1
        else:
            params["WFAlertEnabled"] = "No Alert"
            params.pop("WFAlertTrigger", None)
            untimed += 1

    if timed != 1 or untimed != 1:
        raise SystemExit(f"expected one timed + one untimed reminder writer, got timed={timed} untimed={untimed}")

    root["WFWorkflowActions"] = actions
    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    reminders = [
        a.get("WFWorkflowActionParameters", {})
        for a in verify.get("WFWorkflowActions", [])
        if a.get("WFWorkflowActionIdentifier") == REMINDER_ID
    ]
    if any("WFCalendarItemAlert" in p for p in reminders):
        raise SystemExit("legacy reminder alert boolean survived patch")
    if sorted(p.get("WFAlertEnabled") for p in reminders) != ["Alert", "No Alert"]:
        raise SystemExit("current reminder alert wire format missing")

    print("Clarity current reminder wire-format patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
