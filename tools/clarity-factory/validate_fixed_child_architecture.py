#!/usr/bin/env python3
from __future__ import annotations
import argparse
import plistlib
from pathlib import Path

def load(path: Path) -> dict:
    with path.open("rb") as fh:
        root=plistlib.load(fh)
    if not isinstance(root.get("WFWorkflowActions"), list):
        raise AssertionError(f"{path}: WFWorkflowActions missing")
    return root

def validate(parent: Path, child: Path) -> None:
    p=load(parent)
    c=load(child)
    pa=p["WFWorkflowActions"]
    ca=c["WFWorkflowActions"]
    pids=[str(a.get("WFWorkflowActionIdentifier","")) for a in pa]
    cids=[str(a.get("WFWorkflowActionIdentifier","")) for a in ca]
    runs=[a for a in pa if str(a.get("WFWorkflowActionIdentifier","")).endswith("runworkflow")]
    if len(runs)!=1:
        raise AssertionError(f"parent must contain exactly one Run Shortcut action, got {len(runs)}")
    if "YOS_OpenApp" not in repr(runs[0].get("WFWorkflowActionParameters",{})):
        raise AssertionError("parent Run Shortcut is not fixed to YOS_OpenApp")
    if any(i.endswith("openapp") for i in pids):
        raise AssertionError("parent still embeds Open App actions")
    if any(i.endswith("downloadurl") for i in pids):
        raise AssertionError("parent contains network/factory execution")
    pblob=repr(p)
    for forbidden in ("shortcutFactoryUnsignedXml","YOS Safari Auto.shortcut","hubsign.routinehub.services/sign"):
        if forbidden in pblob:
            raise AssertionError(f"Shortcut Factory leaked into parent: {forbidden}")
    if "HANDOFF_READY\\topen_app" not in pblob or "APPLIED\\topen_app" not in pblob:
        raise AssertionError("parent open_app verify/Ledger markers missing")
    if "open_app_child_verify" not in pblob:
        raise AssertionError("parent child verification failure marker missing")
    opens=[i for i in cids if i.endswith("openapp")]
    if len(opens) < 20:
        raise AssertionError(f"YOS_OpenApp allowlist incomplete: {len(opens)} Open App actions")
    cblob=repr(c)
    if "YOS_OPEN_APP_OK:safari" not in cblob:
        raise AssertionError("YOS_OpenApp Safari success token missing")
    if "YOS_OPEN_APP_BLOCKED:" not in cblob:
        raise AssertionError("YOS_OpenApp fail-closed output missing")
    if any(i.endswith("downloadurl") for i in cids):
        raise AssertionError("YOS_OpenApp must be local-only")
    print("Clarity fixed child architecture: PASS")

if __name__ == "__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("parent", type=Path)
    ap.add_argument("child", type=Path)
    a=ap.parse_args()
    validate(a.parent,a.child)
