#!/usr/bin/env python3
"""Validate action ordering, local v1 executors, and safe model configuration in compiled Clarity."""

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


def action_id(action: dict) -> str:
    return str(action.get("WFWorkflowActionIdentifier", ""))


def find_index(actions: list[dict], suffix: str) -> int:
    matches = [i for i, action in enumerate(actions) if action_id(action).endswith(suffix)]
    if len(matches) != 1:
        raise AssertionError(f"expected exactly one action ending {suffix!r}, found {len(matches)}")
    return matches[0]


def find_indexes(actions: list[dict], suffix: str) -> list[int]:
    return [i for i, action in enumerate(actions) if action_id(action).endswith(suffix)]


def serialized_params(action: dict) -> str:
    return repr(action.get("WFWorkflowActionParameters", {}))


def find_get_file(actions: list[dict], path: str) -> list[int]:
    return [
        i for i, action in enumerate(actions)
        if action_id(action).endswith("documentpicker.open")
        and action.get("WFWorkflowActionParameters", {}).get("WFGetFilePath") == path
    ]


def validate(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing")

    dictate_i = find_index(actions, "dictatetext")
    append_indexes = find_indexes(actions, "file.append")
    if len(append_indexes) < 5:
        raise AssertionError(f"expected Raw, Ledger, and local destination appends; found {len(append_indexes)}")
    model_i = find_index(actions, "askllm")

    # Real-device persistence guard: every append must use a resolved WFFile reference.
    # Path-only WFFilePath compiled successfully but did not persist on the target iPhone.
    for i in append_indexes:
        params = actions[i].get("WFWorkflowActionParameters", {})
        if "WFFile" not in params:
            raise AssertionError(f"file.append at index {i} missing resolved WFFile reference")
        if "WFFilePath" in params:
            raise AssertionError(f"file.append at index {i} regressed to path-only WFFilePath")
        if params.get("WFAppendFileWriteMode") != "Append":
            raise AssertionError(f"file.append at index {i} must append")

    inbox_gets = find_get_file(actions, "Clarity Inbox.txt")
    ledger_gets = find_get_file(actions, "Clarity Ledger.txt")
    idea_gets = find_get_file(actions, "Idea in Box.txt")
    if len(inbox_gets) != 1:
        raise AssertionError(f"expected one Clarity Inbox file resolver, found {len(inbox_gets)}")
    if len(ledger_gets) != 1:
        raise AssertionError(f"expected one Clarity Ledger file resolver, found {len(ledger_gets)}")
    if len(idea_gets) != 1:
        raise AssertionError(f"expected one Idea in Box file resolver, found {len(idea_gets)}")

    inbox_i = inbox_gets[0]
    ledger_i = ledger_gets[0]
    idea_i = idea_gets[0]
    raw_candidates = [i for i in append_indexes if inbox_i < i < ledger_i]
    if len(raw_candidates) != 1:
        raise AssertionError(f"expected exactly one Raw First append between inbox and ledger resolves, found {len(raw_candidates)}")
    raw_i = raw_candidates[0]
    if not dictate_i < inbox_i < raw_i < ledger_i < model_i:
        raise AssertionError(
            "Raw First order violated: "
            f"dictation={dictate_i}, inbox_get={inbox_i}, raw={raw_i}, ledger_get={ledger_i}, model={model_i}"
        )
    if idea_i <= model_i:
        raise AssertionError("Idea file must be resolved only inside the post-policy idea executor")

    model_params = actions[model_i].get("WFWorkflowActionParameters", {})
    if model_params.get("FollowUp") is not False:
        raise AssertionError("ChatGPT FollowUp must be false")
    if model_params.get("WFGenerativeResultType") != "Dictionary":
        raise AssertionError("ChatGPT output must be Dictionary")

    identifiers = [action_id(action) for action in actions]
    if sum(ident.endswith("detect.dictionary") for ident in identifiers) < 2:
        raise AssertionError("model result and interpretation must be parsed as dictionaries")
    if not any(ident.endswith("conditional") for ident in identifiers):
        raise AssertionError("fail-closed conditional gate missing")
    if not any(ident.endswith("output") for ident in identifiers):
        raise AssertionError("blocking user output missing")

    event_indexes = find_indexes(actions, "addnewevent")
    reminder_indexes = find_indexes(actions, "addnewreminder")
    if len(event_indexes) != 1:
        raise AssertionError(f"expected one calendar executor, found {len(event_indexes)}")
    if len(reminder_indexes) != 2:
        raise AssertionError(f"expected timed reminder + task/shopping executors, found {len(reminder_indexes)}")

    if event_indexes[0] <= model_i or any(i <= model_i for i in reminder_indexes):
        raise AssertionError("external destination action appears before model/policy")

    # open_app must be delegated to the fixed YOS_OpenApp child Shortcut.
    open_app_indexes = find_indexes(actions, "openapp")
    if open_app_indexes:
        raise AssertionError(f"parent Clarity must not embed app launch actions; found {len(open_app_indexes)}")
    child_runs = find_indexes(actions, "runworkflow")
    if len(child_runs) != 3:
        raise AssertionError(f"expected Safari/brightness fast-path + normal fixed-child Run Shortcut actions, found {len(child_runs)}")
    if not any(i < model_i for i in child_runs):
        raise AssertionError("Safari fast-path child dispatch must occur before the model call")
    if not any(i > model_i for i in child_runs):
        raise AssertionError("normal fixed-child dispatch must remain after model/policy")
    run_params = [serialized_params(actions[i]) for i in child_runs]
    if sum("YOS_OpenApp" in p for p in run_params) != 2:
        raise AssertionError("expected two fixed YOS_OpenApp child runs")
    if sum("YOS_Device" in p for p in run_params) != 1:
        raise AssertionError("expected one fixed YOS_Device child run")

    # MY WAY remains a terminal URL handoff.
    handoff_indexes = find_indexes(actions, "openurl")
    for i in handoff_indexes:
        if i + 1 >= len(actions) or not action_id(actions[i + 1]).endswith("exit"):
            raise AssertionError(f"destination handoff at index {i} must be followed immediately by stop/exit")

    required_local_action_suffixes = (
        "wifi.set",
        "bluetooth.set",
        "cellulardata.set",
        "airplanemode.set",
        "lowpowermode.set",
        "brightness",
        "volume",
        "appearance",
        "flashlight",
        "dnd.set",
        "openurl",
    )
    for suffix in required_local_action_suffixes:
        if not any(ident.endswith(suffix) for ident in identifiers):
            raise AssertionError(f"missing local Clarity executor action: {suffix}")

    event_params = serialized_params(actions[event_indexes[0]])
    for required in ("WFCalendarItemTitle", "WFCalendarItemStartDate", "WFCalendarItemEndDate", "WFCalendarItemNotes"):
        if required not in event_params:
            raise AssertionError(f"calendar executor missing {required}")
    if "YOS-CLARITY-ID:" not in event_params:
        raise AssertionError("calendar executor missing idempotency marker")

    reminder_params = [serialized_params(actions[i]) for i in reminder_indexes]
    if not all("WFCalendarItemTitle" in params and "YOS-CLARITY-ID:" in params for params in reminder_params):
        raise AssertionError("reminder executor missing title or idempotency marker")
    if not any("WFAlertCustomTime" in params for params in reminder_params):
        raise AssertionError("timed reminder executor missing alert time")

    serialized = repr(root)
    for token in ("EXECUTING", "APPLIED", "BLOCKED", "REQUEST_DONE"):
        if token not in serialized:
            raise AssertionError(f"ledger state {token!r} missing")

    # Clarity v1 must remain local-only after the model call. No network executor may be introduced here.
    forbidden_action_fragments = ("downloadurl", "url.upload", "sendemail", "sendmessage", "http", "ssh")
    for ident in identifiers:
        lowered = ident.lower()
        if any(fragment in lowered for fragment in forbidden_action_fragments):
            raise AssertionError(f"forbidden network/external executor found: {ident}")

    for pattern in SECRET_PATTERNS:
        if pattern.search(serialized):
            raise AssertionError(f"secret/private-network pattern found: {pattern.pattern}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
    print("Clarity runtime contract: PASS")
