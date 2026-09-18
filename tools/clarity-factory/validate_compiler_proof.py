#!/usr/bin/env python3
"""Validate the secret-free Cherri compile proof for Clarity Issue #314."""

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


def assert_secret_free(text: str) -> None:
    for pattern in SECRET_PATTERNS:
        if pattern.search(text):
            raise AssertionError(f"secret/private-network pattern found: {pattern.pattern}")


def load_plist(path: Path):
    with path.open("rb") as fh:
        return plistlib.load(fh)


def find_askllm_action(root: object) -> dict:
    if not isinstance(root, dict):
        raise AssertionError("compiled Shortcut plist root is not a dictionary")
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing from compiled Shortcut")
    matches = [
        action
        for action in actions
        if isinstance(action, dict)
        and str(action.get("WFWorkflowActionIdentifier", "")).endswith("askllm")
    ]
    if len(matches) != 1:
        raise AssertionError(f"expected exactly one askllm action, found {len(matches)}")
    return matches[0]


def validate(path: Path) -> None:
    raw = path.read_bytes()
    # plistlib validates both binary and XML plist encodings.
    root = load_plist(path)
    ask = find_askllm_action(root)
    params = ask.get("WFWorkflowActionParameters")
    if not isinstance(params, dict):
        raise AssertionError("askllm parameters missing")
    if params.get("FollowUp") is not False:
        raise AssertionError(f"FollowUp must be false, got {params.get('FollowUp')!r}")
    if params.get("WFGenerativeResultType") != "Dictionary":
        raise AssertionError(
            "WFGenerativeResultType must be Dictionary, got "
            f"{params.get('WFGenerativeResultType')!r}"
        )
    prompt = params.get("WFLLMPrompt")
    if prompt is None:
        raise AssertionError("WFLLMPrompt missing")
    assert_secret_free(repr(root))
    assert_secret_free(raw.decode("latin1", errors="ignore"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
    print("Clarity compiler proof: PASS")
