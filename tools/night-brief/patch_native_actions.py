#!/usr/bin/env python3
"""Patch compiled Night Brief placeholders into native iPhone actions.

The Cherri source stays readable while this postcompile step injects the three
Shortcuts actions whose predicate payloads Cherri does not currently model:
- tomorrow weather forecast
- tomorrow Calendar events
- tomorrow incomplete Reminders

The placeholder action UUIDs are preserved so downstream Text/ChatGPT bindings
remain intact.
"""

from __future__ import annotations

import plistlib
import sys
from pathlib import Path

TODAY_CALENDAR_MARKER = "YOS_NIGHT_TODAY_CALENDAR_PLACEHOLDER"
TODAY_REMINDERS_MARKER = "YOS_NIGHT_TODAY_REMINDERS_PLACEHOLDER"
WEATHER_MARKER = "YOS_NIGHT_WEATHER_PLACEHOLDER"
CALENDAR_MARKER = "YOS_NIGHT_CALENDAR_PLACEHOLDER"
REMINDERS_MARKER = "YOS_NIGHT_REMINDERS_PLACEHOLDER"
JOURNAL_MARKER = "YOS_NIGHT_JOURNAL_PLACEHOLDER"


def fail(message: str) -> None:
    raise SystemExit(message)


def text_payload(action: dict) -> str:
    params = action.get("WFWorkflowActionParameters", {})
    value = params.get("WFTextActionText", "")
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        payload = value.get("Value", {})
        if isinstance(payload, dict):
            return str(payload.get("string", ""))
    return ""


def action_uuid(action: dict) -> str:
    value = action.get("WFWorkflowActionParameters", {}).get("UUID")
    if not value:
        fail(f"missing UUID for {action.get('WFWorkflowActionIdentifier')}")
    return str(value)


