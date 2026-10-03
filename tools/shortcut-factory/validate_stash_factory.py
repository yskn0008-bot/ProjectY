#!/usr/bin/env python3
from __future__ import annotations

import plistlib
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(message)


def ids(workflow: dict) -> list[str]:
    actions = workflow.get("WFWorkflowActions")
    if not isinstance(actions, list):
        fail("WFWorkflowActions missing")
    return [str(a.get("WFWorkflowActionIdentifier", "")) for a in actions]


def load(path: str) -> tuple[dict, str, list[str]]:
    data = Path(path).read_bytes()
    workflow = plistlib.loads(data)
    return workflow, repr(workflow), ids(workflow)


def actions_with(workflow: dict, identifier: str) -> list[dict]:
    return [
        action
        for action in workflow.get("WFWorkflowActions", [])
        if str(action.get("WFWorkflowActionIdentifier", "")) == identifier
    ]


def params(action: dict) -> dict:
    value = action.get("WFWorkflowActionParameters")
    return value if isinstance(value, dict) else {}


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: validate_stash_factory.py <STASH unsigned> <STASH Add unsigned>", file=sys.stderr)
        return 2

    stash, stash_blob, stash_ids = load(sys.argv[1])
    add, add_blob, add_ids = load(sys.argv[2])

    # Existing STASH storage contract stays exactly on POCKET.txt + delimiter.
    if "POCKET.txt" not in stash_blob or "===YOS_NEXT===" not in stash_blob:
        fail("STASH storage contract missing")
    if not any(i.endswith("file.append") for i in stash_ids):
        fail(f"STASH resolved append action missing: {stash_ids}")
    if any(i.endswith("downloadurl") or i.endswith("openurl") for i in stash_ids):
        fail("STASH unexpectedly contains network/open-url action")

    # Read mode must split the complete delimiter, build a readable vCard menu,
    # map the chosen numbered title back to the exact raw item, copy it, then
    # consume that exact item from the existing POCKET.txt.
    split_actions = actions_with(stash, "is.workflow.actions.text.split")
    if len(split_actions) != 1:
        fail(f"STASH expected one split action, found {len(split_actions)}")
    split = params(split_actions[0])
    if split.get("WFTextSeparator") != "Custom" or split.get("WFTextCustomSeparator") != "\n===YOS_NEXT===\n":
        fail(f"STASH must split the full storage delimiter: {split}")

    if len(actions_with(stash, "is.workflow.actions.repeat.each")) != 2:
        fail("STASH readable menu repeat block missing")
    append_menu = actions_with(stash, "is.workflow.actions.appendvariable")
    if not any(params(a).get("WFVariableName") == "displayItems" for a in append_menu):
        fail("STASH readable vCard menu assembly missing")

    named_items = actions_with(stash, "is.workflow.actions.setitemname")
    if not any(params(a).get("WFName") == "STASH Menu.vcf" for a in named_items):
        fail("STASH vCard menu file missing")

    choose = actions_with(stash, "is.workflow.actions.choosefromlist")
    if len(choose) != 1 or params(choose[0]).get("WFChooseFromListActionPrompt") != "STASH｜使うものを選択":
        fail("STASH readable choose-list prompt missing")
    if len(actions_with(stash, "is.workflow.actions.detect.number")) != 1:
        fail("STASH chosen numbered title -> item index mapping missing")

    list_items = actions_with(stash, "is.workflow.actions.getitemfromlist")
    if len(list_items) != 1:
        fail("STASH exact raw-item lookup missing")
    item_params = params(list_items[0])
    if "rawItems" not in repr(item_params.get("WFInput")) or "chosenIndex" not in repr(item_params.get("WFItemIndex")):
        fail(f"STASH selection is not mapped back to exact raw item: {item_params}")

    if len(actions_with(stash, "is.workflow.actions.setclipboard")) != 1:
        fail("STASH clipboard action missing")
    replacements = actions_with(stash, "is.workflow.actions.text.replace")
    if len(replacements) != 1 or "consumedEntry" not in repr(params(replacements[0]).get("WFReplaceTextFind")):
        fail("STASH exact consume-after-copy replacement missing")

    saves = actions_with(stash, "is.workflow.actions.documentpicker.save")
    if len(saves) != 1:
        fail(f"STASH expected one POCKET rewrite after consume, found {len(saves)}")
    save = params(saves[0])
    if save.get("WFFileDestinationPath") != "POCKET.txt" or save.get("WFSaveFileOverwrite") is not True:
        fail(f"STASH consume save must rewrite existing POCKET.txt: {save}")
    if "remaining" not in repr(save.get("WFInput")):
        fail("STASH consume save is not wired to remaining content")
    if "コピーしてSTASHから削除しました" not in stash_blob:
        fail("STASH consume-after-copy user feedback missing")

    # STASH Add must stay a thin wrapper: Shortcut Input/clipboard -> exact
    # duplicate read -> existing STASH. It must never own persistence.
    if "POCKET.txt" not in add_blob or "===YOS_NEXT===" not in add_blob:
        fail("STASH Add duplicate guard contract missing")
    if len(actions_with(add, "is.workflow.actions.getclipboard")) != 1:
        fail("STASH Add clipboard action missing")

    pocket_reads = actions_with(add, "is.workflow.actions.documentpicker.open")
    if len(pocket_reads) != 1:
        fail("STASH Add expected one optional POCKET read for dedupe")
    pocket_read = params(pocket_reads[0])
    if pocket_read.get("WFGetFilePath") != "POCKET.txt" or pocket_read.get("WFFileErrorIfNotFound") is not False:
        fail(f"STASH Add POCKET dedupe read is incorrect: {pocket_read}")

    contains_checks = [
        a for a in actions_with(add, "is.workflow.actions.conditional")
        if params(a).get("WFCondition") == 99
    ]
    if len(contains_checks) != 1 or "expectedEntry" not in repr(params(contains_checks[0])):
        fail("STASH Add exact-entry duplicate guard missing")

    run_actions = actions_with(add, "is.workflow.actions.runworkflow")
    if len(run_actions) != 1:
        fail(f"STASH Add must call existing STASH exactly once: {run_actions}")
    run = params(run_actions[0])
    if run.get("WFWorkflowName") != "STASH" or "stashItem" not in repr(run.get("WFInput")):
        fail(f"STASH Add handoff is not wired to existing STASH input: {run}")

    if any(i.endswith("file.append") or i.endswith("documentpicker.save") for i in add_ids):
        fail("STASH Add must not write POCKET.txt directly")
    if any(i.endswith("downloadurl") or i.endswith("openurl") for i in add_ids):
        fail("STASH Add unexpectedly contains network/open-url action")

    print(f"STASH factory structure: PASS ({len(stash_ids)} actions)")
    print("STASH readable consume-after-copy contract: PASS")
    print(f"STASH Add thin-wrapper + dedupe structure: PASS ({len(add_ids)} actions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
