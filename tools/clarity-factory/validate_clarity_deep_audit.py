#!/usr/bin/env python3
"""Deep static audit for every action in the final Clarity Shortcut artifact.

This validator is intentionally broader than the feature-specific validators:
it scans the complete action graph, token ranges, control-flow groups, destination
writers and all action identifiers before an iPhone build is offered for E2E.
"""

from __future__ import annotations

import argparse
import plistlib
import re
from collections import Counter, defaultdict
from pathlib import Path

ALLOWED_ACTION_IDS = {
    "is.workflow.actions.dictatetext",
    "is.workflow.actions.number.random",
    "is.workflow.actions.gettext",
    "is.workflow.actions.documentpicker.open",
    "is.workflow.actions.detect.text",
    "is.workflow.actions.documentpicker.save",
    "is.workflow.actions.conditional",
    "is.workflow.actions.nothing",
    "is.workflow.actions.runworkflow",
    "is.workflow.actions.exit",
    "is.workflow.actions.askllm",
    "is.workflow.actions.detect.dictionary",
    "is.workflow.actions.getvalueforkey",
    "is.workflow.actions.setvariable",
    "is.workflow.actions.repeat.each",
    "is.workflow.actions.output",
    "is.workflow.actions.addnewevent",
    "is.workflow.actions.properties.calendarevents",
    "is.workflow.actions.addnewreminder",
    "is.workflow.actions.properties.reminders",
    "is.workflow.actions.wifi.set",
    "is.workflow.actions.bluetooth.set",
    "is.workflow.actions.cellulardata.set",
    "is.workflow.actions.airplanemode.set",
    "is.workflow.actions.lowpowermode.set",
    "is.workflow.actions.appearance",
    "is.workflow.actions.flashlight",
    "is.workflow.actions.dnd.set",
    "is.workflow.actions.detect.number",
    "is.workflow.actions.math",
    "is.workflow.actions.setbrightness",
    "is.workflow.actions.setvolume",
    "is.workflow.actions.openurl",
    "is.workflow.actions.showresult",
}

RANGE_RE = re.compile(r"^\{(\d+),\s*(\d+)\}$")


def params(action: dict) -> dict:
    value = action.get("WFWorkflowActionParameters", {})
    return value if isinstance(value, dict) else {}