def output(uuid: str, name: str) -> dict:
    return {
        "Value": {
            "OutputUUID": uuid,
            "Type": "ActionOutput",
            "OutputName": name,
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }


def replacement_base(old: dict) -> dict:
    params = old.get("WFWorkflowActionParameters", {})
    result = {"UUID": action_uuid(old)}
    if params.get("CustomOutputName"):
        result["CustomOutputName"] = params["CustomOutputName"]
    return result


def find_marker(actions: list[dict], marker: str) -> int:
    matches = [
        i
        for i, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.gettext"
        and marker in text_payload(action)
    ]
    if len(matches) != 1:
        fail(f"expected one {marker} placeholder, found {len(matches)}")
    return matches[0]


def variable_attachment(name: str) -> dict:
    return {
        "Value": {
            "VariableName": name,
            "Type": "Variable",
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }


def variable_names(value: object) -> set[str]:
    names: set[str] = set()

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("Type") == "Variable":
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


def text_token_output(uuid: str, name: str = "Text") -> dict:
    return {
        "Value": {
            "attachmentsByRange": {
                "{0, 1}": {
                    "OutputUUID": uuid,
                    "Type": "ActionOutput",
                    "OutputName": name,
                }
            },
            "string": "\ufffc",
        },
        "WFSerializationType": "WFTextTokenString",
    }


def find_custom_output(actions: list[dict], name: str) -> str:
    matches = [
        action
        for action in actions
        if action.get("WFWorkflowActionParameters", {}).get("CustomOutputName") == name
    ]
    if len(matches) != 1:
        fail(f"expected one custom output {name}, found {len(matches)}")
    return action_uuid(matches[0])


def patch(path: Path) -> None:
    workflow = plistlib.loads(path.read_bytes())
    actions = workflow.get("WFWorkflowActions")
    if not isinstance(actions, list):
        fail("WFWorkflowActions missing")

    # Cherri emits Current Date + Adjust Date, then two text->Date pairs.
    adjust = [
        a for a in actions
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.adjustdate"
    ]
    if len(adjust) != 1:
        fail(f"expected one Adjust Date, found {len(adjust)}")
    tomorrow_uuid = action_uuid(adjust[0])

    date_actions = [
        a for a in actions
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.date"
    ]
    if len(date_actions) != 5:
        fail(f"expected five Date actions, found {len(date_actions)}")
    # Date #1 is Current Date; #2/#3 are today 00:00 / 23:59;
    # #4/#5 are tomorrow 00:00 / 23:59.
    today_start_uuid = action_uuid(date_actions[1])
    today_end_uuid = action_uuid(date_actions[2])
    start_uuid = action_uuid(date_actions[3])
    end_uuid = action_uuid(date_actions[4])

    tci = find_marker(actions, TODAY_CALENDAR_MARKER)
    tri = find_marker(actions, TODAY_REMINDERS_MARKER)
    wi = find_marker(actions, WEATHER_MARKER)
    ci = find_marker(actions, CALENDAR_MARKER)
    ri = find_marker(actions, REMINDERS_MARKER)
    ji = find_marker(actions, JOURNAL_MARKER)

    weather_params = replacement_base(actions[wi])
    # Match the proven Morning Brief native Weather action. The Forecast Type
    # parameter is an enum; binding the tomorrow Date output to it is invalid.
    # Default forecast output is passed to GPT together with tomorrowLabel.
    actions[wi] = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.weather.forecast",
        "WFWorkflowActionParameters": weather_params,
    }

    today_calendar_params = replacement_base(actions[tci])
    today_calendar_params.update({
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Oldest First",
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterTemplates": [
                    {
                        "Property": "Start Date",
                        "Operator": 1003,
                        "Values": {
                            "Date": output(today_start_uuid, "日付"),
                            "AnotherDate": output(today_end_uuid, "日付"),
                            "Unit": 16,
                            "Number": "7",
                        },
                        "Removable": False,
                        "Bounded": True,
                    }
                ],
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
    })
    actions[tci] = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.filter.calendarevents",
        "WFWorkflowActionParameters": today_calendar_params,
    }

    today_reminders_params = replacement_base(actions[tri])
    today_reminders_params.update({
        "WFContentItemSortProperty": "Title",
        "WFContentItemSortOrder": "A to Z",
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {
                        "Operator": 1003,
                        "Values": {
                            "Date": output(today_start_uuid, "日付"),
                            "AnotherDate": output(today_end_uuid, "日付"),
                        },
                        "Removable": True,
                        "Property": "Due Date",
                    },
                    {
                        "Operator": 4,
                        "Values": {"Bool": False},
                        "Removable": True,
                        "Property": "Is Completed",
                    },
                ],
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
    })
    actions[tri] = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.filter.reminders",
        "WFWorkflowActionParameters": today_reminders_params,
    }

    calendar_params = replacement_base(actions[ci])
    calendar_params.update({
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Oldest First",
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterTemplates": [
                    {
                        "Property": "Start Date",
                        "Operator": 1003,
                        "Values": {
                            "Date": output(start_uuid, "日付"),
                            "AnotherDate": output(end_uuid, "日付"),
                            "Unit": 16,
                            "Number": "7",
                        },
                        "Removable": False,
                        "Bounded": True,
                    }
                ],
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
    })
    actions[ci] = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.filter.calendarevents",
        "WFWorkflowActionParameters": calendar_params,
    }

    reminders_params = replacement_base(actions[ri])
    reminders_params.update({
        "WFContentItemSortProperty": "Title",
        "WFContentItemSortOrder": "A to Z",
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {
                        "Operator": 1003,
                        "Values": {
                            "Date": output(start_uuid, "日付"),
                            "AnotherDate": output(end_uuid, "日付"),
                        },
                        "Removable": True,
                        "Property": "Due Date",
                    },
                    {
                        "Operator": 4,
                        "Values": {"Bool": False},
                        "Removable": True,
                        "Property": "Is Completed",
                    },
                ],
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
    })
    actions[ri] = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.filter.reminders",
        "WFWorkflowActionParameters": reminders_params,
    }

    journal_title_uuid = find_custom_output(actions, "journalTitle")
    journal_body_uuid = find_custom_output(actions, "journalBody")
    journal_params = replacement_base(actions[ji])
    journal_params.update({
        "AppIntentDescriptor": {
            "AppIntentIdentifier": "CreateEntryIntent",
            "BundleIdentifier": "com.apple.journal",
            "Name": "Journal",
            "TeamIdentifier": "0000000000",
        },
        "OpenWhenRun": False,
        "entryBookmark": False,
        "title": text_token_output(journal_title_uuid),
        "message": text_token_output(journal_body_uuid),
    })
    actions[ji] = {
        "WFWorkflowActionIdentifier": "com.apple.journal.CreateEntryIntent",
        "WFWorkflowActionParameters": journal_params,
    }

    # Cherri 2.3 can degrade a bare boolean variable condition into
    # "has any value". Because false/0 still has a value, that makes manual
    # Night Brief stop at the AUTO gates. Require explicit text equality.
    auto_rows: list[dict] = []
    for action in actions:
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        params = action.get("WFWorkflowActionParameters", {})
        if params.get("WFControlFlowMode") != 0:
            continue
        if "autoMode" in variable_names(params.get("WFInput")):
            auto_rows.append(params)
        wrapper = params.get("WFConditions")
        if isinstance(wrapper, dict):
            value = wrapper.get("Value", {})
            for row in value.get("WFActionParameterFilterTemplates", []):
                if isinstance(row, dict) and "autoMode" in variable_names(row.get("WFInput")):
                    auto_rows.append(row)
    if len(auto_rows) != 2:
        fail(f"expected two autoMode gates, found {len(auto_rows)}")
    for row in auto_rows:
        if row.get("WFCondition") != 4 or row.get("WFConditionalActionString") != "auto":
            fail(f"autoMode gate must compare explicitly to 'auto': {row!r}")

    # Fix Cherri's literal backslash escaping so the regex matches real
    # newlines before numbered discoveries.
    for output_name, pattern in (
        ("spacedResponse2", r"\n+2\."),
        ("spacedResponse3", r"\n+3\."),
    ):
        matches = [
            action for action in actions
            if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.text.replace"
            and action.get("WFWorkflowActionParameters", {}).get("CustomOutputName") == output_name
        ]
        if len(matches) != 1:
            fail(f"expected one {output_name} replace action, found {len(matches)}")
        matches[0]["WFWorkflowActionParameters"]["WFReplaceTextFind"] = pattern

    workflow["WFWorkflowActions"] = actions
    workflow["WFWorkflowHasShortcutInputVariables"] = True

    blob = repr(workflow)
    ids = [a.get("WFWorkflowActionIdentifier", "") for a in actions]
    for marker in (TODAY_CALENDAR_MARKER, TODAY_REMINDERS_MARKER, WEATHER_MARKER, CALENDAR_MARKER, REMINDERS_MARKER, JOURNAL_MARKER):
        if marker in blob:
            fail(f"placeholder survived: {marker}")
    if ids.count("is.workflow.actions.weather.forecast") != 1:
        fail("weather forecast patch failed")
    if "WFWeatherForecastType" in actions[wi].get("WFWorkflowActionParameters", {}):
        fail("weather forecast type must use the native default")
    if ids.count("is.workflow.actions.filter.calendarevents") != 2:
        fail("Calendar patch failed")
    if ids.count("is.workflow.actions.filter.reminders") != 2:
        fail("Reminders patch failed")
    if ids.count("is.workflow.actions.runworkflow") != 1:
        fail("Night Brief must call YOS Notify exactly once")
    if "YOS Notify" not in blob:
        fail("Night Brief YOS Notify child missing")
    if ids.count("is.workflow.actions.openurl"):
        fail("Night Brief must not open Safari")
    if ids.count("is.workflow.actions.exit") < 1:
        fail("Night Brief auto mode stop is missing")
    if "night_history=1" in blob or "night_save=1" in blob:
        fail("legacy browser callback survived")
    if "shortcuts://run-shortcut?name=Night%20Brief" not in blob:
        fail("Night Brief notification tap route missing")
    if ids.count("is.workflow.actions.file.createfolder") != 4:
        fail("expected Night history, display history, auto-run, and journal-status folders")
    if ids.count("is.workflow.actions.file.getfoldercontents") != 1:
        fail("Night history folder read missing")
    if ids.count("is.workflow.actions.filter.files") != 1:
        fail("Night history 14-day filter missing")
    if ids.count("is.workflow.actions.documentpicker.save") != 5:
        fail("expected Night history, display-history rereads, auto-run marker, and journal-status saves")
    if ids.count("com.apple.journal.CreateEntryIntent") != 1:
        fail("Journal Create Entry patch failed")
    if "真栄原2丁目" in blob:
        fail("private street-level text must not be embedded")

    path.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False))
    print(
        "Night Brief native-only patch: PASS "
        f"(actions={len(actions)}, weather=1, calendar=2, reminders=2, journal=1, auto_mode=1, notify=YOS, safari=0, scriptable=0)"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        fail("usage: patch_native_actions.py SHORTCUT_PLIST")
    patch(Path(sys.argv[1]))
