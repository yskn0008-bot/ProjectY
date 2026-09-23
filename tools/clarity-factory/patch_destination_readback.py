#!/usr/bin/env python3
"""Harden final iPhone destination writes and verify them before APPLIED.

This patch runs after the existing Cherri/postcompile transformations. It fixes
wire-format fields that current Shortcuts expects and adds independent readback
checks for Calendar, Reminders/Shopping, and Idea in Box. If a destination action
returns an object whose title/notes/destination/date state cannot be read back,
or if the Idea file does not exactly match the text handed to Save File, Clarity
writes FAILED to the Ledger and stops before the existing APPLIED record.
"""
from __future__ import annotations

import argparse
import copy
import plistlib
import uuid
from pathlib import Path

CALENDAR_WRITER = "is.workflow.actions.addnewevent"
REMINDER_WRITER = "is.workflow.actions.addnewreminder"
CALENDAR_DETAILS = "is.workflow.actions.properties.calendarevents"
REMINDER_DETAILS = "is.workflow.actions.properties.reminders"


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


def output_ref(uid: str, name: str) -> dict:
    return {"OutputUUID": uid, "Type": "ActionOutput", "OutputName": name}


def attachment(uid: str, name: str) -> dict:
    return {
        "Value": output_ref(uid, name),
        "WFSerializationType": "WFTextTokenAttachment",
    }


def variable_input(uid: str, name: str) -> dict:
    return {"Type": "Variable", "Variable": attachment(uid, name)}


def token_string_from_ref(ref: dict) -> dict:
    return {
        "Value": {
            "string": "\ufffc",
            "attachmentsByRange": {"{0, 1}": copy.deepcopy(ref)},
        },
        "WFSerializationType": "WFTextTokenString",
    }


def find_output_ref(root: object, name: str) -> dict:
    def walk(value: object) -> dict | None:
        if isinstance(value, dict):
            if (
                value.get("Type") == "ActionOutput"
                and value.get("OutputName") == name
                and isinstance(value.get("OutputUUID"), str)
            ):
                return value
            for child in value.values():
                found = walk(child)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = walk(child)
                if found:
                    return found
        return None

    found = walk(root)
    if not found:
        raise SystemExit(f"missing ActionOutput {name}")
    return copy.deepcopy(found)


