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


def text_blob(action: dict) -> str:
    try:
        return repr(action.get("WFWorkflowActionParameters", {}))
    except Exception:
        return ""


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    marker_indexes = [i for i, a in enumerate(actions) if "original_input_mismatch" in text_blob(a)]
    if len(marker_indexes) != 1:
        raise SystemExit(f"expected one original_input_mismatch marker, found {len(marker_indexes)}")

    marker_index = marker_indexes[0]
    start_index = None
    group_id = None
    for i in range(marker_index - 1, -1, -1):
        a = actions[i]
        if a.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        p = a.get("WFWorkflowActionParameters", {})
        if p.get("WFControlFlowMode") == 0:
            start_index = i
            group_id = p.get("GroupingIdentifier")
            break
    if start_index is None or not group_id:
        raise SystemExit("could not locate original_input mismatch conditional start")

    end_index = None
    for i in range(marker_index + 1, len(actions)):
        a = actions[i]
        if a.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        p = a.get("WFWorkflowActionParameters", {})
        if p.get("WFControlFlowMode") == 2 and p.get("GroupingIdentifier") == group_id:
            end_index = i
            break
    if end_index is None:
        raise SystemExit("could not locate original_input mismatch conditional end")

    # Raw First was already persisted before the model call. The model's echoed
    # original_input is therefore informational only and must never gate execution.
    del actions[start_index : end_index + 1]

    echoed = [
        i for i, a in enumerate(actions)
        if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.gettext"
        and a.get("WFWorkflowActionParameters", {}).get("CustomOutputName") == "echoedInput"
    ]
    for i in reversed(echoed):
        del actions[i]

    # Make the contract explicit inside the model prompt as well.
    old = "Preserve original_input exactly. Never claim execution."
    new = (
        "Raw First already preserves the exact original input before this model runs. "
        "Return original_input as faithfully as possible, but it is informational only and must never gate execution. "
        "Never claim execution."
    )
    value = find_prompt_value(root)
    replace_preserving_attachments(value, old, new)

    root["WFWorkflowActions"] = actions
    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    blob = repr(verify)
    if "original_input_mismatch" in blob:
        raise SystemExit("original_input mismatch gate survived patch")
    if "入力内容の確認が必要です" in blob:
        raise SystemExit("original_input mismatch user block survived patch")
    if "informational only and must never gate execution" not in blob:
        raise SystemExit("Raw First authority marker missing")
    assert_required_prompt_bindings(verify)
    print("Clarity Raw First authority patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
