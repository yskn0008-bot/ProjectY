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

    # STASH Add must stay a thin wrapper: clipboard/direct input -> dedupe read -> STASH.
    if "POCKET.txt" not in add_blob or "===YOS_NEXT===" not in add_blob:
        fail("STASH Add duplicate guard contract missing")
    if not any(i.endswith("getclipboard") for i in add_ids):
        fail(f"STASH Add clipboard action missing: {add_ids}")
    run_actions = [
        a for a in add.get("WFWorkflowActions", [])
        if str(a.get("WFWorkflowActionIdentifier", "")).endswith("runworkflow")
    ]
    if len(run_actions) != 1 or "STASH" not in repr(run_actions[0]):
        fail(f"STASH Add must call existing STASH exactly once: {run_actions}")
    if any(i.endswith("file.append") for i in add_ids):
        fail("STASH Add must not write POCKET.txt directly")
    if any(i.endswith("downloadurl") or i.endswith("openurl") for i in add_ids):
        fail("STASH Add unexpectedly contains network/open-url action")

    print(f"STASH factory structure: PASS ({len(stash_ids)} actions)")
    print(f"STASH Add thin-wrapper structure: PASS ({len(add_ids)} actions)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
