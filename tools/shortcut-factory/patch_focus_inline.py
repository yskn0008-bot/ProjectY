#!/usr/bin/env python3
"""Inject the secret-free Scriptable runtime used by the Focus shortcut."""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

ACTION_ID = "dk.simonbs.Scriptable.RunScriptInlineIntent"
PLACEHOLDER = "__YOS_FOCUS_INLINE__"

SCRIPT = r'''const FEED='https://project-y-yos-ai.vercel.app/api/yos/widget';
const TOKEN_KEY='MY_WAY_WIDGET_TOKEN';
const FALLBACK='scriptable:///run?scriptName=YOS%20Dashboard%20v2&action=baseHome';
const ALLOWED=new Set(['https:','http:','shortcuts:','scriptable:','calshow:']);

function safeTarget(value){
  const raw=String(value||'').trim();
  if(!raw||raw.length>2000)return '';
  try{
    const parsed=new URL(raw);
    return ALLOWED.has(parsed.protocol)?raw:'';
  }catch{return '';}
}

let target=FALLBACK;
try{
  if(Keychain.contains(TOKEN_KEY)){
    const token=String(Keychain.get(TOKEN_KEY)||'').trim();
    if(token){
      const request=new Request(FEED);
      request.method='GET';
      request.headers={Authorization:'Bearer '+token,Accept:'application/json'};
      request.timeoutInterval=8;
      const data=await request.loadJSON();
      const status=Number(request.response?.statusCode||0);
      if(status===200&&data&&typeof data==='object'){
        const action=safeTarget(data.task?.actionUrl);
        if(action)target=action;
      }
    }
  }
}catch{}
Safari.open(target);
Script.complete();'''


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    matches = []
    for action in root.get("WFWorkflowActions", []):
        if action.get("WFWorkflowActionIdentifier") not in (ACTION_ID, "is.workflow.actions.rawaction"):
            continue
        params = action.get("WFWorkflowActionParameters", {})
        raw = params.get("script")
        value = raw.get("Value", {}).get("string", "") if isinstance(raw, dict) else raw
        if value == PLACEHOLDER:
            action["WFWorkflowActionIdentifier"] = ACTION_ID
            matches.append(params)

    if len(matches) != 1:
        action_summary = [(a.get("WFWorkflowActionIdentifier"), repr(a.get("WFWorkflowActionParameters", {}))[:1200]) for a in root.get("WFWorkflowActions", [])]
        raise SystemExit(f"expected one Focus inline placeholder, found {len(matches)}; actions={action_summary}")

    matches[0]["script"] = {
        "Value": {"string": SCRIPT},
        "WFSerializationType": "WFTextTokenString",
    }

    blob = repr(root)
    if PLACEHOLDER in blob:
        raise SystemExit("Focus placeholder survived injection")
    for required in (
        "MY_WAY_WIDGET_TOKEN",
        "https://project-y-yos-ai.vercel.app/api/yos/widget",
        "YOS%20Dashboard%20v2&action=baseHome",
        "data.task?.actionUrl",
    ):
        if required not in blob:
            raise SystemExit(f"Focus runtime missing: {required}")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    print("Focus inline runtime injection: PASS")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("shortcut", type=Path)
    args = ap.parse_args()
    patch(args.shortcut)
