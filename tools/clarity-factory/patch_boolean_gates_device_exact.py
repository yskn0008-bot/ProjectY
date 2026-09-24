#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
import uuid
from pathlib import Path


def params(action: dict) -> dict:
    return action.setdefault("WFWorkflowActionParameters", {})


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


def record_index(actions: list[dict], name: str) -> int:
    hits = [
        i for i, a in enumerate(actions)
        if params(a).get("CustomOutputName") == name
    ]
    if len(hits) != 1:
        raise SystemExit(f"{name}: expected one record, found {hits}")
    return hits[0]


def gate_before(actions: list[dict], record: str) -> tuple[int, dict]:
    ri = record_index(actions, record)
    for i in range(ri - 1, max(-1, ri - 8), -1):
        a = actions[i]
        p = params(a)
        if (
            a.get("WFWorkflowActionIdentifier")
            == "is.workflow.actions.conditional"
            and p.get("WFControlFlowMode") == 0
        ):
            return i, a
    raise SystemExit(f"{record}: start gate not found")


def bool_input(output_name: str, output_uuid: str) -> dict:
    return {
        "Type": "Variable",
        "Variable": {
            "Value": {
                "OutputName": output_name,
                "OutputUUID": output_uuid,
                "Type": "ActionOutput",
                "Aggrandizements": [
                    {
                        "Type": "WFCoercionVariableAggrandizement",
                        "CoercionItemClass": "WFBooleanContentItem",
                    }
                ],
            },
            "WFSerializationType": "WFTextTokenAttachment",
        },
    }


def output_uuid(actions: list[dict], output_name: str) -> str:
    hits = [
        params(a).get("UUID")
        for a in actions
        if params(a).get("CustomOutputName") == output_name
    ]
    if len(hits) != 1 or not hits[0]:
        raise SystemExit(f"{output_name}: output UUID missing/ambiguous")
    return hits[0]


def make_true_gate(output_name: str, output_uuid_value: str, group: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group,
            "WFCondition": 4,
            "WFControlFlowMode": 0,
            "WFInput": bool_input(output_name, output_uuid_value),
        },
    }


def make_otherwise(group: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group,
            "WFControlFlowMode": 1,
        },
    }


def make_end(group: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": {
            "GroupingIdentifier": group,
            "UUID": new_uuid(),
            "WFControlFlowMode": 2,
        },
    }


def make_nothing() -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.nothing",
        "WFWorkflowActionParameters": {"UUID": new_uuid()},
    }


def patch_true_gate(actions: list[dict], record: str, output_name: str) -> None:
    _, action = gate_before(actions, record)
    p = params(action)
    p["WFCondition"] = 4
    p["WFInput"] = bool_input(output_name, output_uuid(actions, output_name))
    p.pop("WFNumberValue", None)
    p.pop("WFConditionalActionString", None)
    p.pop("WFConditions", None)


def patch_external_gate(actions: list[dict]) -> None:
    start_i, start_action = gate_before(actions, "blockedExternalRecord")
    old_group = params(start_action).get("GroupingIdentifier")
    if not old_group:
        raise SystemExit("external gate grouping id missing")

    end_i = None
    for i in range(start_i + 1, min(len(actions), start_i + 20)):
        p = params(actions[i])
        if (
            actions[i].get("WFWorkflowActionIdentifier")
            == "is.workflow.actions.conditional"
            and p.get("WFControlFlowMode") == 2
            and p.get("GroupingIdentifier") == old_group
        ):
            end_i = i
            break
    if end_i is None:
        raise SystemExit("external gate end not found")

    body = actions[start_i + 1 : end_i]
    if record_index(actions, "blockedExternalRecord") not in range(start_i + 1, end_i):
        raise SystemExit("external blocked record not inside gate")

    outer = new_uuid()
    inner = new_uuid()
    replacement = [
        make_true_gate("externalWrite", output_uuid(actions, "externalWrite"), outer),
        make_true_gate(
            "requiresConfirmation",
            output_uuid(actions, "requiresConfirmation"),
            inner,
        ),
        make_nothing(),
        make_otherwise(inner),
        *body,
        make_end(inner),
        make_nothing(),
        make_end(outer),
        make_nothing(),
    ]
    actions[start_i : end_i + 1] = replacement


