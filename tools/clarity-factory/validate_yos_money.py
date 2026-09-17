#!/usr/bin/env python3
"""Validate the compiled Clarity-only YOS_Money child Shortcut."""

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


def validate(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing")

    identifiers = [action_id(action) for action in actions]
    callback_indexes = [i for i, ident in enumerate(identifiers) if ident.endswith("openxcallbackurl")]
    if len(callback_indexes) != 1:
        raise AssertionError(f"expected one x-callback executor, found {len(callback_indexes)}")

    # The callback action receives a Magic Variable, so the Scriptable URL lives in the
    # upstream Text action rather than literally inside the callback action parameters.
    serialized = repr(root)
    for required in (
        "scriptable:///run/YOS%20Money%20Clarity%20Bridge",
        "source=clarity",
        "raw_input",
        "status",
        "verified",
        "result",
        "error_code",
        "payload_json",
        "invalid_money_input",
        "missing_raw_input",
        "invalid_money_callback",
        "incomplete_money_callback",
    ):
        if required not in serialized:
            raise AssertionError(f"Money child contract marker missing: {required}")

    # This child is an executor only. It must not create another user-input surface or AI path.
    forbidden_action_fragments = (
        "dictatetext",
        "askllm",
        "ask",
        "downloadurl",
        "sendemail",
        "sendmessage",
        "addnewevent",
        "addnewreminder",
    )
    for ident in identifiers:
        lowered = ident.lower()
        if any(fragment in lowered for fragment in forbidden_action_fragments):
            raise AssertionError(f"forbidden Money child action found: {ident}")

    if sum(ident.endswith("detect.dictionary") for ident in identifiers) < 2:
        raise AssertionError("Money child must validate dictionary input and callback payload")
    if not any(ident.endswith("output") for ident in identifiers):
        raise AssertionError("Money child must return a parent-verifiable result")

    for pattern in SECRET_PATTERNS:
        if pattern.search(serialized):
            raise AssertionError(f"secret/private-network pattern found: {pattern.pattern}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
    print("YOS_Money child contract: PASS")
