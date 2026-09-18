#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path


def params(action: dict) -> dict:
    value = action.get("WFWorkflowActionParameters", {})
    return value if isinstance(value, dict) else {}


def validate(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing")

    ids = [str(a.get("WFWorkflowActionIdentifier", "")) for a in actions]

    if ids.count("is.workflow.actions.askllm") != 1:
        raise AssertionError("direct E2E must contain exactly one Use Model / ChatGPT action")
    if "is.workflow.actions.downloadurl" in ids:
        raise AssertionError("direct E2E must not use the server model gateway")

    if ids.count("is.workflow.actions.addnewevent") != 1:
        raise AssertionError("calendar executor missing")
    if ids.count("is.workflow.actions.addnewreminder") != 2:
        raise AssertionError("reminder/shopping executors missing")

    calendar = next(a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewevent")
    cp = params(calendar)
    if cp.get("WFCalendarItemDates") is not True:
        raise AssertionError("calendar date-enable flag missing")
    if not cp.get("CustomOutputName"):
        raise AssertionError("calendar writer must expose output for verification")

    reminders = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewreminder"]
    if not all(params(a).get("CustomOutputName") for a in reminders):
        raise AssertionError("reminder writers must expose outputs for verification")

    if ids.count("is.workflow.actions.properties.calendarevents") < 5:
        raise AssertionError("calendar readback verification missing")
    if ids.count("is.workflow.actions.properties.reminders") < 9:
        raise AssertionError("reminder readback verification missing")

    saves = [
        params(a)
        for a in actions
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"
    ]
    destinations = {s.get("WFFileDestinationPath") for s in saves}
    for required in ("Clarity Inbox.txt", "Clarity Ledger.txt", "Idea in Box.txt"):
        if required not in destinations:
            raise AssertionError(f"missing local persistence destination: {required}")

    serialized = repr(root)
    for marker in (
        "RAW",
        "EXECUTING",
        "APPLIED",
        "FAILED",
        "REQUEST_DONE",
        "calendarVerifiedTitle",
        "task_shoppingVerifiedList",
        "Verified Idea in Box contents",
        "YOS-CLARITY-ID:",
    ):
        if marker not in serialized:
            raise AssertionError(f"missing verification marker: {marker}")

    print("Clarity Direct E2E artifact contract: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
