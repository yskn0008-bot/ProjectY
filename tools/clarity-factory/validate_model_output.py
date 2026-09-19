#!/usr/bin/env python3
"""Dependency-free fail-closed validator for Clarity model output."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
SPEC = json.loads((HERE / "clarity-spec.json").read_text(encoding="utf-8"))

TOP_REQUIRED = {"request_id", "original_input", "context", "interpretation", "actions", "watches", "feedback"}
ACTION_REQUIRED = {
    "id", "executor", "domain", "intent", "target", "content", "conditions",
    "destination", "requires_confirmation", "external_write", "needs_review",
    "dependency", "status", "date_time", "end_date_time"
}


def _is_bool(value: Any) -> bool:
    return isinstance(value, bool)


def _text(value: Any) -> bool:
    return isinstance(value, str)


def validate(payload: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["output must be a dictionary"]

    missing = TOP_REQUIRED - payload.keys()
    if missing:
        errors.append("missing top-level fields: " + ", ".join(sorted(missing)))
        return errors

    if not _text(payload["request_id"]) or not payload["request_id"].strip():
        errors.append("request_id must be a non-empty string")
    if not _text(payload["original_input"]) or not payload["original_input"].strip():
        errors.append("original_input must be preserved as a non-empty string")

    context = payload["context"]
    if not isinstance(context, dict):
        errors.append("context must be a dictionary")

    interp = payload["interpretation"]
    if not isinstance(interp, dict):
        errors.append("interpretation must be a dictionary")
    else:
        domains = interp.get("domains")
        if not isinstance(domains, list) or any(d not in SPEC["domains"] for d in domains):
            errors.append("interpretation.domains contains an unknown domain")
        if interp.get("urgency") not in SPEC["urgencies"]:
            errors.append("interpretation.urgency is invalid")
        risk = interp.get("risk")
        if risk not in SPEC["risks"]:
            errors.append("interpretation.risk is invalid")
        confidence = interp.get("confidence")
        if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0 <= confidence <= 1:
            errors.append("interpretation.confidence must be between 0 and 1")

    actions = payload["actions"]
    if not isinstance(actions, list):
        errors.append("actions must be a list")
        actions = []

    seen_ids: set[str] = set()
    for index, action in enumerate(actions):
        prefix = f"actions[{index}]"
        if not isinstance(action, dict):
            errors.append(f"{prefix} must be a dictionary")
            continue
        missing_action = ACTION_REQUIRED - action.keys()
        if missing_action:
            errors.append(f"{prefix} missing fields: {', '.join(sorted(missing_action))}")
            continue

        action_id = action.get("id")
        if not _text(action_id) or not action_id.strip():
            errors.append(f"{prefix}.id must be non-empty")
        elif action_id in seen_ids:
            errors.append(f"{prefix}.id is duplicated")
        else:
            seen_ids.add(action_id)

        executor = action.get("executor")
        if executor not in SPEC["v1_executors"]:
            errors.append(f"{prefix}.executor is unsupported")
        if action.get("domain") not in SPEC["domains"]:
            errors.append(f"{prefix}.domain is invalid")
        if action.get("intent") not in SPEC["intents"]:
            errors.append(f"{prefix}.intent is invalid")

        for field in ("requires_confirmation", "external_write", "needs_review"):
            if not _is_bool(action.get(field)):
                errors.append(f"{prefix}.{field} must be boolean")

        if action.get("status") != "planned":
            errors.append(f"{prefix}.status must be planned; model cannot claim execution")

        if executor in {"calendar", "reminder"} and action.get("intent") in {"create", "update", "notify"}:
            if not _text(action.get("date_time")) or not action.get("date_time", "").strip():
                if action.get("needs_review") is not True:
                    errors.append(f"{prefix} has ambiguous/missing date_time and must needs_review")

        if executor == "calendar" and action.get("needs_review") is not True:
            if not _text(action.get("end_date_time")) or not action.get("end_date_time", "").strip():
                errors.append(f"{prefix}.end_date_time is required for executable calendar actions")

        if executor == "shortcut_factory":
            if action.get("domain") != "system" or action.get("intent") != "automate":
                errors.append(f"{prefix} shortcut_factory must use domain=system and intent=automate")
            if action.get("external_write") is True and action.get("requires_confirmation") is not True:
                errors.append(f"{prefix} shortcut_factory external distribution requires confirmation")

        if executor == "open_app":
            if action.get("domain") != "system" or action.get("intent") != "execute":
                errors.append(f"{prefix} open_app must use domain=system and intent=execute")
            if action.get("needs_review") is not True and action.get("target") not in SPEC["v1_open_apps"]:
                errors.append(f"{prefix} open_app target is unsupported")

        if executor == "device_setting":
            target = action.get("target")
            content = action.get("content")
            if action.get("domain") != "system" or action.get("intent") != "update":
                errors.append(f"{prefix} device_setting must use domain=system and intent=update")
            if action.get("needs_review") is not True and target not in SPEC["v1_device_settings"]:
                errors.append(f"{prefix} device_setting target is unsupported")
            elif action.get("needs_review") is not True and target in SPEC["v1_device_settings"]:
                allowed = SPEC["v1_device_settings"][target]
                if allowed == ["0..100"]:
                    try:
                        percent = int(content)
                    except (TypeError, ValueError):
                        percent = -1
                    if str(percent) != str(content) or not 0 <= percent <= 100:
                        errors.append(f"{prefix} device_setting percent is invalid")
                elif content not in allowed:
                    errors.append(f"{prefix} device_setting value is invalid")

        if executor == "myway":
            if action.get("domain") != "life" or action.get("intent") != "find" or action.get("target") not in SPEC["v1_myway_targets"]:
                errors.append(f"{prefix} myway route is invalid")

        if action.get("external_write") is True and action.get("requires_confirmation") is not True:
            errors.append(f"{prefix} external_write requires confirmation in v1")

    if isinstance(interp, dict) and interp.get("risk") in {"high", "irreversible"}:
        if actions and any(a.get("requires_confirmation") is not True for a in actions if isinstance(a, dict)):
            errors.append("high/irreversible request requires confirmation on every action")

    watches = payload["watches"]
    if not isinstance(watches, list):
        errors.append("watches must be a list")
    else:
        for index, watch in enumerate(watches):
            if not isinstance(watch, dict):
                errors.append(f"watches[{index}] must be a dictionary")
                continue
            for field in ("condition", "check_target", "action_when_true"):
                if not _text(watch.get(field)):
                    errors.append(f"watches[{index}].{field} must be text")

    feedback = payload["feedback"]
    if not isinstance(feedback, dict):
        errors.append("feedback must be a dictionary")
    else:
        for field in ("summary", "next_action", "whisper_line"):
            if not _text(feedback.get(field)):
                errors.append(f"feedback.{field} must be text")

    return errors


def validate_or_raise(payload: Any) -> None:
    errors = validate(payload)
    if errors:
        raise ValueError("; ".join(errors))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("json_file", type=Path)
    args = parser.parse_args()
    data = json.loads(args.json_file.read_text(encoding="utf-8"))
    validate_or_raise(data)
    print("Clarity model output: PASS")
