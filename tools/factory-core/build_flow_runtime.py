#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
import plistlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLAN_PATH = ROOT / "tools" / "factory-core" / "flow_runtime_plan.json"

FORBIDDEN_ACTIONS = {
    "is.workflow.actions.deletefiles",
    "is.workflow.actions.sendmessage",
    "is.workflow.actions.sendemail",
    "is.workflow.actions.setfocus",
    "is.workflow.actions.notification",
    "is.workflow.actions.alert",
    "is.workflow.actions.openurl",
    "is.workflow.actions.openapp",
}


def repo_path(relative: str) -> Path:
    path = (ROOT / relative).resolve()
    if ROOT.resolve() not in path.parents:
        raise ValueError(f"path escapes repository: {relative}")
    return path


def load_plan() -> dict:
    return json.loads(PLAN_PATH.read_text(encoding="utf-8"))


def load_plist(path: Path) -> dict:
    return plistlib.loads(path.read_bytes())


def focus_trigger(workflow: dict) -> tuple[str | None, str | None, str | None]:
    triggers = workflow.get("WFWorkflowTriggers", [])
    if len(triggers) != 1:
        raise AssertionError(f"expected one Focus trigger, found {len(triggers)}")
    trigger = triggers[0]
    if trigger.get("WFTriggerIdentifier") != "WFUserFocusActivityTrigger":
        raise AssertionError("unexpected trigger type")
    params = trigger.get("WFTriggerSerializedParameters", {})
    mode = params.get("WFFocusMode", {})
    return params.get("WFFocusEvent"), mode.get("DisplayString"), mode.get("Identifier")


def validate_runtime_workflow(name: str, workflow: dict, entry: dict) -> None:
    actions = workflow.get("WFWorkflowActions", [])
    ids = [a.get("WFWorkflowActionIdentifier", "") for a in actions]

    if any(identifier in FORBIDDEN_ACTIONS for identifier in ids):
        bad = sorted(set(ids) & FORBIDDEN_ACTIONS)
        raise AssertionError(f"{name}: forbidden actions: {bad}")

    runs = [
        action for action in actions
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.runworkflow"
    ]
    if len(runs) != 1:
        raise AssertionError(f"{name}: expected exactly one Run Shortcut action, found {len(runs)}")

    target = entry["children"][0]
    if target not in repr(runs[0].get("WFWorkflowActionParameters", {})):
        raise AssertionError(f"{name}: Run Shortcut target is not {target!r}")

    expected = entry["focus"]
    event, focus_name, focus_identifier = focus_trigger(workflow)
    if (event, focus_name, focus_identifier) != (
        expected["event"], expected["name"], expected["identifier"]
    ):
        raise AssertionError(
            f"{name}: Focus trigger mismatch: "
            f"{(event, focus_name, focus_identifier)!r}"
        )


def compose_flow(name: str, compiled: dict, baseline: dict, entry: dict) -> dict:
    result = copy.deepcopy(compiled)
    baseline_triggers = baseline.get("WFWorkflowTriggers", [])
    if len(baseline_triggers) != 1:
        raise AssertionError(f"{name}: recovered baseline must have exactly one trigger")
    result["WFWorkflowTriggers"] = copy.deepcopy(baseline_triggers)
    validate_runtime_workflow(name, result, entry)
    return result


def build(compiled_dir: Path, output_dir: Path) -> list[Path]:
    plan = load_plan()
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    for name in ("Home Flow", "Work Flow", "Out Flow"):
        entry = plan["flows"][name]
        compiled_path = compiled_dir / f"{name}_unsigned.shortcut"
        if not compiled_path.is_file():
            raise FileNotFoundError(f"compiled source missing: {compiled_path}")
        baseline_path = repo_path(entry["baseline"])
        workflow = compose_flow(
            name,
            load_plist(compiled_path),
            load_plist(baseline_path),
            entry,
        )
        output = output_dir / f"{name}.plist"
        output.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False))
        validate_runtime_workflow(name, load_plist(output), entry)
        written.append(output)

    return written


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compiled-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    files = build(args.compiled_dir, args.output_dir)
    for path in files:
        print(f"built {path}")
    print("Flow runtime build: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
