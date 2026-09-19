#!/usr/bin/env python3
"""Rewrite Clarity persistence to iPhone-safe read/merge/save actions.

Real-device evidence showed two failure modes in iOS Shortcuts:
1. path-only ``file.append`` could finish without persisting; and
2. adding ``getparentdirectory`` fixes the missing path field but that action is
   Mac-only on the target iPhone.

To avoid both paths, every compiled ``file.append`` is replaced with only
cross-platform Files actions:

    Get File -> Get Text from Input -> Text(existing + new record) -> Save File

``Get File`` is explicitly non-fatal when the file does not exist. The following
Get Text step therefore yields empty text for a missing file, and ``Save File``
creates the file with the new record. Existing files are read, merged, and
written back with overwrite enabled. No Get Parent Directory action is emitted.
"""

from __future__ import annotations

import argparse
import copy
import plistlib
import uuid
from pathlib import Path

TARGETS = {
    "Clarity Inbox.txt",
    "Clarity Ledger.txt",
    "Idea in Box.txt",
}


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


def target_for_append(params: dict, file_outputs: dict[str, str]) -> str:
    direct = params.get("WFFilePath")
    if direct in TARGETS:
        return str(direct)
    source_uuid = referenced_uuid(params.get("WFFile"))
    mapped = file_outputs.get(source_uuid or "")
    if mapped in TARGETS:
        return str(mapped)
    raise SystemExit(
        f"cannot resolve append target: WFFilePath={direct!r}, source_uuid={source_uuid!r}"
    )


def rewrite_append(target: str, original_input: dict) -> list[dict]:
    open_uuid = new_uuid()
    existing_text_uuid = new_uuid()
    combined_uuid = new_uuid()
    save_uuid = new_uuid()

    open_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.documentpicker.open",
        "WFWorkflowActionParameters": {
            "UUID": open_uuid,
            "CustomOutputName": f"Current {target}",
            "WFGetFilePath": target,
            "WFFileErrorIfNotFound": False,
        },
    }

    text_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.detect.text",
        "WFWorkflowActionParameters": {
            "UUID": existing_text_uuid,
            "CustomOutputName": f"Existing {target}",
            "WFInput": attachment(open_uuid, f"Current {target}"),
        },
    }

    combined_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": combined_uuid,
            "CustomOutputName": f"Updated {target}",
            "WFTextActionText": {
                "Value": {
                    "attachmentsByRange": {
                        "{0, 1}": {
                            "OutputUUID": existing_text_uuid,
                            "Type": "ActionOutput",
                            "OutputName": f"Existing {target}",
                        },
                        "{1, 1}": original_input,
                    },
                    "string": "\ufffc\ufffc",
                },
                "WFSerializationType": "WFTextTokenString",
            },
        },
    }

    save_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.documentpicker.save",
        "WFWorkflowActionParameters": {
            "UUID": save_uuid,
            "WFAskWhereToSave": False,
            "WFFileDestinationPath": target,
            "WFInput": attachment(combined_uuid, f"Updated {target}"),
            "WFSaveFileOverwrite": True,
        },
    }

    return [open_action, text_action, combined_action, save_action]


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    # Map existing Cherri getFile(path) outputs to their concrete target files.
    file_outputs: dict[str, str] = {}
    for action in actions:
        ident = str(action.get("WFWorkflowActionIdentifier", ""))
        params = action.get("WFWorkflowActionParameters", {})
        if ident.endswith("documentpicker.open") and isinstance(params, dict):
            file_path = params.get("WFGetFilePath")
            action_uuid = params.get("UUID")
            if file_path in TARGETS and action_uuid:
                file_outputs[str(action_uuid)] = str(file_path)

    rewritten: list[dict] = []
    append_count = 0
    target_counts = {name: 0 for name in TARGETS}

    for action in actions:
        ident = str(action.get("WFWorkflowActionIdentifier", ""))
        params = action.get("WFWorkflowActionParameters", {})

        if "getparentdirectory" in ident.lower():
            raise SystemExit("Mac-only getparentdirectory found before rewrite")

        if ident.endswith("file.append"):
            if not isinstance(params, dict):
                raise SystemExit("file.append parameters missing")
            target = target_for_append(params, file_outputs)
            original_input = action_output_payload(params.get("WFInput"))
            rewritten.extend(rewrite_append(target, original_input))
            append_count += 1
            target_counts[target] += 1
            continue

        rewritten.append(action)

    if append_count == 0:
        raise SystemExit("no file.append actions found to rewrite")

    root["WFWorkflowActions"] = rewritten

    identifiers = [str(a.get("WFWorkflowActionIdentifier", "")) for a in rewritten]
    if any(identifier.endswith("file.append") for identifier in identifiers):
        raise SystemExit("file.append survived iPhone persistence rewrite")
    if any("getparentdirectory" in identifier.lower() for identifier in identifiers):
        raise SystemExit("Mac-only getparentdirectory survived iPhone persistence rewrite")

    save_actions = [
        a for a in rewritten
        if str(a.get("WFWorkflowActionIdentifier", "")).endswith("documentpicker.save")
    ]
    if len(save_actions) != append_count:
        raise SystemExit(
            f"expected {append_count} replacement saves, found {len(save_actions)}"
        )

    observed_targets: dict[str, int] = {name: 0 for name in TARGETS}
    for index, action in enumerate(save_actions):
        params = action.get("WFWorkflowActionParameters", {})
        if not isinstance(params, dict):
            raise SystemExit(f"save #{index} parameters missing")
        target = params.get("WFFileDestinationPath")
        if target not in TARGETS:
            raise SystemExit(f"save #{index} has unexpected path {target!r}")
        if params.get("WFAskWhereToSave") is not False:
            raise SystemExit(f"save #{index} unexpectedly prompts for destination")
        if params.get("WFSaveFileOverwrite") is not True:
            raise SystemExit(f"save #{index} is not overwrite-enabled")
        observed_targets[str(target)] += 1

    if observed_targets != target_counts:
        raise SystemExit(
            f"replacement target counts changed: expected {target_counts}, got {observed_targets}"
        )

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    print(
        "Clarity iPhone persistence rewrite: PASS "
        f"({append_count} appends -> {len(save_actions)} read/merge/save writes; "
        "0 file.append; 0 getparentdirectory)"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