def utf16_units(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def validate_token_string(value: dict, where: str) -> None:
    body = value.get("Value")
    if not isinstance(body, dict):
        raise AssertionError(f"{where}: WFTextTokenString Value missing")
    string = body.get("string", "")
    if not isinstance(string, str):
        raise AssertionError(f"{where}: token string payload is not text")
    ranges = body.get("attachmentsByRange", {})
    if ranges is None:
        ranges = {}
    if not isinstance(ranges, dict):
        raise AssertionError(f"{where}: attachmentsByRange is not a dictionary")
    total = utf16_units(string)
    for key in ranges:
        match = RANGE_RE.match(key)
        if not match:
            raise AssertionError(f"{where}: malformed token range {key!r}")
        position, length = map(int, match.groups())
        if position < 0 or length < 0 or position + length > total:
            raise AssertionError(
                f"{where}: token range {key} is outside UTF-16 length {total}"
            )
        prefix = string.encode("utf-16-le")[: position * 2].decode("utf-16-le")
        index = len(prefix)
        if length == 1 and (index >= len(string) or string[index] != "\ufffc"):
            raise AssertionError(
                f"{where}: one-unit token range {key} is not on a placeholder"
            )


def walk(value: object, visit, where: str = "root") -> None:
    visit(value, where)
    if isinstance(value, dict):
        for key, child in value.items():
            walk(child, visit, f"{where}/{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, visit, f"{where}/{index}")


def token_action_output_names(value: object) -> set[str]:
    names: set[str] = set()

    def visit(node: object, _: str) -> None:
        if isinstance(node, dict) and node.get("Type") == "ActionOutput":
            name = node.get("OutputName")
            if isinstance(name, str):
                names.add(name)

    walk(value, visit)
    return names


def validate(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list) or not actions:
        raise AssertionError("WFWorkflowActions missing")

    counts = Counter(str(action.get("WFWorkflowActionIdentifier", "")) for action in actions)
    unknown = sorted(set(counts) - ALLOWED_ACTION_IDS)
    if unknown:
        raise AssertionError(f"unreviewed action identifier(s): {unknown}")

    # Index every addressable action and every named variable before resolving refs.
    uuid_index: dict[str, tuple[int, dict]] = {}
    variable_names: set[str] = set()
    for index, action in enumerate(actions):
        p = params(action)
        uid = p.get("UUID")
        if isinstance(uid, str):
            if uid in uuid_index:
                raise AssertionError(
                    f"duplicate action UUID {uid}: {uuid_index[uid][0]} and {index}"
                )
            uuid_index[uid] = (index, action)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.setvariable":
            name = p.get("WFVariableName")
            if isinstance(name, str):
                variable_names.add(name)

    # Audit every nested reference and every token range in the complete plist.
    refs = 0
    token_strings = 0

    def visit(node: object, where: str) -> None:
        nonlocal refs, token_strings
        if not isinstance(node, dict):
            return
        if node.get("Type") == "ActionOutput" and isinstance(node.get("OutputUUID"), str):
            refs += 1
            uid = node["OutputUUID"]
            if uid not in uuid_index:
                raise AssertionError(f"{where}: dangling ActionOutput UUID {uid}")
            actual = params(uuid_index[uid][1]).get("CustomOutputName")
            expected = node.get("OutputName")
            if isinstance(actual, str) and isinstance(expected, str) and actual != expected:
                raise AssertionError(
                    f"{where}: ActionOutput name mismatch {expected!r} != {actual!r}"
                )
        if node.get("Type") == "Variable" and isinstance(node.get("VariableName"), str):
            name = node["VariableName"]
            if name not in variable_names and name not in {
                "Repeat Item",
                "Repeat Index",
                "Shortcut Input",
            }:
                raise AssertionError(f"{where}: unresolved named variable {name!r}")
        if node.get("WFSerializationType") == "WFTextTokenString":
            token_strings += 1
            validate_token_string(node, where)

    walk(root, visit)

    # Audit every Conditional and Repeat group, not just feature paths.
    condition_groups: dict[str, list[tuple[int, int]]] = defaultdict(list)
    repeat_groups: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for index, action in enumerate(actions):
        ident = action.get("WFWorkflowActionIdentifier")
        p = params(action)
        if ident == "is.workflow.actions.conditional":
            group = p.get("GroupingIdentifier")
            mode = p.get("WFControlFlowMode")
            if not isinstance(group, str) or mode not in (0, 1, 2):
                raise AssertionError(f"conditional {index}: invalid group/mode")
            condition_groups[group].append((index, mode))
            if mode == 0:
                if "WFInput" not in p and "WFConditions" not in p:
                    raise AssertionError(f"conditional {index}: no input")
                if "WFCondition" not in p and "WFConditions" not in p:
                    raise AssertionError(f"conditional {index}: no condition")
        elif ident == "is.workflow.actions.repeat.each":
            group = p.get("GroupingIdentifier")
            mode = p.get("WFControlFlowMode")
            if not isinstance(group, str) or mode not in (0, 2):
                raise AssertionError(f"repeat {index}: invalid group/mode")
            repeat_groups[group].append((index, mode))

    for group, entries in condition_groups.items():
        modes = [mode for _, mode in entries]
        if modes[0] != 0 or modes[-1] != 2 or modes.count(0) != 1 or modes.count(2) != 1:
            raise AssertionError(f"conditional group {group}: malformed {entries}")
        if modes.count(1) > 1:
            raise AssertionError(f"conditional group {group}: multiple Otherwise branches")
    for group, entries in repeat_groups.items():
        modes = [mode for _, mode in entries]
        if modes != [0, 2]:
            raise AssertionError(f"repeat group {group}: malformed {entries}")

    # Dynamic model dates must stay as text tokens until the destination DateField.
    # The standalone Date action with variable input is deliberately forbidden here.
    date_actions = [
        (i, action)
        for i, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.date"
    ]
    if date_actions:
        names = [params(action).get("CustomOutputName") for _, action in date_actions]
        raise AssertionError(f"standalone Date action survived runtime path: {names}")

    calendar = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewevent"
    ]
    if len(calendar) != 1:
        raise AssertionError(f"expected one calendar writer, found {len(calendar)}")
    cal = params(calendar[0])
    if cal.get("WFCalendarItemDates") is not True:
        raise AssertionError("calendar writer missing WFCalendarItemDates=true")
    if cal.get("WFCalendarItemAllDay") is not False:
        raise AssertionError("calendar writer must explicitly set all-day=false")
    if cal.get("ShowWhenRun") is not False:
        raise AssertionError("calendar writer must explicitly set ShowWhenRun=false")
    for key, expected_name in (
        ("WFCalendarItemStartDate", "dateTime"),
        ("WFCalendarItemEndDate", "endDateTime"),
    ):
        field = cal.get(key)
        if not isinstance(field, dict) or field.get("WFSerializationType") != "WFTextTokenString":
            raise AssertionError(f"calendar {key} must be WFTextTokenString")
        names = token_action_output_names(field)
        if names != {expected_name}:
            raise AssertionError(
                f"calendar {key} must reference {expected_name} directly, got {sorted(names)}"
            )
    if not token_action_output_names(cal.get("WFCalendarItemTitle", {})) == {"content"}:
        raise AssertionError("calendar title is not wired to model content")
    if "YOS-CLARITY-ID:" not in repr(cal.get("WFCalendarItemNotes")):
        raise AssertionError("calendar idempotency note missing")

    reminders = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewreminder"
    ]
    if len(reminders) != 2:
        raise AssertionError(f"expected two reminder writers, found {len(reminders)}")
    timed = [params(action) for action in reminders if "WFAlertCustomTime" in params(action)]
    untimed = [params(action) for action in reminders if "WFAlertCustomTime" not in params(action)]
    if len(timed) != 1 or len(untimed) != 1:
        raise AssertionError("timed/untimed Reminder writers are not uniquely identifiable")
    timed_field = timed[0]["WFAlertCustomTime"]
    if (
        not isinstance(timed_field, dict)
        or timed_field.get("WFSerializationType") != "WFTextTokenString"
        or token_action_output_names(timed_field) != {"dateTime"}
    ):
        raise AssertionError("timed Reminder date must reference dateTime directly")
    for reminder in (timed[0], untimed[0]):
        if token_action_output_names(reminder.get("WFCalendarItemTitle", {})) != {"content"}:
            raise AssertionError("Reminder title is not wired to model content")
        if "YOS-CLARITY-ID:" not in repr(reminder.get("WFCalendarItemNotes")):
            raise AssertionError("Reminder idempotency note missing")

    # Destination writes must have addressable outputs and independent readback before APPLIED.
    calendar_output_name = cal.get("CustomOutputName")
    calendar_uuid = cal.get("UUID")
    if calendar_output_name != "createdCalendarEvent" or not isinstance(calendar_uuid, str):
        raise AssertionError("calendar writer output is not addressable")
    cal_props = {
        params(action).get("WFContentItemPropertyName")
        for action in actions
        if action.get("WFWorkflowActionIdentifier")
        == "is.workflow.actions.properties.calendarevents"
    }
    if not {"Title", "Notes", "Calendar", "Start Date", "End Date"}.issubset(cal_props):
        raise AssertionError(f"calendar readback incomplete: {sorted(cal_props)}")

    reminder_props = {
        params(action).get("WFContentItemPropertyName")
        for action in actions
        if action.get("WFWorkflowActionIdentifier")
        == "is.workflow.actions.properties.reminders"
    }
    if not {"Title", "Notes", "List", "Has Alarms", "Due Date"}.issubset(reminder_props):
        raise AssertionError(f"reminder readback incomplete: {sorted(reminder_props)}")

    # All deterministic local file writers must stay picker-free and overwrite-after-merge.
    saves = [
        params(action)
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"
    ]
    for index, save in enumerate(saves):
        if save.get("WFAskWhereToSave") is not False:
            raise AssertionError(f"save action {index}: asks where to save")
        if save.get("WFSaveFileOverwrite") is not True:
            raise AssertionError(f"save action {index}: overwrite is not enabled")
        if "WFInput" not in save:
            raise AssertionError(f"save action {index}: explicit input missing")

    # No network/write executors may be embedded in this local runtime.
    forbidden_fragments = ("downloadurl", "sendemail", "sendmessage", "ssh", "url.upload")
    for ident in counts:
        lowered = ident.lower()
        if any(fragment in lowered for fragment in forbidden_fragments):
            raise AssertionError(f"forbidden executor survived: {ident}")

    print(
        "Clarity deep action audit: PASS "
        f"actions={len(actions)} identifiers={len(counts)} refs={refs} "
        f"token_strings={token_strings} condition_groups={len(condition_groups)} "
        f"repeat_groups={len(repeat_groups)}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
