#!/usr/bin/env python3
from __future__ import annotations
import json, plistlib, sys, uuid
from pathlib import Path

ROUTES = {
    "Money Alert": ("Money Alert", "https://yskn0008-bot.github.io/ProjectY/yos/#money", "money"),
    "Task Alert": ("Task Alert", "x-apple-reminderkit://", "task"),
    "Routine Alert": ("Routine Alert", "x-apple-reminderkit://", "routine"),
    "Emergency Alert": ("Emergency Alert", "https://yskn0008-bot.github.io/ProjectY/system/", "emergency"),
    "Important Mail": ("重要メール", "message://", "mail"),
}

def fail(msg): raise SystemExit(msg)

def text_token(value):
    if isinstance(value, dict) and value.get("WFSerializationType"):
        return value
    if value is None:
        value = ""
    return {"Value":{"string":str(value)},"WFSerializationType":"WFTextTokenString"}

def patch(path: Path, shortcut_name: str):
    if shortcut_name not in ROUTES: fail("unsupported shortcut name")
    default_title, default_url, thread = ROUTES[shortcut_name]
    root=plistlib.loads(path.read_bytes())
    actions=root.get("WFWorkflowActions",[])
    hits=[i for i,a in enumerate(actions) if a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.notification"]
    if len(hits)!=1: fail(f"{shortcut_name}: expected one notification, found {len(hits)}")
    i=hits[0]
    old=actions[i]
    p=old.get("WFWorkflowActionParameters",{})
    body=text_token(p.get("WFNotificationActionBody", default_title))
    title=p.get("WFNotificationActionTitle")
    if not isinstance(title,str) or not title.strip(): title=default_title
    title=title.strip()
    url=default_url
    dynamic_route=""
    if shortcut_name=="Routine Alert":
        dynamic_route="""if (/morning|朝/i.test(body)) url='shortcuts://run-shortcut?name=Morning'; else if (/night|夜/i.test(body)) url='shortcuts://run-shortcut?name=Night%20Brief';"""
    sound_line="n.sound='default';" if thread=="emergency" else ""
    code=f"""const body=((args.plainTexts||[])[0]||'').trim().replace(/^YOS_[A-Z0-9_]+_V1[^\\n]*\\n?/, '');\nif (body) {{\n  let url={json.dumps(url)};\n  {dynamic_route}\n  const n=new Notification();\n  n.title={json.dumps(title)};\n  n.body=body;\n  n.threadIdentifier={json.dumps('yos-notifications-'+thread)};\n  n.openURL=url;\n  {sound_line}\n  await n.schedule();\n}}\nScript.complete();"""
    actions[i]={
      "WFWorkflowActionIdentifier":"dk.simonbs.Scriptable.RunScriptInlineIntent",
      "WFWorkflowActionParameters":{
        "UUID":str(p.get("UUID") or uuid.uuid4()).upper(),
        "script":code,
        "texts":body,
        "runInApp":False,
        "ShowWhenRun":False,
      }
    }
    root["WFWorkflowActions"]=actions
    path.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    parsed=plistlib.loads(path.read_bytes())
    ids=[a.get("WFWorkflowActionIdentifier","") for a in parsed["WFWorkflowActions"]]
    blob=repr(parsed)
    if ids.count("is.workflow.actions.notification")!=0: fail("native notification survived")
    expected_scriptable=3 if shortcut_name=="Money Alert" else 1
    if ids.count("dk.simonbs.Scriptable.RunScriptInlineIntent")!=expected_scriptable:
        fail(f"Scriptable dispatcher count mismatch: {ids.count('dk.simonbs.Scriptable.RunScriptInlineIntent')} != {expected_scriptable}")
    if default_url not in blob: fail("deep link missing")
    if "YOS Display History" not in blob: fail("history contract missing")
    print(f"{shortcut_name} deep-link notification patch: PASS")

if __name__=="__main__":
    if len(sys.argv)!=3: fail("usage: patch_notification_deeplink.py SHORTCUT.plist 'Shortcut Name'")
    patch(Path(sys.argv[1]),sys.argv[2])
