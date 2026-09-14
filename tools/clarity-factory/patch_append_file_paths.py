#!/usr/bin/env python3
"""Patch compiled Clarity file.append actions for iOS 26 file destination semantics.

Shortcuts expects both a destination folder (WFFile) and a relative file path
(WFFilePath) for file.append. Cherri v2.3.0's DSL exposes only WFFilePath, while
our resolved-file workaround supplied only WFFile. This patch converts the
resolved file reference into its parent directory and adds the concrete filename.
"""

from __future__ import annotations

import argparse
import plistlib
import uuid
from pathlib import Path

TARGETS = {
    "Clarity Inbox.txt",
    "Clarity Ledger.txt",
    "Idea in Box.txt",
}


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


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    file_outputs: dict[str, str] = {}
    parent_outputs: dict[str, str] = {}
    patched_actions: list[dict] = []

    for action in actions:
        ident = str(action.get("WFWorkflowActionIdentifier", ""))
        params = action.get("WFWorkflowActionParameters", {})

        if ident.endswith("documentpicker.open") and isinstance(params, dict):
            file_path = params.get("WFGetFilePath")
            action_uuid = params.get("UUID")
            patched_actions.append(action)
            if file_path in TARGETS and action_uuid:
                file_outputs[str(action_uuid)] = str(file_path)
                parent_uuid = str(uuid.uuid4()).upper()
                parent_outputs[str(action_uuid)] = parent_uuid
                patched_actions.append(
                    {
                        "WFWorkflowActionIdentifier": "is.workflow.actions.getparentdirectory",
                        "WFWorkflowActionParameters": {
                            "UUID": parent_uuid,
                            "WFInput": attachment(str(action_uuid), "File"),
                        },
                    }
                )
            continue

        if ident.endswith("file.append") and isinstance(params, dict):
            source_uuid = referenced_uuid(params.get("WFFile"))
            if source_uuid in file_outputs:
                filename = file_outputs[source_uuid]
                params = dict(params)
                params["WFFile"] = attachment(parent_outputs[source_uuid], "Parent Directory")
                params["WFFilePath"] = filename
                action = dict(action)
                action["WFWorkflowActionParameters"] = params
            patched_actions.append(action)
            continue

        patched_actions.append(action)

    root["WFWorkflowActions"] = patched_actions

    append_actions = [
        a for a in patched_actions
        if str(a.get("WFWorkflowActionIdentifier", "")).endswith("file.append")
    ]
    if not append_actions:
        raise SystemExit("no file.append actions found")

    for index, action in enumerate(append_actions):
        params = action.get("WFWorkflowActionParameters", {})
        file_path = params.get("WFFilePath") if isinstance(params, dict) else None
        folder_uuid = referenced_uuid(params.get("WFFile")) if isinstance(params, dict) else None
        if file_path not in TARGETS:
            raise SystemExit(f"append #{index} missing concrete target path: {file_path!r}")
        if folder_uuid not in set(parent_outputs.values()):
            raise SystemExit(f"append #{index} does not reference a resolved parent folder")

    if set(file_outputs.values()) != TARGETS:
        raise SystemExit(
            f"expected resolved files {sorted(TARGETS)}, found {sorted(file_outputs.values())}"
        )

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    print(
        "Clarity append destination patch: PASS "
        f"({len(append_actions)} appends, {len(parent_outputs)} resolved parent folders)"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
