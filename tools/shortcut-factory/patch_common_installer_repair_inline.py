#!/usr/bin/env python3
"""Inject the reviewed, secret-free one-time Scriptable repair into a Shortcut Factory build."""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

ACTION_ID = "dk.simonbs.Scriptable.RunScriptInlineIntent"
PLACEHOLDER = "__YOS_COMMON_INSTALLER_REPAIR_INLINE__"
REQUIRED = (
    "8bb289519b0f4f6c907b27f336a623bc5669e669",
    "0f0af090deec3c9c523ee885d37f4d5394321bd009f8e04962deff91ea3fc0b0",
    "bootstrap-backups",
    "function digest(text)",
    "YOS BRAVIA Picture Off",
    "既存コードを保護して停止",
)


def patch(path: Path, source: Path) -> None:
    runtime = source.read_text("utf-8")
    if not runtime.startswith("// YOS Common Installer safe one-time repair"):
        raise ValueError("unexpected inline runtime source")
    if len(runtime) > 50000 or len(runtime) < 7500:
        raise ValueError("runtime length out of accepted range")
    for needle in REQUIRED:
        if needle not in runtime:
            raise ValueError("runtime missing required safety contract: " + needle)

    with path.open("rb") as fh:
        payload = plistlib.load(fh)

    target = []
    for action in payload.get("WFWorkflowActions", []):
        if action.get("WFWorkflowActionIdentifier") != ACTION_ID:
            continue
        params = action.get("WFWorkflowActionParameters", {})
        if params.get("script") == PLACEHOLDER:
            target.append(params)

    if len(target) != 1:
        raise ValueError(f"expected exactly one known Scriptable inline action, found {len(target)}")
    target[0]["script"] = {
        "Value": {"string": runtime},
        "WFSerializationType": "WFTextTokenString",
    }
    # Confirm the only executable action is the one declared for this bootstrap.
    actions = payload.get("WFWorkflowActions", [])
    if len(actions) != 1 or actions[0].get("WFWorkflowActionIdentifier") != ACTION_ID:
        raise ValueError("unexpected shortcut action graph")
    params = actions[0]["WFWorkflowActionParameters"]
    if params.get("runInApp") is not True:
        raise ValueError("repair must run in Scriptable app for user confirmation")
    if PLACEHOLDER in repr(payload):
        raise ValueError("unexpanded placeholder")

    with path.open("wb") as fh:
        plistlib.dump(payload, fh, fmt=plistlib.FMT_XML, sort_keys=False)
    print("Common Installer signed inline repair injection: PASS")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("shortcut", type=Path)
    p.add_argument("--source", type=Path, default=Path("tools/shortcut-factory/inline/common-installer-repair.js"))
    a = p.parse_args()
    patch(a.shortcut, a.source)
