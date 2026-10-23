#!/usr/bin/env python3
from __future__ import annotations
import plistlib, uuid
from pathlib import Path

ENDPOINT = "https://project-y-yos-ai.vercel.app/api/yos/intake"
TOKEN_PROMPT = "Clarity接続トークン"

def action_output(output_uuid: str, output_name: str) -> dict:
    return {"Type":"ActionOutput","OutputUUID":output_uuid,"OutputName":output_name}

def attachment(output_uuid: str, output_name: str) -> dict:
    return {"Value":action_output(output_uuid, output_name),"WFSerializationType":"WFTextTokenAttachment"}

def plain(value: str) -> dict:
    return {"Value":{"string":value},"WFSerializationType":"WFTextTokenString"}

def token_string(prefix: str, output_uuid: str, output_name: str) -> dict:
    return {"Value":{"string":prefix+"\ufffc","attachmentsByRange":{f"{{{len(prefix)}, 1}}":action_output(output_uuid, output_name)}},"WFSerializationType":"WFTextTokenString"}

def dictionary(items):
    return {"Value":{"WFDictionaryFieldValueItems":[{"WFItemType":0,"WFKey":plain(k),"WFValue":v} for k,v in items]},"WFSerializationType":"WFDictionaryFieldValue"}

def output_by_name(actions, name):
    matches=[]
    for action in actions:
        p=action.get("WFWorkflowActionParameters",{})
        if p.get("CustomOutputName")==name and isinstance(p.get("UUID"),str):
            matches.append((p["UUID"],name))
    if len(matches)!=1:
        raise SystemExit(f"expected exactly one output {name}, found {len(matches)}")
    return matches[0]

def patch_shortcut(path: Path):
    root=plistlib.loads(path.read_bytes())
    actions=root.get("WFWorkflowActions")
    if not isinstance(actions,list): raise SystemExit("WFWorkflowActions missing")

    placeholder=[]
    for i,a in enumerate(actions):
        p=a.get("WFWorkflowActionParameters",{})
        if a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.gettext" and p.get("CustomOutputName")=="notionCapturePlaceholder":
            placeholder.append(i)
    if len(placeholder)!=1: raise SystemExit(f"expected one notion capture placeholder, found {len(placeholder)}")
    index=placeholder[0]

    refs={name:output_by_name(actions,name) for name in ("captureText","captureAt","captureMode","captureId")}
    token_uuid=str(uuid.uuid4())
    token_action={
      "WFWorkflowActionIdentifier":"is.workflow.actions.gettext",
      "WFWorkflowActionParameters":{"UUID":token_uuid,"CustomOutputName":"clarityToken","WFTextActionText":""}
    }
    request_uuid=str(uuid.uuid4())
    request={
      "WFWorkflowActionIdentifier":"is.workflow.actions.downloadurl",
      "WFWorkflowActionParameters":{
        "UUID":request_uuid,
        "CustomOutputName":"notionCaptureResponse",
        "WFURL":ENDPOINT,
        "WFHTTPMethod":"POST",
        "WFHTTPBodyType":"JSON",
        "WFHTTPHeaders":dictionary([
          ("Authorization",token_string("Bearer ",token_uuid,"clarityToken")),
          ("Content-Type",plain("application/json"))
        ]),
        "WFJSONValues":dictionary([
          ("rawText",attachment(*refs["captureText"])),
          ("capturedAt",attachment(*refs["captureAt"])),
          ("inputMode",attachment(*refs["captureMode"])),
          ("source",plain("clarity")),
          ("captureId",attachment(*refs["captureId"]))
        ])
      }
    }
    actions[index:index+1]=[token_action,request]
    questions=root.setdefault("WFWorkflowImportQuestions",[])
    questions.append({"ActionIndex":index,"Category":"Parameter","ParameterKey":"WFTextActionText","Text":TOKEN_PROMPT,"DefaultValue":""})
    root["WFWorkflowActions"]=actions
    path.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))

    verify=plistlib.loads(path.read_bytes())
    blob=repr(verify)
    if ENDPOINT not in blob or TOKEN_PROMPT not in blob or "notionCaptureResponse" not in blob:
        raise SystemExit("Notion intake patch verification failed")
    if "__YOS_NOTION_CAPTURE__" in blob:
        raise SystemExit("Notion placeholder survived patch")
    print("Clarity Rebuild Notion intake patch: PASS")

if __name__=="__main__":
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument("shortcut",type=Path)
    a=p.parse_args()
    patch_shortcut(a.shortcut)
