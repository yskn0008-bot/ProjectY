#!/usr/bin/env python3
"""Repair Clarity's compiled model-boolean safety gates.

Cherri compiles bare dictionary booleans as existence checks. The first repair
used WFCondition=4 with WFNumberValue, but WFCondition=4 is string equality;
on-device evidence proved that shape still lets false fall into the blocked
branch. Apple-built Shortcuts treat JSON booleans numerically (true=1,false=0),
so use numeric inequalities instead:

- true  => value > 0
- false => value <= 0

Only the three safety gates are rewritten.
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
    for i in range(record_index - 1, max(-1, record_index - 6), -1):
        action = actions[i]
        p = params(action)
        if (
            action.get("WFWorkflowActionIdentifier")
            == "is.workflow.actions.conditional"
            and p.get("WFControlFlowMode") == 0
        ):
            return p
    raise SystemExit(f"no start conditional found before action {record_index}")


def patch_single(
    condition: dict,
    output_name: str,
    expect_true: bool,
    expected_old_code: int,
) -> None:
    refs = output_names(condition.get("WFInput"))
    if refs != {output_name}:
        raise SystemExit(
            f"{output_name} gate input mismatch: {sorted(refs)}"
        )

    expected_code = 2 if expect_true else 1  # > 0 or <= 0
    expected_number = "0"
    code = condition.get("WFCondition")
    if code not in (expected_old_code, 4, expected_code):
        raise SystemExit(
            f"{output_name} gate unexpected condition code: {code!r}"
        )
    if code == expected_code and str(condition.get("WFNumberValue")) != expected_number:
        raise SystemExit(
            f"{output_name} gate already numeric but wrong threshold: "
            f"{condition.get('WFNumberValue')!r}"
        )

    condition["WFCondition"] = expected_code
    condition["WFNumberValue"] = expected_number
    condition.pop("WFConditionalActionString", None)


def patch_multi(condition: dict) -> None:
    wrapper = condition.get("WFConditions")
    if not isinstance(wrapper, dict):
        raise SystemExit("external-write gate missing WFConditions")
    value = wrapper.get("Value")
    if not isinstance(value, dict):
        raise SystemExit("external-write WFConditions.Value missing")
    if value.get("WFActionParameterFilterPrefix") != 1:
        raise SystemExit("external-write gate must remain AND")
    templates = value.get("WFActionParameterFilterTemplates")
    if not isinstance(templates, list) or len(templates) != 2:
        raise SystemExit("external-write gate must have exactly two rows")

    expected = {
        "externalWrite": (2, "0", 100),       # true  => > 0
        "requiresConfirmation": (1, "0", 101),  # false => <= 0
    }
    seen: set[str] = set()
    for row in templates:
        if not isinstance(row, dict):
            raise SystemExit("external-write condition row is not a dictionary")
        refs = output_names(row.get("WFInput"))
        if len(refs) != 1:
            raise SystemExit(
                f"external-write condition row has unexpected refs: {sorted(refs)}"
            )
        name = next(iter(refs))
        if name not in expected:
            raise SystemExit(f"unexpected external-write gate input: {name}")
        expected_code, expected_number, old_code = expected[name]
        code = row.get("WFCondition")
        if code not in (old_code, 4, expected_code):
            raise SystemExit(
                f"{name} gate unexpected condition code: {code!r}"
            )
        if code == expected_code and str(row.get("WFNumberValue")) != expected_number:
            raise SystemExit(
                f"{name} gate already numeric but wrong threshold: "
                f"{row.get('WFNumberValue')!r}"
            )
        row["WFCondition"] = expected_code
        row["WFNumberValue"] = expected_number
        row.pop("WFConditionalActionString", None)
        seen.add(name)

    if seen != set(expected):
        raise SystemExit(
            f"external-write gate rows incomplete: {sorted(seen)}"
        )


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

    for gate, name in (
        (review, "needsReview"),
        (confirmation, "requiresConfirmation"),
    ):
        if gate.get("WFCondition") != 2 or str(gate.get("WFNumberValue")) != "0":
            raise SystemExit(f"{name} gate must be numeric > 0")
        if output_names(gate.get("WFInput")) != {name}:
            raise SystemExit(f"{name} gate input reference is wrong")

    wrapper = external.get("WFConditions", {})
    value = wrapper.get("Value", {}) if isinstance(wrapper, dict) else {}
    rows = value.get("WFActionParameterFilterTemplates", [])
    got: dict[str, tuple[int, str]] = {}
    for row in rows if isinstance(rows, list) else []:
        refs = output_names(row.get("WFInput")) if isinstance(row, dict) else set()
        if len(refs) == 1:
            name = next(iter(refs))
            got[name] = (row.get("WFCondition"), str(row.get("WFNumberValue")))
    if got != {
        "externalWrite": (2, "0"),
        "requiresConfirmation": (1, "0"),
    }:
        raise SystemExit(f"external-write gate values wrong: {got!r}")

    print(
        "Clarity model boolean gates: PASS "
        "needsReview>0 externalWrite>0 requiresConfirmation<=0/>0"
    )


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    review = find_start_conditional_before(
        actions, find_record_index(actions, "blockedReviewRecord")
    )
    confirmation = find_start_conditional_before(
        actions, find_record_index(actions, "blockedConfirmationRecord")
    )
    external = find_start_conditional_before(
        actions, find_record_index(actions, "blockedExternalRecord")
    )

    patch_single(review, "needsReview", True, 100)
    patch_multi(external)
    patch_single(confirmation, "requiresConfirmation", True, 100)

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
