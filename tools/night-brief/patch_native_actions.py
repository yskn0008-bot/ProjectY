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

    weather_params = replacement_base(actions[wi])
    weather_params["WFWeatherForecastType"] = output(tomorrow_uuid, "調整済みの日付")
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

    workflow["WFWorkflowActions"] = actions
    workflow["WFWorkflowHasShortcutInputVariables"] = False

    blob = repr(workflow)
    ids = [a.get("WFWorkflowActionIdentifier", "") for a in actions]
    for marker in (TODAY_CALENDAR_MARKER, TODAY_REMINDERS_MARKER, WEATHER_MARKER, CALENDAR_MARKER, REMINDERS_MARKER):
        if marker in blob:
            fail(f"placeholder survived: {marker}")
    if ids.count("is.workflow.actions.weather.forecast") != 1:
        fail("weather forecast patch failed")
    if ids.count("is.workflow.actions.filter.calendarevents") != 2:
        fail("Calendar patch failed")
    if ids.count("is.workflow.actions.filter.reminders") != 2:
        fail("Reminders patch failed")
    if ids.count("is.workflow.actions.runworkflow"):
        fail("Night Brief must not depend on another Shortcut")
    if ids.count("is.workflow.actions.openurl") != 1:
        fail("Night Brief must contain exactly one MY LIFE save bridge")
    if ids.count("is.workflow.actions.exit"):
        fail("Night Brief must not contain Stop Shortcut")
    if "night_history=1" in blob:
        fail("legacy browser history callback survived")
    if "真栄原2丁目" in blob:
        fail("private street-level text must not be embedded")

    path.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False))
    print(
        "Night Brief native patch: PASS "
        f"(actions={len(actions)}, weather=1, calendar=2, reminders=2, run-shortcut=0, save-bridge=1)"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        fail("usage: patch_native_actions.py SHORTCUT_PLIST")
    patch(Path(sys.argv[1]))
