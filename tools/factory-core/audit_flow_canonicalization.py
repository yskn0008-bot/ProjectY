#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import plistlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FACTORY = ROOT / "tools" / "factory-core"
sys.path.insert(0, str(FACTORY))

import build_flow_runtime  # noqa: E402

MANIFEST = FACTORY / "flow_sources.json"
PLAN = FACTORY / "flow_runtime_plan.json"

MORNING_ALLOWED_ACTIONS = {
    "is.workflow.actions.filter.calendarevents",
    "is.workflow.actions.conditional",
    "is.workflow.actions.properties.calendarevents",
    "is.workflow.actions.date",
    "is.workflow.actions.gettimebetweendates",
    "is.workflow.actions.gettraveltime",
    "is.workflow.actions.adjustdate",
    "is.workflow.actions.setvariable",
    "is.workflow.actions.format.date",
    "is.workflow.actions.output",
    "is.workflow.actions.vibrate",
}


def load(relative: str) -> dict:
    return plistlib.loads((ROOT / relative).read_bytes())


def focus_trigger(workflow: dict) -> tuple[str | None, str | None]:
    triggers = workflow.get("WFWorkflowTriggers", [])
    if not triggers:
        return None, None
    if len(triggers) != 1:
        raise AssertionError("Flow has more than one embedded trigger")
    trigger = triggers[0]
    if trigger.get("WFTriggerIdentifier") != "WFUserFocusActivityTrigger":
        raise AssertionError("unexpected embedded trigger type")
    parameters = trigger.get("WFTriggerSerializedParameters", {})
    if parameters.get("WFFocusEvent") != "enable":
        raise AssertionError("Focus trigger is not enable")
    mode = parameters.get("WFFocusMode", {})
    return mode.get("DisplayString"), mode.get("Identifier")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-dir", type=Path)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    plan = json.loads(PLAN.read_text(encoding="utf-8"))
    flows = manifest["flows"]
    assert list(flows) == ["Morning Flow", "Home Flow", "Work Flow", "Out Flow"]

    morning = load(flows["Morning Flow"]["source_path"])
    morning_ids = {
        action.get("WFWorkflowActionIdentifier")
        for action in morning.get("WFWorkflowActions", [])
    }
    assert len(morning.get("WFWorkflowActions", [])) == 45
    assert not morning.get("WFWorkflowTriggers")
    assert morning_ids <= MORNING_ALLOWED_ACTIONS, sorted(morning_ids - MORNING_ALLOWED_ACTIONS)
    assert "is.workflow.actions.runworkflow" not in morning_ids
    assert plan["policy"]["morning_flow_unchanged"] is True

    expected_focus = {
        "Home Flow": ("Home", "com.apple.donotdisturb.mode.bookmarkfill"),
        "Work Flow": ("Work", "com.apple.donotdisturb.mode.mappin"),
        "Out Flow": ("Out", "com.apple.donotdisturb.mode.booksverticalfill"),
    }

    # The recovered zero-action shortcuts remain evidence of the starting point.
    for name, expected in expected_focus.items():
        baseline = load(flows[name]["source_path"])
        assert baseline.get("WFWorkflowActions", []) == [], name
        assert focus_trigger(baseline) == expected, name
        entry = plan["flows"][name]
        assert entry["children"] == ["YOS Battery Sync"], name
        assert (ROOT / entry["source"]).is_file(), name

    # The older Morning Focus-triggered variant stays excluded to prevent double execution.
    variants = manifest.get("supplied_variants", [])
    assert len(variants) == 1
    old_morning = load(variants[0]["source_path"])
    assert len(old_morning.get("WFWorkflowActions", [])) == 26
    assert focus_trigger(old_morning) == (
        "Morning",
        "com.apple.donotdisturb.mode.listbullet",
    )
    assert variants[0]["canonical"] is False

    policy = plan["policy"]
    assert policy["no_new_flow_router"] is True
    assert policy["no_new_ssot"] is True
    assert policy["no_automatic_home_device_control"] is True
    assert policy["no_routine_notifications"] is True
    assert policy["shared_child"] == "YOS Battery Sync"

    if args.runtime_dir:
        runtime = args.runtime_dir
        for name in expected_focus:
            entry = plan["flows"][name]
            plist_path = runtime / f"{name}.plist"
            signed_path = runtime / f"{name}.shortcut"
            assert plist_path.is_file(), plist_path
            assert signed_path.is_file(), signed_path
            workflow = plistlib.loads(plist_path.read_bytes())
            build_flow_runtime.validate_runtime_workflow(name, workflow, entry)
            data = signed_path.read_bytes()
            assert data.startswith(b"AEA1"), name
            assert len(data) > 500, name

        morning_signed = runtime / "Morning Flow.shortcut"
        assert morning_signed.is_file()
        assert morning_signed.read_bytes().startswith(b"AEA1")

    print("Independent Flow completion audit: PASS")
    print("- Morning Flow: preserved existing 45-action triggerless implementation")
    print("- Home/Work/Out: recovered Focus triggers preserved")
    print("- Home/Work/Out: exactly one existing child call planned/built: YOS Battery Sync")
    print("- No new Flow router, SSOT, routine notification, or automatic home-device control")
    print("- Legacy Morning Focus-triggered variant remains excluded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
