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
    serialized = repr(root)

    # Execution child only. UNDERSTAND stays in the parent physical Clarity Demo.
    if "is.workflow.actions.askllm" in ids:
        raise AssertionError("executor child must not contain Use Model")
    if "is.workflow.actions.dictatetext" in ids:
        raise AssertionError("executor child must not contain Dictate Text")

    if ids.count("is.workflow.actions.addnewevent") != 1:
        raise AssertionError("Calendar writer missing")
    if ids.count("is.workflow.actions.addnewreminder") != 2:
        raise AssertionError("Reminder/Shopping writers missing")

    if ids.count("is.workflow.actions.properties.calendarevents") < 5:
        raise AssertionError("Calendar readback verification missing")
    if ids.count("is.workflow.actions.properties.reminders") < 9:
        raise AssertionError("Reminder/Shopping readback verification missing")

    calendar = next(
        a for a in actions
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewevent"
    )
    if params(calendar).get("WFCalendarItemDates") is not True:
        raise AssertionError("Calendar date-enable flag missing")

    saves = [
        params(a)
        for a in actions
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"
    ]
    destinations = {s.get("WFFileDestinationPath") for s in saves}
    for required in ("Clarity Ledger.txt", "Idea in Box.txt"):
        if required not in destinations:
            raise AssertionError(f"missing persistence destination {required}")

    if "Money" not in serialized or "MONEY_UNVERIFIED" not in serialized:
        raise AssertionError("Money child verification contract missing")
    if "CLARITY_EXECUTE_ACTIONS_PASS" not in serialized:
        raise AssertionError("success contract missing")
    if "UNREGISTERED_MODULE" not in serialized:
        raise AssertionError("unknown-module fail-closed contract missing")

    for marker in (
        "EXECUTING",
        "APPLIED",
        "FAILED",
        "BLOCKED",
        "REQUEST_DONE",
        "calendarVerifiedTitle",
        "reminderVerifiedDueDate",
        "task_shoppingVerifiedList",
        "Verified Idea in Box contents",
        "YOS-CLARITY-ID:",
    ):
        if marker not in serialized:
            raise AssertionError(f"missing runtime marker {marker}")

    print("Clarity Execute Actions contract: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
