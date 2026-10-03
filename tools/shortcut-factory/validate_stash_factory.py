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

    # Routine save/copy/add operations must stay silent.
    if actions_with(stash, "is.workflow.actions.notification"):
        fail("STASH must not emit routine notifications")
    if actions_with(add, "is.workflow.actions.notification"):
        fail("STASH Add must not emit routine notifications")

    # Read mode must split the exact storage delimiter, build a compact
    # display-only list, map the selected short label back to the exact raw
    # item, copy it, and consume that exact item.
    split_actions = actions_with(stash, "is.workflow.actions.text.split")
    storage_splits = [
        a for a in split_actions
        if params(a).get("WFTextSeparator") == "Custom"
        and params(a).get("WFTextCustomSeparator") == "\n===YOS_NEXT===\n"
    ]
    if len(storage_splits) != 1:
        fail(f"STASH expected one full-delimiter split, found {len(storage_splits)}")

    if len(actions_with(stash, "is.workflow.actions.repeat.each")) < 1:
        fail("STASH readable-menu repeat block missing")
    append_menu = actions_with(stash, "is.workflow.actions.appendvariable")
    if not any(params(a).get("WFVariableName") == "displayItems" for a in append_menu):
        fail("STASH compact menu assembly missing")

    # The old vCard/contact menu caused selected items not to map reliably back
    # to clipboard text. It must not return.
    if actions_with(stash, "is.workflow.actions.setitemname"):
        fail("STASH must not rebuild the old vCard menu")
    if ".contact" in stash_blob or "STASH Menu.vcf" in stash_blob:
        fail("STASH old contact/vCard menu still present")

    choose = actions_with(stash, "is.workflow.actions.choosefromlist")
    if len(choose) != 1:
        fail(f"STASH expected one choose-list action, found {len(choose)}")
    choose_params = params(choose[0])
    if choose_params.get("WFChooseFromListActionPrompt") != "STASH｜使うものを選択":
        fail("STASH choose-list prompt missing")
    if "displayItems" not in repr(choose_params.get("WFInput")):
        fail("STASH choose-list must use the compact displayItems list")

    # A 28-character preview cap must exist in the compiled shortcut.
    if "^.{1,28}" not in stash_blob:
        fail("STASH compact 28-character preview cap missing")

    list_items = actions_with(stash, "is.workflow.actions.getitemfromlist")
    exact_raw_lookups = [
        a for a in list_items
        if "rawItems" in repr(params(a).get("WFInput"))
        and "chosenIndex" in repr(params(a).get("WFItemIndex"))
    ]
    if len(exact_raw_lookups) != 1:
        fail("STASH selected compact label is not mapped back to exact raw item")

    if len(actions_with(stash, "is.workflow.actions.setclipboard")) != 1:
        fail("STASH exact clipboard action missing")

    replacements = actions_with(stash, "is.workflow.actions.text.replace")
    consume_replacements = [
        a for a in replacements
        if "consumedEntry" in repr(params(a).get("WFReplaceTextFind"))
    ]
    if len(consume_replacements) != 1:
        fail("STASH exact consume-after-copy replacement missing")

    saves = actions_with(stash, "is.workflow.actions.documentpicker.save")
    if len(saves) != 1:
        fail(f"STASH expected one POCKET rewrite after consume, found {len(saves)}")
    save = params(saves[0])
    if save.get("WFFileDestinationPath") != "POCKET.txt":
        fail(f"STASH consume save path is wrong: {save}")
    if save.get("WFAskWhereToSave") is not False:
        fail(f"STASH must never ask for a save destination: {save}")
    if save.get("WFSaveFileOverwrite") is not True:
        fail(f"STASH consume save must overwrite existing POCKET.txt: {save}")
    if "remaining" not in repr(save.get("WFInput")):
        fail("STASH consume save is not wired to remaining content")

    # STASH Add must stay a thin silent wrapper:
    # Shortcut Input/clipboard -> exact duplicate read -> existing STASH.
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
    print("STASH compact exact-copy consume contract: PASS")
    print("STASH no-save-prompt + silent routine contract: PASS")
    print(f"STASH Add thin silent wrapper + dedupe structure: PASS ({len(add_ids)} actions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
