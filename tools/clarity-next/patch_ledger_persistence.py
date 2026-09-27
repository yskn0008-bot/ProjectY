#!/usr/bin/env python3
"""Rewrite Clarity Next ledger appends to iPhone-safe read/merge/save writes."""

from __future__ import annotations
import argparse
import copy
import plistlib
import uuid
from pathlib import Path

TARGET = "Clarity Next Ledger.txt"

def new_uuid() -> str:
    return str(uuid.uuid4()).upper()

def attachment(output_uuid: str, output_name: str) -> dict:
    return {
        "Value": {
            "OutputUUID": output_uuid,
            "Type": "ActionOutput",
            "OutputName": output_name,
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }

def referenced_uuid(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    payload = value.get("Value")
    if not isinstance(payload, dict):
        return None
    result = payload.get("OutputUUID")
    return str(result) if result else None

def action_output_payload(value: object) -> dict:
    if not isinstance(value, dict):
        raise SystemExit("append input is not a token attachment")
    payload = value.get("Value")
    if not isinstance(payload, dict) or payload.get("Type") != "ActionOutput":
        raise SystemExit("append input is not an ActionOutput")
    return copy.deepcopy(payload)

def rewrite_append(original_input: dict) -> list[dict]:
    open_uuid = new_uuid()
    existing_text_uuid = new_uuid()
    combined_uuid = new_uuid()
    save_uuid = new_uuid()

    return [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.documentpicker.open",
            "WFWorkflowActionParameters": {
                "UUID": open_uuid,
                "CustomOutputName": f"Current {TARGET}",
                "WFGetFilePath": TARGET,
                "WFFileErrorIfNotFound": False,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.detect.text",
            "WFWorkflowActionParameters": {
                "UUID": existing_text_uuid,
                "CustomOutputName": f"Existing {TARGET}",
                "WFInput": attachment(open_uuid, f"Current {TARGET}"),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": combined_uuid,
                "CustomOutputName": f"Updated {TARGET}",
                "WFTextActionText": {
                    "Value": {
                        "attachmentsByRange": {
                            "{0, 1}": {
                                "OutputUUID": existing_text_uuid,
                                "Type": "ActionOutput",
                                "OutputName": f"Existing {TARGET}",
                            },
                            "{1, 1}": original_input,
                        },
                        "string": "\ufffc\ufffc",
                    },
                    "WFSerializationType": "WFTextTokenString",
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.documentpicker.save",
            "WFWorkflowActionParameters": {
                "UUID": save_uuid,
                "WFAskWhereToSave": False,
                "WFFileDestinationPath": TARGET,
                "WFInput": attachment(combined_uuid, f"Updated {TARGET}"),
                "WFSaveFileOverwrite": True,
            },
        },
    ]

def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    file_outputs: dict[str, str] = {}
    for action in actions:
        ident = str(action.get("WFWorkflowActionIdentifier", ""))
        params = action.get("WFWorkflowActionParameters", {})
        if ident.endswith("documentpicker.open") and isinstance(params, dict):
            action_uuid = params.get("UUID")
            file_path = params.get("WFGetFilePath")
            if action_uuid and file_path == TARGET:
                file_outputs[str(action_uuid)] = TARGET

    rewritten: list[dict] = []
    count = 0
    for action in actions:
        ident = str(action.get("WFWorkflowActionIdentifier", ""))
        params = action.get("WFWorkflowActionParameters", {})
        if ident.endswith("file.append"):
            if not isinstance(params, dict):
                raise SystemExit("file.append parameters missing")
            direct = params.get("WFFilePath")
            source_uuid = referenced_uuid(params.get("WFFile"))
            mapped = file_outputs.get(source_uuid or "")
            if direct != TARGET and mapped != TARGET:
                raise SystemExit(
                    f"unexpected append target: WFFilePath={direct!r}, source_uuid={source_uuid!r}"
                )
            rewritten.extend(rewrite_append(action_output_payload(params.get("WFInput"))))
            count += 1
            continue
        rewritten.append(action)

    if count == 0:
        raise SystemExit("no Clarity Next ledger appends found")

    root["WFWorkflowActions"] = rewritten
    if any(str(a.get("WFWorkflowActionIdentifier", "")).endswith("file.append") for a in rewritten):
        raise SystemExit("file.append survived rewrite")

    saves = [
        a for a in rewritten
        if str(a.get("WFWorkflowActionIdentifier", "")).endswith("documentpicker.save")
        and a.get("WFWorkflowActionParameters", {}).get("WFFileDestinationPath") == TARGET
    ]
    if len(saves) != count:
        raise SystemExit(f"expected {count} ledger saves, found {len(saves)}")

    for action in saves:
        p = action["WFWorkflowActionParameters"]
        if p.get("WFAskWhereToSave") is not False or p.get("WFSaveFileOverwrite") is not True:
            raise SystemExit("unsafe ledger save parameters")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    print(f"Clarity Next ledger persistence rewrite: PASS ({count} appends -> {count} read/merge/save writes)")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("shortcut", type=Path)
    args = ap.parse_args()
    patch(args.shortcut)
