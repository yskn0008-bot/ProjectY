#!/usr/bin/env python3
from __future__ import annotations
import plistlib, sys
from pathlib import Path

def fail(msg): raise SystemExit(msg)

def text_payload(action):
    value=action.get("WFWorkflowActionParameters",{}).get("WFTextActionText","")
    if isinstance(value,str): return value
    if isinstance(value,dict):
        p=value.get("Value",{})
        if isinstance(p,dict): return str(p.get("string",""))
    return ""

def uid(action):
    v=action.get("WFWorkflowActionParameters",{}).get("UUID")
    if not v: fail("missing action UUID")
    return str(v)

def attachment(output_uuid, name):
    return {
      "Value":{"OutputUUID":output_uuid,"Type":"ActionOutput","OutputName":name},
      "WFSerializationType":"WFTextTokenAttachment"
    }

def find_marker(actions, marker):
    hits=[i for i,a in enumerate(actions)
          if a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.gettext"
          and marker in text_payload(a)]
    if len(hits)!=1: fail(f"{marker}: expected one placeholder, found {len(hits)}")
    return hits[0]

def patch(path:Path, prefix:str):
    root=plistlib.loads(path.read_bytes())
    actions=root.get("WFWorkflowActions",[])
    specified=[
      a for a in actions
      if a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.date"
      and a.get("WFWorkflowActionParameters",{}).get("WFDateActionMode")=="Specified Date"
    ]
    if len(specified)!=2: fail(f"{prefix}: expected two boundary dates, found {len(specified)}")
    start_uuid,end_uuid=uid(specified[0]),uid(specified[1])

    base=f"YOS_{prefix}_"
    ri=find_marker(actions,base+"REMINDERS_PLACEHOLDER")
    ti=find_marker(actions,base+"TITLES_PLACEHOLDER")
    li=find_marker(actions,base+"LISTS_PLACEHOLDER")
    di=find_marker(actions,base+"DATES_PLACEHOLDER")
    filter_uuid=uid(actions[ri])

    filter_params={"UUID":filter_uuid,
      "WFContentItemSortProperty":"Due Date",
      "WFContentItemSortOrder":"Oldest First",
      "WFContentItemFilter":{
        "Value":{
          "WFActionParameterFilterPrefix":1,
          "WFContentPredicateBoundedDate":False,
          "WFActionParameterFilterTemplates":[
            {"Operator":1003,"Values":{
                "Date":attachment(start_uuid,"日付"),
                "AnotherDate":attachment(end_uuid,"日付")},
             "Removable":True,"Property":"Due Date"},
            {"Operator":4,"Values":{"Bool":False},"Removable":True,"Property":"Is Completed"},
            {"Operator":4,"Values":{"Bool":False},"Removable":True,"Property":"Has Alarms"}
          ]},
        "WFSerializationType":"WFContentPredicateTableTemplate"
      }
    }
    actions[ri]={"WFWorkflowActionIdentifier":"is.workflow.actions.filter.reminders",
                 "WFWorkflowActionParameters":filter_params}

    for index,prop,name in [
      (ti,"Title",f"{prefix.lower()}Titles"),
      (li,"List",f"{prefix.lower()}Lists"),
      (di,"Due Date",f"{prefix.lower()}DueDates"),
    ]:
      actions[index]={
        "WFWorkflowActionIdentifier":"is.workflow.actions.properties.reminders",
        "WFWorkflowActionParameters":{
          "UUID":uid(actions[index]),
          "CustomOutputName":name,
          "WFInput":attachment(filter_uuid,"リマインダー"),
          "WFContentItemPropertyName":prop
        }
      }

    root["WFWorkflowActions"]=actions
    root["WFWorkflowHasShortcutInputVariables"]=False
    blob=repr(root)
    ids=[a.get("WFWorkflowActionIdentifier","") for a in actions]
    for marker in (base+"REMINDERS_PLACEHOLDER",base+"TITLES_PLACEHOLDER",base+"LISTS_PLACEHOLDER",base+"DATES_PLACEHOLDER"):
      if marker in blob: fail(f"{prefix}: placeholder survived {marker}")
    if ids.count("is.workflow.actions.filter.reminders")!=1: fail(f"{prefix}: Reminder filter missing")
    if ids.count("is.workflow.actions.properties.reminders")!=3: fail(f"{prefix}: Reminder properties missing")
    if "'Property': 'Has Alarms'" not in blob or "'Bool': False" not in blob:
      fail(f"{prefix}: native Reminder notification suppression missing")
    path.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    print(f"{prefix} Alert reminder patch: PASS ({len(actions)} actions)")

if __name__=="__main__":
    if len(sys.argv)!=3 or sys.argv[2] not in ("TASK","ROUTINE"):
      fail("usage: patch_reminder_alert.py SHORTCUT.plist TASK|ROUTINE")
    patch(Path(sys.argv[1]),sys.argv[2])
