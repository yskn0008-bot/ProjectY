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


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    llm_hits = 0
    for action in actions:
        ident = action.get("WFWorkflowActionIdentifier")
        params = action.get("WFWorkflowActionParameters", {})
        if not isinstance(params, dict):
            continue

        if ident == "is.workflow.actions.askllm" and params.get("WFLLMModel") == "ChatGPT":
            current = params.get("WFGenerativeResultType")
            if current not in ("Dictionary", "Text"):
                raise SystemExit(f"unexpected ChatGPT result type: {current!r}")
            params["WFGenerativeResultType"] = "Text"
            llm_hits += 1

    if llm_hits != 1:
        raise SystemExit(f"expected one ChatGPT action, found {llm_hits}")

    value = find_prompt_value(root)
    string = value.get("string")
    if not isinstance(string, str):
        raise SystemExit("Clarity prompt string missing")

    old = "Return only a Dictionary."
    new = (
        "Return only valid JSON text with no markdown fence, prose, or commentary. "
        "The JSON root must be an object and must contain the required keys."
    )
    if old in string:
        replace_preserving_attachments(value, old, new)
    elif new not in string:
        raise SystemExit("Clarity prompt found but output-format contract was unexpected")

    root["WFWorkflowActions"] = actions
    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    blob = repr(verify)
    if "valid JSON text with no markdown fence" not in blob:
        raise SystemExit("JSON-text prompt contract missing")

    llm = [a for a in verify["WFWorkflowActions"] if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.askllm"]
    if len(llm) != 1 or llm[0].get("WFWorkflowActionParameters", {}).get("WFGenerativeResultType") != "Text":
        raise SystemExit("ChatGPT action is not configured for Text output")
    if "is.workflow.actions.detect.dictionary" not in blob:
        raise SystemExit("local JSON -> Dictionary parser missing")

    assert_required_prompt_bindings(verify)
    print("Clarity ChatGPT JSON-text patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
