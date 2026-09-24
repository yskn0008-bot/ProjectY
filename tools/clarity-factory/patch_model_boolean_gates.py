#!/usr/bin/env python3
"""Repair Cherri's bare-variable Boolean gates in compiled Clarity.

Cherri compiles `if someVariable {` as WFCondition=100 ("has any value").
For JSON dictionary booleans, false is still a present value, so that form
incorrectly enters the branch.

Apple-built shortcuts represent Boolean "is true" as WFCondition=4 with the
conditional input explicitly coerced to WFBooleanContentItem and no comparison
literal. This patch applies exactly that canonical shape to only the model
Boolean safety gates.
"""

from __future__ import annotations

import argparse
import plistlib
from collections import Counter
from pathlib import Path

TARGET_COUNTS = {
    "needsReview": 1,
    "externalWrite": 1,
    "requiresConfirmation": 2,
}


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


def action_output_value(condition: dict, expected_name: str) -> dict:
    wf_input = condition.get("WFInput")
    if not isinstance(wf_input, dict) or wf_input.get("Type") != "Variable":
        raise SystemExit(f"{expected_name} gate missing Variable WFInput")
    variable = wf_input.get("Variable")
    if not isinstance(variable, dict):
        raise SystemExit(f"{expected_name} gate missing WFInput.Variable")
    value = variable.get("Value")
    if not isinstance(value, dict) or value.get("Type") != "ActionOutput":
        raise SystemExit(f"{expected_name} gate is not wired to ActionOutput")
    if value.get("OutputName") != expected_name:
        raise SystemExit(
            f"{expected_name} gate points to {value.get('OutputName')!r}"
        )
    return value


def ensure_boolean_coercion(value: dict) -> None:
    aggrandizements = value.get("Aggrandizements")
    if aggrandizements is None:
        aggrandizements = []
    if not isinstance(aggrandizements, list):
        raise SystemExit("ActionOutput Aggrandizements is not a list")

    cleaned = [
        item
        for item in aggrandizements
        if not (
            isinstance(item, dict)
            and item.get("Type") == "WFCoercionVariableAggrandizement"
        )
    ]
    cleaned.insert(
        0,
        {
            "Type": "WFCoercionVariableAggrandizement",
            "CoercionItemClass": "WFBooleanContentItem",
        },
    )
    value["Aggrandizements"] = cleaned


def is_canonical_boolean_true(condition: dict, expected_name: str) -> bool:
    if condition.get("WFCondition") != 4:
        return False
    if "WFNumberValue" in condition or "WFConditionalActionString" in condition:
        return False
    if output_names(condition.get("WFInput")) != {expected_name}:
        return False
    try:
        value = action_output_value(condition, expected_name)
    except SystemExit:
        return False
    aggrandizements = value.get("Aggrandizements")
    if not isinstance(aggrandizements, list):
        return False
    return any(
        isinstance(item, dict)
        and item.get("Type") == "WFCoercionVariableAggrandizement"
        and item.get("CoercionItemClass") == "WFBooleanContentItem"
        for item in aggrandizements
    )


def patch_gate(condition: dict, name: str) -> None:
    refs = output_names(condition.get("WFInput"))
    if refs != {name}:
        raise SystemExit(f"{name} gate input mismatch: {sorted(refs)}")
    code = condition.get("WFCondition")
    if code not in (100, 4):
        raise SystemExit(f"{name} gate unexpected condition code: {code!r}")
    value = action_output_value(condition, name)
    ensure_boolean_coercion(value)
    condition["WFCondition"] = 4
    condition.pop("WFNumberValue", None)
    condition.pop("WFConditionalActionString", None)


def target_gates(actions: list[dict]) -> list[tuple[str, dict]]:
    found: list[tuple[str, dict]] = []
    for action in actions:
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        p = params(action)
        if p.get("WFControlFlowMode") != 0:
            continue
        refs = output_names(p.get("WFInput"))
        if len(refs) != 1:
            continue
        name = next(iter(refs))
        if name in TARGET_COUNTS:
            found.append((name, p))
    return found


def verify(actions: list[dict]) -> None:
    found = target_gates(actions)
    counts = Counter(name for name, _ in found)
    if dict(counts) != TARGET_COUNTS:
        raise SystemExit(
            f"model Boolean gate counts wrong: got={dict(counts)!r} "
            f"expected={TARGET_COUNTS!r}"
        )
    for name, condition in found:
        if not is_canonical_boolean_true(condition, name):
            raise SystemExit(f"{name} gate is not canonical Boolean is-true")

    print(
        "Clarity model boolean gates: PASS "
        "needsReview=true externalWrite=true requiresConfirmation=true(x2) "
        "via WFBooleanContentItem coercion"
    )


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    found = target_gates(actions)
    counts = Counter(name for name, _ in found)
    if dict(counts) != TARGET_COUNTS:
        raise SystemExit(
            f"unexpected model Boolean gate counts before patch: {dict(counts)!r}"
        )

    for name, condition in found:
        patch_gate(condition, name)

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify_root = plistlib.load(fh)
    verify(verify_root["WFWorkflowActions"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
