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
    if len(runs)!=2:
        raise AssertionError(f"parent must contain Safari fast-path + normal Run Shortcut actions, got {len(runs)}")
    if any("YOS_OpenApp" not in repr(r.get("WFWorkflowActionParameters",{})) for r in runs):
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
    if "child_returned" not in pblob:
        raise AssertionError("parent child-return verification marker missing")
    run_indexes = [i for i,a in enumerate(pa) if str(a.get("WFWorkflowActionIdentifier","")).endswith("runworkflow")]
    fast_applied_index = next((i for i,a in enumerate(pa) if "YOS_OpenApp" in repr(a) and "child_returned" in repr(a) and "fast_path" in repr(a)), -1)
    device_applied_index = next((i for i,a in enumerate(pa) if "YOS_Device" in repr(a) and "child_returned" in repr(a) and "fast_path" in repr(a)), -1)
    normal_applied_index = next((i for i,a in reversed(list(enumerate(pa))) if "child_returned" in repr(a) and "fast_path" not in repr(a)), -1)
    if fast_applied_index <= run_indexes[0]:
        raise AssertionError("Safari fast path can claim APPLIED before YOS_OpenApp returns")
    device_run_index = next(i for i,a in enumerate(pa) if a.get("WFWorkflowActionIdentifier","").endswith("runworkflow") and "YOS_Device" in repr(a.get("WFWorkflowActionParameters",{})))
    if device_applied_index <= device_run_index:
        raise AssertionError("brightness fast path can claim APPLIED before YOS_Device returns")
    normal_open_run_index = max(i for i,a in enumerate(pa) if a.get("WFWorkflowActionIdentifier","").endswith("runworkflow") and "YOS_OpenApp" in repr(a.get("WFWorkflowActionParameters",{})))
    if normal_applied_index <= normal_open_run_index:
        raise AssertionError("normal path can claim APPLIED before YOS_OpenApp returns")
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
    ap.add_argument("device", type=Path)
    a=ap.parse_args()
    validate(a.parent,a.child,a.device)
