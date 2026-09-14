#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

PROMPT_MARKER = "You are Clarity, the single natural-language gateway"


def prompt_string(params: dict) -> tuple[dict, str] | None:
    text = params.get("WFTextActionText")
    if not isinstance(text, dict):
        return None
    value = text.get("Value")
    if not isinstance(value, dict):
        return None
    string = value.get("string")
    if not isinstance(string, str):
        return None
    return value, string


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    llm_hits = 0
    prompt_hits = 0

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

        found = prompt_string(params)
        if not found:
            continue
        value, string = found
        if PROMPT_MARKER not in string:
            continue
        old = "Return only a Dictionary."
        new = (
            "Return only valid JSON text with no markdown fence, prose, or commentary. "
            "The JSON root must be an object and must contain the required keys."
        )
        if old in string:
            string = string.replace(old, new)
        elif new not in string:
            raise SystemExit("Clarity prompt found but output-format contract was unexpected")
        value["string"] = string
        prompt_hits += 1

    if llm_hits != 1:
        raise SystemExit(f"expected one ChatGPT action, found {llm_hits}")
    if prompt_hits != 1:
        raise SystemExit(f"expected one Clarity prompt, found {prompt_hits}")

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

    print("Clarity ChatGPT JSON-text patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