def refs(node: object) -> list[str]:
    out: list[str] = []

    def walk(x: object) -> None:
        if isinstance(x, dict):
            if x.get("Type") == "ActionOutput" and x.get("OutputName"):
                out.append(str(x["OutputName"]))
            for value in x.values():
                walk(value)
        elif isinstance(x, list):
            for value in x:
                walk(value)

    walk(node)
    return out


def verify_bool_gate(actions: list[dict], record: str, output_name: str) -> None:
    _, action = gate_before(actions, record)
    p = params(action)
    if p.get("WFCondition") != 4:
        raise SystemExit(f"{record}: condition is not Boolean is-true")
    if "WFNumberValue" in p or "WFConditionalActionString" in p:
        raise SystemExit(f"{record}: invalid comparison literal survived")
    if refs(p.get("WFInput")) != [output_name]:
        raise SystemExit(f"{record}: wrong input reference")
    value = p["WFInput"]["Variable"]["Value"]
    aggs = value.get("Aggrandizements")
    expected = [
        {
            "Type": "WFCoercionVariableAggrandizement",
            "CoercionItemClass": "WFBooleanContentItem",
        }
    ]
    if aggs != expected:
        raise SystemExit(f"{record}: Boolean coercion missing: {aggs!r}")


def verify_groups(actions: list[dict]) -> None:
    stack: list[str] = []
    for i, action in enumerate(actions):
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.conditional":
            continue
        p = params(action)
        mode = p.get("WFControlFlowMode")
        gid = p.get("GroupingIdentifier")
        if mode == 0:
            stack.append(gid)
        elif mode == 1:
            if not stack or stack[-1] != gid:
                raise SystemExit(f"conditional otherwise mismatch at {i}")
        elif mode == 2:
            if not stack or stack[-1] != gid:
                raise SystemExit(f"conditional end mismatch at {i}")
            stack.pop()
    if stack:
        raise SystemExit(f"unclosed conditional groups: {stack[-5:]}")


def patch(path: Path) -> None:
    root = plistlib.loads(path.read_bytes())
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    patch_true_gate(actions, "blockedReviewRecord", "needsReview")
    patch_external_gate(actions)
    patch_true_gate(
        actions,
        "blockedConfirmationRecord",
        "requiresConfirmation",
    )

    verify_bool_gate(actions, "blockedReviewRecord", "needsReview")
    verify_bool_gate(
        actions,
        "blockedConfirmationRecord",
        "requiresConfirmation",
    )

    ext_i, ext = gate_before(actions, "blockedExternalRecord")
    extp = params(ext)
    if extp.get("WFCondition") != 4:
        raise SystemExit("externalWrite outer gate is not Boolean is-true")
    ext_value = extp["WFInput"]["Variable"]["Value"]
    if ext_value.get("OutputName") != "externalWrite":
        raise SystemExit("externalWrite outer input wrong")
    if ext_value.get("Aggrandizements") != [
        {
            "Type": "WFCoercionVariableAggrandizement",
            "CoercionItemClass": "WFBooleanContentItem",
        }
    ]:
        raise SystemExit("externalWrite Boolean coercion missing")

    # Immediately inside the externalWrite=true branch must be the
    # requiresConfirmation=true check, followed by an Otherwise branch that
    # contains the external-write block. This avoids any fragile false literal.
    inner = actions[ext_i + 1]
    ip = params(inner)
    if (
        inner.get("WFWorkflowActionIdentifier")
        != "is.workflow.actions.conditional"
        or ip.get("WFControlFlowMode") != 0
        or ip.get("WFCondition") != 4
    ):
        raise SystemExit("requiresConfirmation inner true gate malformed")
    inner_value = ip["WFInput"]["Variable"]["Value"]
    if inner_value.get("OutputName") != "requiresConfirmation":
        raise SystemExit("inner confirmation input wrong")
    if inner_value.get("Aggrandizements") != [
        {
            "Type": "WFCoercionVariableAggrandizement",
            "CoercionItemClass": "WFBooleanContentItem",
        }
    ]:
        raise SystemExit("inner confirmation Boolean coercion missing")

    verify_groups(actions)

    path.write_bytes(
        plistlib.dumps(root, fmt=plistlib.FMT_XML, sort_keys=False)
    )
    print(
        "Clarity Boolean safety gates: PASS "
        "needsReview=true; externalWrite=true + confirmation Otherwise; "
        "requiresConfirmation=true"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
