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
    "is.workflow.actions.detect.date",
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
SHA_RE = re.compile(r"^[0-9a-f]{40}$")\n

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


def validate(path: Path, expected_build_id: str) -> None:
    expected_build_id = expected_build_id.strip().lower()
    if not SHA_RE.fullmatch(expected_build_id):
        raise AssertionError(f"expected BUILD_ID is not a Git SHA: {expected_build_id!r}")
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

    # Artifact Identity Gate: the final plist must carry exactly the Git commit
    # that CI says it built, and BOOT must bind that BUILD_ID to request_id.
    build_actions = [
        action
        for action in actions
        if params(action).get("CustomOutputName") == "buildId"
    ]
    if len(build_actions) != 1:
        raise AssertionError(f"expected one buildId action, found {len(build_actions)}")
    build_value = params(build_actions[0]).get("WFTextActionText")
    if isinstance(build_value, str):
        actual_build_id = build_value
    elif (
        isinstance(build_value, dict)
        and build_value.get("WFSerializationType") == "WFTextTokenString"
        and isinstance(build_value.get("Value"), dict)
    ):
        actual_build_id = build_value["Value"].get("string")
    else:
        raise AssertionError("buildId payload has an unexpected shape")
    if actual_build_id != expected_build_id:
        raise AssertionError(
            f"BUILD_ID mismatch: artifact={actual_build_id!r} expected={expected_build_id!r}"
        )
    if not isinstance(actual_build_id, str) or not SHA_RE.fullmatch(actual_build_id):
        raise AssertionError(f"invalid BUILD_ID: {actual_build_id!r}")

    boot_actions = [
        action
        for action in actions
        if params(action).get("CustomOutputName") == "bootRecord"
    ]
    if len(boot_actions) != 1:
        raise AssertionError(f"expected one bootRecord action, found {len(boot_actions)}")
    boot_value = params(boot_actions[0]).get("WFTextActionText")
    if not isinstance(boot_value, dict) or boot_value.get("WFSerializationType") != "WFTextTokenString":
        raise AssertionError("bootRecord is not a WFTextTokenString")
    boot_text = boot_value.get("Value", {}).get("string", "")
    boot_refs = token_action_output_names(boot_value)
    if "BOOT" not in boot_text:
        raise AssertionError("BOOT marker missing from bootRecord")
    if not {"buildId", "requestNumber"}.issubset(boot_refs):
        raise AssertionError(f"BOOT record missing identity refs: {sorted(boot_refs)}")

    decision_actions = [
        action
        for action in actions
        if params(action).get("CustomOutputName") == "modelDecisionRecord"
    ]
    if len(decision_actions) != 1:
        raise AssertionError(
            f"expected one modelDecisionRecord action, found {len(decision_actions)}"
        )
    decision_value = params(decision_actions[0]).get("WFTextActionText")
    if not isinstance(decision_value, dict) or decision_value.get("WFSerializationType") != "WFTextTokenString":
        raise AssertionError("modelDecisionRecord is not a WFTextTokenString")
    decision_text = decision_value.get("Value", {}).get("string", "")
    decision_refs = token_action_output_names(decision_value)
    if "MODEL_DECISION" not in decision_text or "needs_review=" not in decision_text:
        raise AssertionError("MODEL_DECISION diagnostic marker missing")
    for required in (
        "requestNumber",
        "actionId",
        "executor",
        "dateTime",
        "endDateTime",
        "needsReview",
        "originalInput",
    ):
        if required not in decision_refs:
            raise AssertionError(
                f"MODEL_DECISION missing reference {required}: {sorted(decision_refs)}"
            )

    # Semantic guard for the three model-prompt bindings that originally failed on-device.
    prompt_actions = [
        action
        for action in actions
        if params(action).get("CustomOutputName") == "modelPrompt"
    ]
    if len(prompt_actions) != 1:
        raise AssertionError(f"expected one modelPrompt action, found {len(prompt_actions)}")
    prompt_value = params(prompt_actions[0]).get("WFTextActionText")
    if not isinstance(prompt_value, dict) or prompt_value.get("WFSerializationType") != "WFTextTokenString":
        raise AssertionError("modelPrompt is not a WFTextTokenString")
    prompt_body = prompt_value.get("Value", {})
    prompt_text = prompt_body.get("string", "")
    prompt_ranges = prompt_body.get("attachmentsByRange", {})
    if not isinstance(prompt_text, str) or not isinstance(prompt_ranges, dict):
        raise AssertionError("modelPrompt text/token map missing")
    for label in ("request_id: ", "current_time: ", "original_input: "):
        label_index = prompt_text.find(label)
        if label_index < 0:
            raise AssertionError(f"modelPrompt missing {label.strip()}")
        placeholder_index = label_index + len(label)
        if placeholder_index >= len(prompt_text) or prompt_text[placeholder_index] != "\ufffc":
            raise AssertionError(f"modelPrompt placeholder missing after {label.strip()}")
        position = utf16_units(prompt_text[:placeholder_index])
        if f"{{{position}, 1}}" not in prompt_ranges:
            raise AssertionError(
                f"modelPrompt attachment range stale for {label.strip()}"
            )

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

    # Dynamic model dates must be normalized through Detect Dates. This matches
    # known-working current Shortcut exports and avoids the unreliable standalone
    # Date action + variable-input path.
    date_actions = [
        (i, action)
        for i, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.date"
    ]
    if date_actions:
        names = [params(action).get("CustomOutputName") for _, action in date_actions]
        raise AssertionError(f"standalone Date action survived runtime path: {names}")
    detected_dates = [
        action
        for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.detect.date"
    ]
    detected_names = {params(action).get("CustomOutputName") for action in detected_dates}
    for required_name in ("startDate", "endDate", "alertDate"):
        if required_name not in detected_names:
            raise AssertionError(f"Detect Dates output missing: {required_name}")

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
        ("WFCalendarItemStartDate", "startDate"),
        ("WFCalendarItemEndDate", "endDate"),
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
    calendar_name = cal.get("WFCalendarItemCalendar")
    if calendar_name != "プライベート":
        raise AssertionError(
            f"calendar destination must be confirmed iCloud プライベート, got {calendar_name!r}"
        )

    questions = root.get("WFWorkflowImportQuestions", [])
    calendar_questions = [
        q
        for q in questions
        if isinstance(q, dict)
        and q.get("ParameterKey") == "WFCalendarItemCalendar"
    ]
    if calendar_questions:
        raise AssertionError("stale Calendar import question survived fixed destination build")

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
        or token_action_output_names(timed_field) != {"alertDate"}
    ):
        raise AssertionError("timed Reminder date must reference Detect Dates output alertDate")
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
        f"token_strings={token_strings} build_id={actual_build_id} prompt_bindings=3 model_decision_trace=1 calendar_destination=プライベート "
        f"condition_groups={len(condition_groups)} repeat_groups={len(repeat_groups)}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    parser.add_argument("expected_build_id")
    args = parser.parse_args()
    validate(args.shortcut, args.expected_build_id)
