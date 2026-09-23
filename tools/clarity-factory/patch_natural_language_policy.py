#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

from shortcut_text_tokens import (
    assert_required_prompt_bindings,
    find_prompt_value,
    replace_preserving_attachments,
)

OLD = (
    "If calendar or reminder date/time is ambiguous, set needs_review=true rather than guessing. "
    "For calendar only: when the start date/time is unambiguous but the user gives no duration/end time, "
    "set end_date_time to exactly 60 minutes after date_time. Never use that default to resolve an ambiguous start."
)

NEW = (
    "Interpret ordinary Japanese everyday time expressions from current_time before deciding they are ambiguous. "
    "Examples that are normally resolvable without review include 今日, 明日, 明後日, 今夜, 朝, 昼, 午後, 夜, "
    "明日3時, 明日の午後3時, and relative reminders such as 30分前 when they clearly refer to a scheduled event in the same input. "
    "For a linked reminder like 30分前, derive date_time from the referenced calendar action and record the dependency. "
    "Do not require the user to restate a full date when current_time plus the utterance determines it. "
    "Shopping/task/idea actions do not need a date unless the user explicitly asks for one; phrases such as 帰りにトマト買う should become shopping content トマト without needs_review. "
    "Set needs_review=true only when multiple materially different interpretations remain after using current_time and same-input context, "
    "for example 3時 with no usable AM/PM context when either interpretation is plausible, an unclear target event for 30分前, or a genuinely missing required date. "
    "For calendar only: when the start date/time is resolved but the user gives no duration/end time, set end_date_time to exactly 60 minutes after date_time."
)


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    value = find_prompt_value(root)
    replace_preserving_attachments(value, OLD, NEW)

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    blob = repr(verify)
    required = ["明日3時", "30分前", "帰りにトマト買う", "multiple materially different interpretations"]
    for needle in required:
        if needle not in blob:
            raise SystemExit(f"missing natural-language policy marker: {needle}")
    if OLD in blob:
        raise SystemExit("old over-strict ambiguity policy survived patch")
    assert_required_prompt_bindings(verify)
    print("Clarity natural-language policy patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
