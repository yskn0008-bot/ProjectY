#!/usr/bin/env python3
from __future__ import annotations

import json
import plistlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "tools" / "factory-core" / "flow_sources.json"

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
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
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
    assert "is.workflow.actions.deletefiles" not in morning_ids
    assert "is.workflow.actions.sendmessage" not in morning_ids
    assert "is.workflow.actions.setfocus" not in morning_ids

    expected_focus = {
        "Home Flow": ("Home", "com.apple.donotdisturb.mode.bookmarkfill"),
        "Work Flow": ("Work", "com.apple.donotdisturb.mode.mappin"),
        "Out Flow": ("Out", "com.apple.donotdisturb.mode.booksverticalfill"),
    }
    for name, expected in expected_focus.items():
        workflow = load(flows[name]["source_path"])
        assert workflow.get("WFWorkflowActions", []) == [], name
        assert focus_trigger(workflow) == expected, name

    variants = manifest.get("supplied_variants", [])
    assert len(variants) == 1
    old_morning = load(variants[0]["source_path"])
    assert len(old_morning.get("WFWorkflowActions", [])) == 26
    assert focus_trigger(old_morning) == (
        "Morning",
        "com.apple.donotdisturb.mode.listbullet",
    )
    assert variants[0]["canonical"] is False

    # Canonical Morning must stay singular: parent Morning calls the triggerless child.
    assert "parent Shortcut Morning" in flows["Morning Flow"]["runtime_contract"]["trigger"]
    assert "must not also run" in flows["Morning Flow"]["runtime_contract"]["duplicate_prevention"]

    # Home/Work/Out are recovered empty implementations. Do not invent work for them.
    for name in expected_focus:
        assert flows[name]["runtime_contract"]["actions"] == []

    # All canonical artifacts preserve Apple-signed bytes; no synthetic signing path is added.
    for entry in flows.values():
        assert entry["factory"]["signing_mode"] == "preserve_existing_apple_signed_artifact"
        assert (ROOT / entry["signed_path"]).is_file()

    print("Independent Flow canonicalization audit: PASS")
    print("- Morning Flow: 45 actions, triggerless child, allowed read/output/vibration action set")
    print("- Home/Work/Out: exact zero-action Focus-triggered no-op artifacts")
    print("- Legacy Morning Focus-triggered variant: detected and excluded from canonical set")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
