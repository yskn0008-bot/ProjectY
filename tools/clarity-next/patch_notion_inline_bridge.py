#!/usr/bin/env python3
"""Inject the Scriptable inline Notion bridge after Cherri compilation.

Cherri treats braces inside rawAction string literals as shortcut variable
references. Keep a harmless placeholder in the .cherri source, then replace
only that exact placeholder in the compiled plist.
"""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

ACTION_ID = "dk.simonbs.Scriptable.RunScriptInlineIntent"
PLACEHOLDER = "__YOS_NOTION_BRIDGE_INLINE__"
BRIDGE_SOURCE = Path(__file__).with_name("clarity_notion_bridge.js").read_text(encoding="utf-8").rstrip("\n")
DRY_RUN_FLAG = "const YOS_BRIDGE_DRY_RUN=true;"
if BRIDGE_SOURCE.count(DRY_RUN_FLAG) != 1:
    raise SystemExit("expected one standalone dry-run guard in Scriptable bridge")
BRIDGE_SCRIPT = BRIDGE_SOURCE.replace(DRY_RUN_FLAG, "const YOS_BRIDGE_DRY_RUN=false;", 1)


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    matches = []
    for action in actions:
        if action.get("WFWorkflowActionIdentifier") != ACTION_ID:
            continue
        params = action.get("WFWorkflowActionParameters")
        if not isinstance(params, dict):
            continue
        if params.get("script") == PLACEHOLDER:
            matches.append(params)

    if len(matches) != 1:
        raise SystemExit(f"expected one Notion bridge placeholder, found {len(matches)}")

    matches[0]["script"] = BRIDGE_SCRIPT

    if PLACEHOLDER in repr(root):
        raise SystemExit("Notion bridge placeholder survived injection")
    if "YOS_NOTION_INTEGRATION_TOKEN" not in repr(root):
        raise SystemExit("Notion bridge token key missing after injection")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    print("Clarity Next Notion inline bridge injection: PASS")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("shortcut", type=Path)
    args = ap.parse_args()
    patch(args.shortcut)
