#!/usr/bin/env python3
"""Validate action ordering and safe model configuration in compiled Clarity v1."""

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


def validate(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing")

    dictate_i = find_index(actions, "dictatetext")
    append_indexes = find_indexes(actions, "file.append")
    if len(append_indexes) != 2:
        raise AssertionError(f"expected Raw + Ledger appends, found {len(append_indexes)}")
    raw_i, ledger_i = append_indexes
    model_i = find_index(actions, "askllm")
    if not dictate_i < raw_i < model_i < ledger_i:
        raise AssertionError(
            "order violated: "
            f"dictation={dictate_i}, raw={raw_i}, model={model_i}, ledger={ledger_i}"
        )

    raw_params = actions[raw_i].get("WFWorkflowActionParameters", {})
    if raw_params.get("WFAppendFileWriteMode") != "Append":
        raise AssertionError("Raw record must append, not replace/prepend")
    if raw_params.get("WFFilePath") != "Clarity Inbox.txt":
        raise AssertionError(f"unexpected Raw destination: {raw_params.get('WFFilePath')!r}")

    ledger_params = actions[ledger_i].get("WFWorkflowActionParameters", {})
    if ledger_params.get("WFAppendFileWriteMode") != "Append":
        raise AssertionError("Ledger record must append, not replace/prepend")
    if ledger_params.get("WFFilePath") != "Clarity Ledger.txt":
        raise AssertionError(f"unexpected Ledger destination: {ledger_params.get('WFFilePath')!r}")

    model_params = actions[model_i].get("WFWorkflowActionParameters", {})
    if model_params.get("FollowUp") is not False:
        raise AssertionError("ChatGPT FollowUp must be false")
    if model_params.get("WFGenerativeResultType") != "Dictionary":
        raise AssertionError("ChatGPT output must be Dictionary")

    # Runtime gate must parse nested dictionaries and contain conditional/output guards
    # before any later executor is added.
    identifiers = [action_id(action) for action in actions]
    if sum(ident.endswith("detect.dictionary") for ident in identifiers) < 2:
        raise AssertionError("model result and interpretation must be parsed as dictionaries")
    if not any(ident.endswith("conditional") for ident in identifiers):
        raise AssertionError("fail-closed conditional gate missing")
    if not any(ident.endswith("output") for ident in identifiers):
        raise AssertionError("blocking user output missing")

    serialized = repr(root)
    for pattern in SECRET_PATTERNS:
        if pattern.search(serialized):
            raise AssertionError(f"secret/private-network pattern found: {pattern.pattern}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
    print("Clarity runtime contract: PASS")
