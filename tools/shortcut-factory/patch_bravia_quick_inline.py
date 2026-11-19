#!/usr/bin/env python3
"""Inject public quick-control UI into a NEW unsigned Shortcuts candidate only."""
import argparse
import plistlib
from pathlib import Path

INTENT="dk.simonbs.Scriptable.RunScriptInlineIntent"
MARKER="__YOS_BRAVIA_QUICK_MEDIA_INLINE__"

def patch(shortcut, script_path):
    root=plistlib.loads(shortcut.read_bytes())
    actions=root.get("WFWorkflowActions",[])
    found=[a for a in actions if a.get("WFWorkflowActionIdentifier")==INTENT and
           MARKER in repr(a.get("WFWorkflowActionParameters",{}).get("script"))]
    if len(found)!=1:
        raise SystemExit("Expected exactly one typed Scriptable Quick TEST action")
    source=script_path.read_text(encoding="utf-8")
    for required in ("YOS Remote Hub v6.6","const QUICK_APP_MATCHERS","id=\"quickLayer\"",
                     "getApplicationList","getSoundSettings","pictureMode","extInput:hdmi?port=3",
                     "VPN接続・解除の直接操作はまだ非対応"):
        if required not in source: raise SystemExit("Required safe component absent")
    for banned in ("ntn_","sk-proj-","YOS_NOTION_INTEGRATION_TOKEN","api.notion.com"):
        if banned in source: raise SystemExit("No private credentials may be embedded")
    params=found[0]["WFWorkflowActionParameters"]
    if params.get("runInApp") is not False or params.get("ShowWhenRun") is not False:
        raise SystemExit("Unexpected foreground/prompt flags")
    params["script"]={"Value":{"string":source},"WFSerializationType":"WFTextTokenString"}
    shortcut.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    verify=plistlib.loads(shortcut.read_bytes())
    embedded=[a for a in verify["WFWorkflowActions"] if a.get("WFWorkflowActionIdentifier")==INTENT]
    assert len(embedded)==1
    assert embedded[0]["WFWorkflowActionParameters"]["script"]["Value"]["string"]==source
    print(f"BRAVIA QUICK SCRIPTABLE INLINE PASS: {len(source)} source chars")

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("shortcut",type=Path)
    p.add_argument("--script",type=Path,required=True)
    a=p.parse_args()
    patch(a.shortcut,a.script)
