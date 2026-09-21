#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path


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
    indexes = [index for index, action in enumerate(actions) if custom_name(action) == name]
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

    # Final artifact must use the secure server gateway, not Apple Use Model / ChatGPT.
    if any(identifier == "is.workflow.actions.askllm" for identifier in identifiers):
        raise AssertionError("Apple/ChatGPT model action survived final patch")
    downloads = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.downloadurl"
    ]
    if len(downloads) != 2:
        raise AssertionError(f"expected model + HubSign requests, found {len(downloads)}")
    downloads_by_url = {params(action).get("WFURL"): params(action) for action in downloads}
    model_url = "https://project-y-yos-ai.vercel.app/api/yos/intake?mode=model"
    hubsign_url = "https://hubsign.routinehub.services/sign"
    if set(downloads_by_url) != {model_url, hubsign_url}:
        raise AssertionError(f"unexpected Clarity network endpoints: {set(downloads_by_url)}")
    model_request = downloads_by_url[model_url]
    hubsign_request = downloads_by_url[hubsign_url]
    for label, download in (("model", model_request), ("hubsign", hubsign_request)):
        if download.get("WFHTTPMethod") != "POST" or download.get("WFHTTPBodyType") != "JSON":
            raise AssertionError(f"Clarity {label} request must be POST JSON")
    model_headers = repr(model_request.get("WFHTTPHeaders"))
    if "Authorization" not in model_headers or "Bearer" not in model_headers:
        raise AssertionError("Clarity model bearer header missing")
    hubsign_headers = repr(hubsign_request.get("WFHTTPHeaders"))
    for required in ("Content-Type", "User-Agent", "Origin", "Referer"):
        if required not in hubsign_headers:
            raise AssertionError(f"HubSign header missing {required}")
    hubsign_body = repr(hubsign_request.get("WFJSONValues"))
    if "shortcutName" not in hubsign_body or "shortcutFactoryUnsignedXml" not in hubsign_body:
        raise AssertionError("HubSign payload is not wired to local Shortcut XML")

    xml_actions = [
        action
        for action in actions
        if custom_name(action) == "shortcutFactoryUnsignedXml"
    ]
    if len(xml_actions) != 1:
        raise AssertionError(f"expected one local Shortcut XML action, found {len(xml_actions)}")
    xml_text = text_value(xml_actions[0])
    if "is.workflow.actions.openapp" not in xml_text or "com.apple.mobilesafari" not in xml_text:
        raise AssertionError("local Shortcut XML is not the proven Safari Open App structure")

    name_actions = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.setitemname"
    ]
    if len(name_actions) != 1:
        raise AssertionError(f"expected one generated Shortcut naming action, found {len(name_actions)}")
    name_params = params(name_actions[0])
    if name_params.get("WFName") != "YOS Safari Auto.shortcut":
        raise AssertionError("generated Shortcut must have a .shortcut filename")
    if "generatedShortcut" not in repr(name_params.get("WFInput")):
        raise AssertionError("generated Shortcut naming action is not wired to HubSign output")

    factory_open = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.openin"
    ]
    if len(factory_open) != 1:
        raise AssertionError(f"expected one Shortcut Factory open-in action, found {len(factory_open)}")
    factory_open_params = params(factory_open[0])
    selected = factory_open_params.get("WFSelectedApp")
    if factory_open_params.get("WFOpenInAskWhenRun") is not False:
        raise AssertionError("Shortcut Factory open-in must target a fixed app")
    if not isinstance(selected, dict) or selected.get("BundleIdentifier") != "com.apple.shortcuts":
        raise AssertionError("Shortcut Factory open-in must target Shortcuts")
    if "namedGeneratedShortcut" not in repr(factory_open_params.get("WFInput")):
        raise AssertionError("Shortcut Factory open-in is not wired to named signed output")

    questions = root.get("WFWorkflowImportQuestions")
    if not isinstance(questions, list) or not any(
        question.get("Text") == "Clarity接続トークン"
        for question in questions
        if isinstance(question, dict)
    ):
        raise AssertionError("Clarity connection token import question missing")

    # Parser must consume modelResult and extract actions.
    if sum(identifier == "is.workflow.actions.detect.dictionary" for identifier in identifiers) < 2:
        raise AssertionError("dictionary parser chain missing")
    if not any(
        params(action).get("WFDictionaryKey") == "actions"
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.getvalueforkey"
    ):
        raise AssertionError("actions[] extraction missing")

    # Calendar wire format: the date gate is mandatory when start/end fields are active.
    calendar = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewevent"
    ]
    if len(calendar) != 1:
        raise AssertionError(f"expected one calendar writer, found {len(calendar)}")
    calendar_params = params(calendar[0])
    for key in (
        "WFCalendarItemTitle",
        "WFCalendarItemStartDate",
        "WFCalendarItemEndDate",
        "WFCalendarItemNotes",
    ):
        if key not in calendar_params:
            raise AssertionError(f"calendar writer missing {key}")
    if calendar_params.get("WFCalendarItemDates") is not True:
        raise AssertionError("calendar writer must set WFCalendarItemDates=true")
    if custom_name(calendar[0]) != "createdCalendarEvent" or not calendar_params.get("UUID"):
        raise AssertionError("calendar writer output is not addressable for readback")

    # Reminder wire format on current iOS uses string alert mode and a token-string
    # custom time field. Bare token attachments can import while rendering disconnected.
    reminders = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewreminder"
    ]
    if len(reminders) != 2:
        raise AssertionError(
            f"expected timed reminder + task/shopping writer, found {len(reminders)}"
        )
    timed_actions = [action for action in reminders if "WFAlertCustomTime" in params(action)]
    untimed_actions = [action for action in reminders if "WFAlertCustomTime" not in params(action)]
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
    for reminder_params in (timed, untimed):
        if "WFCalendarItemAlert" in reminder_params:
            raise AssertionError("legacy boolean WFCalendarItemAlert survived final artifact")
        if "WFCalendarItemTitle" not in reminder_params or "WFCalendarItemNotes" not in reminder_params:
            raise AssertionError("reminder writer missing title/notes")
        if not reminder_params.get("UUID") or not reminder_params.get("CustomOutputName"):
            raise AssertionError("reminder output is not addressable for readback")

    # Destination writes must be read back before the pre-existing APPLIED records.
    calendar_details = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.properties.calendarevents"
    ]
    reminder_details = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.properties.reminders"
    ]
    calendar_properties = {params(action).get("WFContentItemPropertyName") for action in calendar_details}
    reminder_properties = {params(action).get("WFContentItemPropertyName") for action in reminder_details}
    if not {"Title", "Notes", "Calendar", "Start Date", "End Date"}.issubset(calendar_properties):
        raise AssertionError("calendar post-write readback is incomplete")
    if not {"Title", "Notes", "List", "Has Alarms", "Due Date"}.issubset(reminder_properties):
        raise AssertionError("reminder post-write readback is incomplete")

    calendar_writer_index = actions.index(calendar[0])
    timed_writer_index = actions.index(timed_actions[0])
    untimed_writer_index = actions.index(untimed_actions[0])
    calendar_applied = next(
        (
            index
            for index, action in enumerate(actions)
            if "APPLIED\tcalendar" in text_value(action)
        ),
        -1,
    )
    reminder_applied = next(
        (
            index
            for index, action in enumerate(actions)
            if "APPLIED\treminder" in text_value(action)
        ),
        -1,
    )
    task_applied = next(
        (
            index
            for index, action in enumerate(actions)
            if "APPLIED\t" in text_value(action) and "YOS-CLARITY-ID:" in text_value(action)
            and index > untimed_writer_index
        ),
        -1,
    )
    if not (calendar_writer_index < index_of_name(actions, "calendarVerifiedTitle") < calendar_applied):
        raise AssertionError("calendar APPLIED can occur before readback")
    if not (timed_writer_index < index_of_name(actions, "reminderVerifiedDueDate") < reminder_applied):
        raise AssertionError("reminder APPLIED can occur before readback")
    if not (
        untimed_writer_index
        < index_of_name(actions, "task_shoppingVerifiedList")
        < task_applied
    ):
        raise AssertionError("task/shopping APPLIED can occur before readback")

    # Idea uses local file persistence: re-open and compare the exact text handed to Save File.
    idea_saves = [
        (index, action)
        for index, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"
        and params(action).get("WFFileDestinationPath") == "Idea in Box.txt"
    ]
    if len(idea_saves) != 1:
        raise AssertionError(f"expected one Idea in Box save, found {len(idea_saves)}")
    idea_save_index = idea_saves[0][0]
    idea_readback_index = index_of_name(actions, "Verified Idea in Box contents")
    idea_applied = next(
        (
            index
            for index, action in enumerate(actions)
            if "APPLIED\tIdea in Box.txt" in text_value(action)
        ),
        -1,
    )
    if not (idea_save_index < idea_readback_index < idea_applied):
        raise AssertionError("Idea APPLIED can occur before exact file readback")

    # iPhone-safe persistence path must remain present for raw, ledger and idea.
    saves = [
        params(action)
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"
    ]
    destinations = [save.get("WFFileDestinationPath") for save in saves]
    for required in ("Clarity Inbox.txt", "Clarity Ledger.txt", "Idea in Box.txt"):
        if required not in destinations:
            raise AssertionError(f"final persistence writer missing {required}")
    if any(
        save.get("WFAskWhereToSave") is not False or save.get("WFSaveFileOverwrite") is not True
        for save in saves
    ):
        raise AssertionError("final persistence writer is not deterministic overwrite-after-merge")

    serialized = repr(root)
    for marker in (
        "RAW",
        "EXECUTING",
        "APPLIED",
        "FAILED",
        "BLOCKED",
        "REQUEST_DONE",
        "YOS-CLARITY-ID:",
        "idea_file_readback_mismatch",
        "reminder_due_date_missing",
        "task_shopping_alert_state_mismatch",
        "HANDOFF_READY",
        "shortcut_factory",
    ):
        if marker not in serialized:
            raise AssertionError(f"missing final runtime marker: {marker}")

    print("Clarity final artifact contract: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
