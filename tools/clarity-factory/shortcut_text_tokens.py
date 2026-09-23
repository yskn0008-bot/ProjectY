#!/usr/bin/env python3
from __future__ import annotations

import re

PROMPT_MARKER = "You are Clarity, the single natural-language gateway"
REQUIRED_BINDING_LABELS = ("request_id: ", "current_time: ", "original_input: ")
_RANGE_RE = re.compile(r"^\{(\d+),\s*(\d+)\}$")


def utf16_units(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def find_prompt_value(root: dict) -> dict:
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    matches: list[dict] = []
    for action in actions:
        params = action.get("WFWorkflowActionParameters", {})
        if not isinstance(params, dict):
            continue
        text = params.get("WFTextActionText")
        if not isinstance(text, dict):
            continue
        value = text.get("Value")
        if not isinstance(value, dict):
            continue
        string = value.get("string")
        if isinstance(string, str) and PROMPT_MARKER in string:
            matches.append(value)

    if len(matches) != 1:
        raise SystemExit(f"expected exactly one Clarity model prompt, found {len(matches)}")
    return matches[0]


def replace_preserving_attachments(value: dict, old: str, new: str) -> None:
    string = value.get("string")
    if not isinstance(string, str):
        raise SystemExit("Clarity prompt string missing")

    hits = string.count(old)
    if hits != 1:
        raise SystemExit(f"expected exactly one prompt replacement, found {hits}")

    char_start = string.index(old)
    start = utf16_units(string[:char_start])
    end = start + utf16_units(old)
    delta = utf16_units(new) - utf16_units(old)

    attachments = value.get("attachmentsByRange")
    if attachments is not None:
        if not isinstance(attachments, dict):
            raise SystemExit("attachmentsByRange is not a dictionary")

        shifted: dict[str, object] = {}
        for key, ref in attachments.items():
            match = _RANGE_RE.match(key)
            if not match:
                raise SystemExit(f"unexpected attachment range key: {key!r}")

            position = int(match.group(1))
            length = int(match.group(2))
            attachment_end = position + length

            if position < end and attachment_end > start:
                raise SystemExit(
                    f"prompt replacement overlaps variable attachment at {key}"
                )

            if position >= end:
                position += delta

            new_key = f"{{{position}, {length}}}"
            if new_key in shifted:
                raise SystemExit(f"attachment range collision after replacement: {new_key}")
            shifted[new_key] = ref

        value["attachmentsByRange"] = shifted

    value["string"] = string[:char_start] + new + string[char_start + len(old):]


def assert_required_prompt_bindings(root: dict) -> None:
    value = find_prompt_value(root)
    string = value.get("string")
    attachments = value.get("attachmentsByRange")
    if not isinstance(string, str) or not isinstance(attachments, dict):
        raise SystemExit("Clarity prompt variable attachments missing")

    for label in REQUIRED_BINDING_LABELS:
        label_index = string.find(label)
        if label_index < 0:
            raise SystemExit(f"missing prompt binding label: {label.strip()}")

        placeholder_index = label_index + len(label)
        if placeholder_index >= len(string) or string[placeholder_index] != "\ufffc":
            raise SystemExit(f"prompt binding placeholder missing after {label.strip()}")

        position = utf16_units(string[:placeholder_index])
        key = f"{{{position}, 1}}"
        if key not in attachments:
            raise SystemExit(
                f"prompt binding attachment range is stale for {label.strip()}: expected {key}"
            )
