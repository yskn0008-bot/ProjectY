#!/usr/bin/env python3
"""Inject the dry-run YOS Notion bridge into compiled Clarity artifacts.

The source stays in one readable JS file; the compiled Shortcut contains its
inline Scriptable payload. Dry-run is required for every test-copy artifact.
"""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

ACTION_ID = "dk.simonbs.Scriptable.RunScriptInlineIntent"
PLACEHOLDER = "__CLARITY_VOICE_NOTION_BRIDGE__"
BRIDGE_SOURCE = Path(__file__).with_name("clarity_voice_notion_bridge.js").read_text(encoding="utf-8").rstrip("\n")
DRY_RUN_FLAG = "const YOS_BRIDGE_DRY_RUN=true;"
if BRIDGE_SOURCE.count(DRY_RUN_FLAG) != 1:
    raise SystemExit("expected one dry-run guard in Clarity voice bridge")


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
        if isinstance(params, dict) and params.get("script") == PLACEHOLDER:
            matches.append(params)

    if len(matches) != 1:
        raise SystemExit(f"expected one Clarity voice Notion bridge placeholder, found {len(matches)}")

    matches[0]["script"] = BRIDGE_SOURCE
    blob = repr(root)
    if PLACEHOLDER in blob:
        raise SystemExit("Clarity voice Notion bridge placeholder survived injection")
    if "const YOS_BRIDGE_DRY_RUN=true;" not in blob:
        raise SystemExit("Clarity voice test bridge is not guarded as dry-run")
    if "const YOS_BRIDGE_DRY_RUN=false;" in blob:
        raise SystemExit("live Notion writes are forbidden in the Clarity voice test artifact")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    print("Clarity voice dry-run Notion bridge injection: PASS")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("shortcut", type=Path)
    args = ap.parse_args()
    patch(args.shortcut)
