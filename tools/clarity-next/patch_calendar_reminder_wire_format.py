#!/usr/bin/env python3
"""Normalize Clarity Next Calendar/Reminder wire format for current iPhone Shortcuts."""

from __future__ import annotations
import argparse
import copy
import plistlib
from pathlib import Path

CALENDAR = "is.workflow.actions.addnewevent"
REMINDER = "is.workflow.actions.addnewreminder"

def token_string_from_attachment(value: dict) -> dict:
    if value.get("WFSerializationType") != "WFTextTokenAttachment":
        return value
    ref = value.get("Value")
    if not isinstance(ref, dict):
        raise SystemExit("invalid token attachment")
    return {
        "Value": {
            "string": "\ufffc",
            "attachmentsByRange": {
                "{0, 1}": copy.deepcopy(ref),
            },
        },
        "WFSerializationType": "WFTextTokenString",
    }

def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    calendars = 0
    timed_reminders = 0

    for action in actions:
        ident = action.get("WFWorkflowActionIdentifier")
        params = action.get("WFWorkflowActionParameters")
        if not isinstance(params, dict):
            continue

        if ident == CALENDAR:
            calendars += 1
            params["WFCalendarItemDates"] = True
            for key in ("WFCalendarItemStartDate", "WFCalendarItemEndDate"):
                value = params.get(key)
                if not isinstance(value, dict):
                    raise SystemExit(f"calendar writer missing {key}")
                params[key] = token_string_from_attachment(value)
                if params[key].get("WFSerializationType") != "WFTextTokenString":
                    raise SystemExit(f"calendar {key} not normalized to token string")

        if ident == REMINDER and "WFAlertCustomTime" in params:
            timed_reminders += 1
            params.pop("WFCalendarItemAlert", None)
            params["WFAlertEnabled"] = "Alert"
            params["WFAlertTrigger"] = "At Time"
            value = params.get("WFAlertCustomTime")
            if not isinstance(value, dict):
                raise SystemExit("timed reminder custom time missing")
            params["WFAlertCustomTime"] = token_string_from_attachment(value)
            if params["WFAlertCustomTime"].get("WFSerializationType") != "WFTextTokenString":
                raise SystemExit("reminder custom time not normalized to token string")

    if calendars != 1:
        raise SystemExit(f"expected exactly one calendar writer, found {calendars}")
    if timed_reminders != 1:
        raise SystemExit(f"expected exactly one timed reminder writer, found {timed_reminders}")

    root["WFWorkflowActions"] = actions
    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    final = verify.get("WFWorkflowActions", [])
    cal = [a.get("WFWorkflowActionParameters", {}) for a in final if a.get("WFWorkflowActionIdentifier") == CALENDAR]
    rem = [
        a.get("WFWorkflowActionParameters", {})
        for a in final
        if a.get("WFWorkflowActionIdentifier") == REMINDER
        and "WFAlertCustomTime" in a.get("WFWorkflowActionParameters", {})
    ]

    if cal[0].get("WFCalendarItemDates") is not True:
        raise SystemExit("calendar date-enable flag missing")
    for key in ("WFCalendarItemStartDate", "WFCalendarItemEndDate"):
        if cal[0].get(key, {}).get("WFSerializationType") != "WFTextTokenString":
            raise SystemExit(f"calendar {key} failed verification")
    if rem[0].get("WFAlertEnabled") != "Alert":
        raise SystemExit("reminder alert wire format missing")
    if rem[0].get("WFAlertCustomTime", {}).get("WFSerializationType") != "WFTextTokenString":
        raise SystemExit("reminder custom-time failed verification")

    print("Clarity Next Calendar/Reminder wire-format patch: PASS")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("shortcut", type=Path)
    args = ap.parse_args()
    patch(args.shortcut)
