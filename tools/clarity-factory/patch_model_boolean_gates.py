#!/usr/bin/env python3
"""Verify Clarity's compiled model-boolean safety gates.

The legacy filename is retained because all three Clarity build workflows call it.\nReal-device evidence showed that Dictionary booleans are rendered by a Text\naction as Japanese "はい"/"いいえ", while bare-boolean If actions degraded to
existence checks. The source therefore normalizes each model boolean through a
Text action and compares the resulting text explicitly.
"""

from __future__ import annotations

import argparse
import plistlib
from pathlib import Path


def params(action: dict) -> dict:
    value = action.get("WFWorkflowActionParameters", {})
    return value if isinstance(value, dict) else {}


def output_names(value: object) -> set[str]:
    names: set[str] = set()

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("Type") == "ActionOutput":
                name = node.get("OutputName")
                if isinstance(name, str):
                    names.add(name)
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(value)
    return names


def find_record_index(actions: list[dict], custom_output_name: str) -> int:
    matches = [
        i
        for i, action in enumerate(actions)
        if params(action).get("CustomOutputName") == custom_output_name
    ]
    if len(matches) != 1:
        raise SystemExit(
            f"expected one {custom_output_name}, found {len(matches)}"
        )
    return matches[0]


def find_start_conditional_before(actions: list[dict], record_index: int) -> dict:
    for i in range(record_index - 1, max(-1, record_index - 8), -1):
        action = actions[i]
        p = params(action)
        if (
            action.get("WFWorkflowActionIdentifier")
            == "is.workflow.actions.conditional"
            and p.get("WFControlFlowMode") == 0
        ):
            return p
    raise SystemExit(f"no start conditional found before action {record_index}")


def verify_single(
    gate: dict,
    output_name: str,
    expected_text: str,
) -> None:
    if gate.get("WFCondition") != 4:
        raise SystemExit(
            f"{output_name} gate must use string equality (4), "
            f"got {gate.get('WFCondition')!r}"
        )
    if gate.get("WFConditionalActionString") != expected_text:
        raise SystemExit(
            f"{output_name} gate comparison text mismatch: "
            f"{gate.get('WFConditionalActionString')!r}"
        )
    refs = output_names(gate.get("WFInput"))
    if refs != {output_name}:
        raise SystemExit(
            f"{output_name} gate input mismatch: {sorted(refs)}"
        )
    if "WFNumberValue" in gate:
        raise SystemExit(f"{output_name} gate unexpectedly contains WFNumberValue")


def verify(actions: list[dict]) -> None:
    review = find_start_conditional_before(
        actions, find_record_index(actions, "blockedReviewRecord")
    )
    confirmation = find_start_conditional_before(
        actions, find_record_index(actions, "blockedConfirmationRecord")
    )
    external = find_start_conditional_before(
        actions, find_record_index(actions, "blockedExternalRecord")
    )

    verify_single(review, "needsReviewText", "はい")
    verify_single(confirmation, "requiresConfirmationText", "はい")

    wrapper = external.get("WFConditions")
    if not isinstance(wrapper, dict):
        raise SystemExit("external-write gate missing WFConditions")
    value = wrapper.get("Value")
    if not isinstance(value, dict):
        raise SystemExit("external-write WFConditions.Value missing")
    if value.get("WFActionParameterFilterPrefix") != 1:
        raise SystemExit("external-write gate must remain AND")
    rows = value.get("WFActionParameterFilterTemplates")
    if not isinstance(rows, list) or len(rows) != 2:
        raise SystemExit("external-write gate must have exactly two rows")

    got: dict[str, tuple[int, str]] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise SystemExit("external-write condition row is not a dictionary")
        refs = output_names(row.get("WFInput"))
        if len(refs) != 1:
            raise SystemExit(
                f"external-write condition row has unexpected refs: {sorted(refs)}"
            )
        name = next(iter(refs))
        got[name] = (
            row.get("WFCondition"),
            row.get("WFConditionalActionString"),
        )
        if "WFNumberValue" in row:
            raise SystemExit(f"{name} row unexpectedly contains WFNumberValue")

    expected = {
        "externalWriteText": (4, "はい"),
        "requiresConfirmationText": (4, "いいえ"),
    }
    if got != expected:
        raise SystemExit(f"external-write text rows wrong: {got!r}")

    print(
        "Clarity model boolean gates: PASS "
        'needsReview="はい" externalWrite="はい" '
        'requiresConfirmation="いいえ"/"はい"'
    )


def check(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")
    verify(actions)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    check(args.shortcut)