def ledger_failure_actions(request_ref: dict, action_ref: dict, reason: str) -> list[dict]:
    record_uuid = new_uuid()
    file_uuid = new_uuid()
    existing_uuid = new_uuid()
    updated_uuid = new_uuid()
    save_uuid = new_uuid()
    safe_reason = reason.replace("\t", "_").replace("\n", "_")
    record_name = f"verificationFailure_{record_uuid[:8]}"
    return [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": record_uuid,
                "CustomOutputName": record_name,
                "WFTextActionText": {
                    "Value": {
                        "string": f"\ufffc\t\ufffc\t\ufffc\tFAILED\t{safe_reason}\n",
                        "attachmentsByRange": {
                            "{0, 1}": {"Type": "CurrentDate", "VariableName": "CurrentDate"},
                            "{2, 1}": copy.deepcopy(request_ref),
                            "{4, 1}": copy.deepcopy(action_ref),
                        },
                    },
                    "WFSerializationType": "WFTextTokenString",
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.documentpicker.open",
            "WFWorkflowActionParameters": {
                "UUID": file_uuid,
                "CustomOutputName": "Current Clarity Ledger.txt",
                "WFGetFilePath": "Clarity Ledger.txt",
                "WFFileErrorIfNotFound": True,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.detect.text",
            "WFWorkflowActionParameters": {
                "UUID": existing_uuid,
                "CustomOutputName": "Existing Clarity Ledger.txt",
                "WFInput": attachment(file_uuid, "Current Clarity Ledger.txt"),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": updated_uuid,
                "CustomOutputName": "Updated Clarity Ledger.txt",
                "WFTextActionText": {
                    "Value": {
                        "string": "\ufffc\ufffc",
                        "attachmentsByRange": {
                            "{0, 1}": output_ref(existing_uuid, "Existing Clarity Ledger.txt"),
                            "{1, 1}": output_ref(record_uuid, record_name),
                        },
                    },
                    "WFSerializationType": "WFTextTokenString",
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.documentpicker.save",
            "WFWorkflowActionParameters": {
                "UUID": save_uuid,
                "WFAskWhereToSave": False,
                "WFFileDestinationPath": "Clarity Ledger.txt",
                "WFInput": attachment(updated_uuid, "Updated Clarity Ledger.txt"),
                "WFSaveFileOverwrite": True,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.output",
            "WFWorkflowActionParameters": {
                "WFNoOutputSurfaceBehavior": "Respond",
                "WFOutput": "登録確認に失敗しました",
                "WFResponse": "登録先へ実際に保存されたことを確認できなかったため停止しました",
            },
        },
    ]


def verification_guard(
    source_uuid: str,
    source_name: str,
    condition: int,
    expected: object | None,
    failure: list[dict],
) -> list[dict]:
    group = new_uuid()
    opener = {
        "GroupingIdentifier": group,
        "WFControlFlowMode": 0,
        "WFCondition": condition,
        "WFInput": variable_input(source_uuid, source_name),
    }
    if expected is not None:
        opener["WFConditionalActionString"] = copy.deepcopy(expected)
    return [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": opener,
        },
        {"WFWorkflowActionIdentifier": "is.workflow.actions.nothing", "WFWorkflowActionParameters": {}},
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {"GroupingIdentifier": group, "WFControlFlowMode": 1},
        },
        *failure,
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {
                "GroupingIdentifier": group,
                "WFControlFlowMode": 2,
                "UUID": new_uuid(),
            },
        },
        {"WFWorkflowActionIdentifier": "is.workflow.actions.nothing", "WFWorkflowActionParameters": {}},
    ]


def detail_action(
    identifier: str,
    writer_uuid: str,
    writer_name: str,
    property_name: str,
    output_name: str,
) -> tuple[str, dict]:
    uid = new_uuid()
    return uid, {
        "WFWorkflowActionIdentifier": identifier,
        "WFWorkflowActionParameters": {
            "UUID": uid,
            "CustomOutputName": output_name,
            "WFInput": attachment(writer_uuid, writer_name),
            "WFContentItemPropertyName": property_name,
        },
    }


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    request_ref = find_output_ref(actions, "requestNumber")
    action_ref = find_output_ref(actions, "actionId")
    content_ref = find_output_ref(actions, "content")

    writers: list[tuple[int, str, dict]] = []
    for index, action in enumerate(actions):
        identifier = action.get("WFWorkflowActionIdentifier")
        params = action.get("WFWorkflowActionParameters", {})
        if identifier == CALENDAR_WRITER:
            writers.append((index, "calendar", action))
        elif identifier == REMINDER_WRITER:
            kind = "reminder" if "WFAlertCustomTime" in params else "task_shopping"
            writers.append((index, kind, action))

    if [entry[1] for entry in writers] != ["calendar", "reminder", "task_shopping"]:
        raise SystemExit(f"unexpected destination writers: {[entry[1] for entry in writers]}")

    # Work from the end so original indexes stay valid while inserting readbacks.
    for index, kind, writer in reversed(writers):
        params = writer.setdefault("WFWorkflowActionParameters", {})
        writer_uuid = params.setdefault("UUID", new_uuid())
        writer_name = {
            "calendar": "createdCalendarEvent",
            "reminder": "createdTimedReminder",
            "task_shopping": "createdTaskOrShoppingReminder",
        }[kind]
        params["CustomOutputName"] = writer_name

        # In the current Shortcuts wire format the Calendar date fields are gated
        # by WFCalendarItemDates. Without it the start/end token fields can exist in
        # the plist while the action does not treat them as active date parameters.
        if kind == "calendar":
            params["WFCalendarItemDates"] = True

            # Current iOS Calendar date fields use WFTextTokenString slots.
            # A bare WFTextTokenAttachment can import while leaving the date
            # field disconnected at runtime, so normalize both start/end.
            for key in ("WFCalendarItemStartDate", "WFCalendarItemEndDate"):
                date_value = params.get(key)
                if not isinstance(date_value, dict):
                    raise SystemExit(f"calendar writer missing {key}")
                if date_value.get("WFSerializationType") == "WFTextTokenAttachment":
                    ref = date_value.get("Value")
                    if not isinstance(ref, dict):
                        raise SystemExit(f"invalid calendar date attachment: {key}")
                    params[key] = token_string_from_ref(ref)
                elif date_value.get("WFSerializationType") != "WFTextTokenString":
                    raise SystemExit(f"unexpected calendar date envelope: {key}")

        # Current Reminder custom-time fields are text-token-string slots. A bare
        # WFTextTokenAttachment may import but render/read as disconnected.
        if kind == "reminder":
            custom_time = params.get("WFAlertCustomTime")
            if not isinstance(custom_time, dict):
                raise SystemExit("timed reminder missing WFAlertCustomTime")
            if custom_time.get("WFSerializationType") == "WFTextTokenAttachment":
                ref = custom_time.get("Value")
                if not isinstance(ref, dict):
                    raise SystemExit("invalid reminder custom-time attachment")
                params["WFAlertCustomTime"] = token_string_from_ref(ref)
            elif custom_time.get("WFSerializationType") != "WFTextTokenString":
                raise SystemExit("unexpected reminder custom-time envelope")

        notes_expected = params.get("WFCalendarItemNotes")
        if not isinstance(notes_expected, dict):
            raise SystemExit(f"{kind} writer missing notes marker")

        details_identifier = CALENDAR_DETAILS if kind == "calendar" else REMINDER_DETAILS
        inserted: list[dict] = []
        checks: list[tuple[str, str, int, object | None, str]] = []

        title_name = f"{kind}VerifiedTitle"
        uid, action = detail_action(details_identifier, writer_uuid, writer_name, "Title", title_name)
        inserted.append(action)
        checks.append((uid, title_name, 4, token_string_from_ref(content_ref), f"{kind}_title_mismatch"))

        notes_name = f"{kind}VerifiedNotes"
        uid, action = detail_action(details_identifier, writer_uuid, writer_name, "Notes", notes_name)
        inserted.append(action)
        checks.append((uid, notes_name, 4, notes_expected, f"{kind}_notes_mismatch"))

        if kind == "calendar":
            for property_name, reason in (
                ("Calendar", "calendar_destination_missing"),
                ("Start Date", "calendar_start_missing"),
                ("End Date", "calendar_end_missing"),
            ):
                output_name = f"calendarVerified{property_name.replace(' ', '')}"
                uid, action = detail_action(
                    details_identifier, writer_uuid, writer_name, property_name, output_name
                )
                inserted.append(action)
                checks.append((uid, output_name, 100, None, reason))
        else:
            list_name = f"{kind}VerifiedList"
            uid, action = detail_action(details_identifier, writer_uuid, writer_name, "List", list_name)
            inserted.append(action)
            checks.append((uid, list_name, 100, None, f"{kind}_list_missing"))

            alarm_name = f"{kind}VerifiedHasAlarms"
            uid, action = detail_action(
                details_identifier, writer_uuid, writer_name, "Has Alarms", alarm_name
            )
            inserted.append(action)
            # WFCondition 100 is affirmative/has-value; 101 is negative/no-value.
            checks.append(
                (
                    uid,
                    alarm_name,
                    100 if kind == "reminder" else 101,
                    None,
                    f"{kind}_alert_state_mismatch",
                )
            )

            if kind == "reminder":
                due_name = "reminderVerifiedDueDate"
                uid, action = detail_action(
                    details_identifier, writer_uuid, writer_name, "Due Date", due_name
                )
                inserted.append(action)
                checks.append((uid, due_name, 100, None, "reminder_due_date_missing"))

        for uid, output_name, condition, expected, reason in checks:
            inserted.extend(
                verification_guard(
                    uid,
                    output_name,
                    condition,
                    expected,
                    ledger_failure_actions(request_ref, action_ref, reason),
                )
            )
        actions[index + 1 : index + 1] = inserted

    # Idea uses file storage, so verify the exact post-save contents instead of
    # trusting that Save File returned. This cannot be satisfied by an old marker.
    idea_saves = [
        (index, action)
        for index, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"
        and action.get("WFWorkflowActionParameters", {}).get("WFFileDestinationPath")
        == "Idea in Box.txt"
    ]
    if len(idea_saves) != 1:
        raise SystemExit(f"expected exactly one Idea in Box save, found {len(idea_saves)}")

    index, save_action = idea_saves[0]
    save_input = save_action.get("WFWorkflowActionParameters", {}).get("WFInput", {}).get("Value")
    if not isinstance(save_input, dict) or save_input.get("Type") != "ActionOutput":
        raise SystemExit("Idea save input is not an ActionOutput")

    file_uuid = new_uuid()
    text_uuid = new_uuid()
    readback = [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.documentpicker.open",
            "WFWorkflowActionParameters": {
                "UUID": file_uuid,
                "CustomOutputName": "Verified Idea in Box.txt",
                "WFGetFilePath": "Idea in Box.txt",
                "WFFileErrorIfNotFound": True,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.detect.text",
            "WFWorkflowActionParameters": {
                "UUID": text_uuid,
                "CustomOutputName": "Verified Idea in Box contents",
                "WFInput": attachment(file_uuid, "Verified Idea in Box.txt"),
            },
        },
    ]
    readback.extend(
        verification_guard(
            text_uuid,
            "Verified Idea in Box contents",
            4,
            token_string_from_ref(save_input),
            ledger_failure_actions(request_ref, action_ref, "idea_file_readback_mismatch"),
        )
    )
    actions[index + 1 : index + 1] = readback

    root["WFWorkflowActions"] = actions
    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    # Static self-checks against the final patched plist.
    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    final_actions = verify.get("WFWorkflowActions", [])
    identifiers = [action.get("WFWorkflowActionIdentifier") for action in final_actions]
    if identifiers.count(CALENDAR_DETAILS) < 5 or identifiers.count(REMINDER_DETAILS) < 9:
        raise SystemExit("destination readback actions missing")
    calendars = [
        action.get("WFWorkflowActionParameters", {})
        for action in final_actions
        if action.get("WFWorkflowActionIdentifier") == CALENDAR_WRITER
    ]
    if len(calendars) != 1 or calendars[0].get("WFCalendarItemDates") is not True:
        raise SystemExit("calendar date-enable flag missing")
    for key in ("WFCalendarItemStartDate", "WFCalendarItemEndDate"):
        if calendars[0].get(key, {}).get("WFSerializationType") != "WFTextTokenString":
            raise SystemExit(f"calendar {key} is not a token string")
    timed = [
        action.get("WFWorkflowActionParameters", {})
        for action in final_actions
        if action.get("WFWorkflowActionIdentifier") == REMINDER_WRITER
        and "WFAlertCustomTime" in action.get("WFWorkflowActionParameters", {})
    ]
    if (
        len(timed) != 1
        or timed[0]["WFAlertCustomTime"].get("WFSerializationType") != "WFTextTokenString"
    ):
        raise SystemExit("timed reminder custom time is not a token string")
    serialized = repr(verify)
    for marker in (
        "FAILED",
        "calendarVerifiedTitle",
        "reminderVerifiedDueDate",
        "task_shoppingVerifiedList",
        "Verified Idea in Box contents",
        "idea_file_readback_mismatch",
    ):
        if marker not in serialized:
            raise SystemExit(f"missing destination-verification marker {marker}")
    print("Clarity destination readback verification patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
