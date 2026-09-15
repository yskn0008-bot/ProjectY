#!/usr/bin/env python3
"""Validate the final iOS 27 native-ChatGPT Clarity Shortcut artifact."""
from __future__ import annotations

import argparse
import plistlib
import re
from pathlib import Path

SECRET_PATTERNS = (
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"BEGIN [A-Z ]*PRIVATE KEY"),
    re.compile(r"192\.168\.\d+\.\d+"),
)


def params(action: dict) -> dict:
    value = action.get("WFWorkflowActionParameters", {})
    return value if isinstance(value, dict) else {}


def custom_name(action: dict) -> str:
    value = params(action).get("CustomOutputName", "")
    return value if isinstance(value, str) else ""


def text_value(action: dict) -> str:
    value = params(action).get("WFTextActionText")
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        inner = value.get("Value")
        if isinstance(inner, dict) and isinstance(inner.get("string"), str):
            return inner["string"]
    return ""


def index_of_name(actions: list[dict], name: str) -> int:
    indexes = [i for i, action in enumerate(actions) if custom_name(action) == name]
    if len(indexes) != 1:
        raise AssertionError(f"expected one action named {name!r}, found {len(indexes)}")
    return indexes[0]


def validate(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing")

    identifiers = [str(action.get("WFWorkflowActionIdentifier", "")) for action in actions]
    serialized = repr(root)

    # Native path: exactly one Apple Shortcuts Use Model / ChatGPT action and no HTTP model gateway.
    model_actions = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.askllm"]
    if len(model_actions) != 1:
        raise AssertionError(f"expected one native askllm action, found {len(model_actions)}")
    model = params(model_actions[0])
    if model.get("FollowUp") is not False:
        raise AssertionError("ChatGPT FollowUp must be false")
    if model.get("WFGenerativeResultType") != "Dictionary":
        raise AssertionError("ChatGPT output must be Dictionary")
    if "You are Clarity, the single natural-language gateway" not in serialized:
        raise AssertionError("Clarity model contract prompt missing")

    forbidden = (
        "is.workflow.actions.downloadurl",
        "api.openai.com",
        "project-y-yos-ai.vercel.app/api/yos/intake",
        "Authorization",
        "Bearer",
        "Clarity接続トークン",
    )
    for token in forbidden:
        if token in serialized:
            raise AssertionError(f"native artifact contains forbidden cloud/API dependency: {token}")

    # Parser chain must consume a Dictionary and extract actions[].
    if sum(identifier == "is.workflow.actions.detect.dictionary" for identifier in identifiers) < 2:
        raise AssertionError("dictionary parser chain missing")
    if not any(
        params(action).get("WFDictionaryKey") == "actions"
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.getvalueforkey"
    ):
        raise AssertionError("actions[] extraction missing")

    model_index = actions.index(model_actions[0])
    inbox_saves = [
        i for i, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"
        and params(action).get("WFFileDestinationPath") == "Clarity Inbox.txt"
    ]
    if not inbox_saves or min(inbox_saves) >= model_index:
        raise AssertionError("Raw First Clarity Inbox write must occur before ChatGPT")

    # Calendar writer and readback.
    calendar = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewevent"]
    if len(calendar) != 1:
        raise AssertionError(f"expected one calendar writer, found {len(calendar)}")
    cp = params(calendar[0])
    for key in ("WFCalendarItemTitle", "WFCalendarItemStartDate", "WFCalendarItemEndDate", "WFCalendarItemNotes"):
        if key not in cp:
            raise AssertionError(f"calendar writer missing {key}")
    if cp.get("WFCalendarItemDates") is not True:
        raise AssertionError("calendar writer must set WFCalendarItemDates=true")
    if custom_name(calendar[0]) != "createdCalendarEvent" or not cp.get("UUID"):
        raise AssertionError("calendar writer output is not addressable for readback")

    # Reminder writers and current iOS wire format.
    reminders = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewreminder"]
    if len(reminders) != 2:
        raise AssertionError(f"expected timed reminder + task/shopping writer, found {len(reminders)}")
    timed_actions = [a for a in reminders if "WFAlertCustomTime" in params(a)]
    untimed_actions = [a for a in reminders if "WFAlertCustomTime" not in params(a)]
    if len(timed_actions) != 1 or len(untimed_actions) != 1:
        raise AssertionError("could not distinguish timed and untimed reminder writers")
    timed = params(timed_actions[0])
    untimed = params(untimed_actions[0])
    if timed.get("WFAlertEnabled") != "Alert" or timed.get("WFAlertTrigger") != "At Time":
        raise AssertionError("timed reminder alert configuration is invalid")
    custom_time = timed.get("WFAlertCustomTime")
    if not isinstance(custom_time, dict) or custom_time.get("WFSerializationType") != "WFTextTokenString":
        raise AssertionError("timed reminder custom time must be WFTextTokenString")
    if untimed.get("WFAlertEnabled") != "No Alert":
        raise AssertionError("task/shopping reminder must use WFAlertEnabled=No Alert")
    for rp in (timed, untimed):
        if "WFCalendarItemAlert" in rp:
            raise AssertionError("legacy boolean WFCalendarItemAlert survived")
        if "WFCalendarItemTitle" not in rp or "WFCalendarItemNotes" not in rp:
            raise AssertionError("reminder writer missing title/notes")
        if not rp.get("UUID") or not rp.get("CustomOutputName"):
            raise AssertionError("reminder writer output is not addressable for readback")

    # Destination readback must exist before APPLIED.
    calendar_props = {
        params(a).get("WFContentItemPropertyName")
        for a in actions
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.properties.calendarevents"
    }
    reminder_props = {
        params(a).get("WFContentItemPropertyName")
        for a in actions
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.properties.reminders"
    }
    if not {"Title", "Notes", "Calendar", "Start Date", "End Date"}.issubset(calendar_props):
        raise AssertionError("calendar post-write readback is incomplete")
    if not {"Title", "Notes", "List", "Has Alarms", "Due Date"}.issubset(reminder_props):
        raise AssertionError("reminder post-write readback is incomplete")

    calendar_writer_index = actions.index(calendar[0])
    timed_writer_index = actions.index(timed_actions[0])
    untimed_writer_index = actions.index(untimed_actions[0])
    calendar_applied = next((i for i, a in enumerate(actions) if "APPLIED\tcalendar" in text_value(a)), -1)
    reminder_applied = next((i for i, a in enumerate(actions) if "APPLIED\treminder" in text_value(a)), -1)
    task_applied = next((i for i, a in enumerate(actions) if "APPLIED\t" in text_value(a) and "YOS-CLARITY-ID:" in text_value(a) and i > untimed_writer_index), -1)
    if not (calendar_writer_index < index_of_name(actions, "calendarVerifiedTitle") < calendar_applied):
        raise AssertionError("calendar APPLIED can occur before readback")
    if not (timed_writer_index < index_of_name(actions, "reminderVerifiedDueDate") < reminder_applied):
        raise AssertionError("reminder APPLIED can occur before readback")
    if not (untimed_writer_index < index_of_name(actions, "task_shoppingVerifiedList") < task_applied):
        raise AssertionError("task/shopping APPLIED can occur before readback")

    # Local file persistence for raw, ledger and ideas must remain deterministic.
    saves = [params(a) for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"]
    destinations = [save.get("WFFileDestinationPath") for save in saves]
    for required in ("Clarity Inbox.txt", "Clarity Ledger.txt", "Idea in Box.txt"):
        if required not in destinations:
            raise AssertionError(f"final persistence writer missing {required}")
    if any(save.get("WFAskWhereToSave") is not False or save.get("WFSaveFileOverwrite") is not True for save in saves):
        raise AssertionError("persistence writer is not deterministic overwrite-after-merge")

    idea_saves = [
        (i, a) for i, a in enumerate(actions)
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"
        and params(a).get("WFFileDestinationPath") == "Idea in Box.txt"
    ]
    if len(idea_saves) != 1:
        raise AssertionError(f"expected one Idea in Box save, found {len(idea_saves)}")
    idea_readback = index_of_name(actions, "Verified Idea in Box contents")
    idea_applied = next((i for i, a in enumerate(actions) if "APPLIED\tIdea in Box.txt" in text_value(a)), -1)
    if not (idea_saves[0][0] < idea_readback < idea_applied):
        raise AssertionError("Idea APPLIED can occur before exact file readback")

    for marker in (
        "RAW", "EXECUTING", "APPLIED", "FAILED", "BLOCKED", "REQUEST_DONE",
        "YOS-CLARITY-ID:", "idea_file_readback_mismatch", "reminder_due_date_missing",
        "task_shopping_alert_state_mismatch",
    ):
        if marker not in serialized:
            raise AssertionError(f"missing runtime marker: {marker}")

    for pattern in SECRET_PATTERNS:
        if pattern.search(serialized):
            raise AssertionError(f"secret/private-network pattern found: {pattern.pattern}")

    print("Clarity iOS 27 native final artifact contract: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
