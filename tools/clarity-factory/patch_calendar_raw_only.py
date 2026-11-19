#!/usr/bin/env python3
"""Private, unsigned Clarity Calendar -> existing Inbox Bridge patch.

Requires a *locally decoded* Shortcut .wflow binary plist.
NEVER send a personal .shortcut / decoded plist to GitHub, HubSign, or
another external signing service. This produces an UNSIGNED candidate only.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import plistlib
import uuid
from pathlib import Path

MARKER = "\ufffc"
CALENDAR = "is.workflow.actions.addnewevent"
DICTIONARY = "is.workflow.actions.dictionary"
SCRIPTABLE = "dk.simonbs.Scriptable.ParameterizedRunScriptIntent"
BRIDGE_NAME = "YOS Clarity Inbox Bridge"


def text(value: str) -> dict:
    return {"Value": {"string": value}, "WFSerializationType": "WFTextTokenString"}


def variable(name: str) -> dict:
    return {
        "Value": {
            "string": MARKER,
            "attachmentsByRange": {
                "{0, 1}": {"Type": "Variable", "VariableName": name}
            },
        },
        "WFSerializationType": "WFTextTokenString",
    }


def output_ref(action_id: str, output_name: str) -> dict:
    return {
        "Value": {
            "Type": "ActionOutput",
            "OutputUUID": action_id,
            "OutputName": output_name,
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }


def inserted_actions() -> list[dict]:
    dictionary_id = str(uuid.uuid4()).upper()
    script_id = str(uuid.uuid4()).upper()
    packet = {
        "rawText": variable("resolvedInput"),
        "source": variable("inputMode"),
        "routeMode": text("raw-only"),
        "executionTarget": text("calendar.create"),
    }
    dictionary = {
        "WFWorkflowActionIdentifier": DICTIONARY,
        "WFWorkflowActionParameters": {
            "UUID": dictionary_id,
            "CustomOutputName": "calendarRawPacket",
            "WFItems": {
                "Value": {
                    "WFDictionaryFieldValueItems": [
                        {"WFItemType": 0, "WFKey": text(key), "WFValue": value}
                        for key, value in packet.items()
                    ]
                },
                "WFSerializationType": "WFDictionaryFieldValue",
            },
        },
    }
    runner = {
        "WFWorkflowActionIdentifier": SCRIPTABLE,
        "WFWorkflowActionParameters": {
            "UUID": script_id,
            "fileName": BRIDGE_NAME,
            "parameter": output_ref(dictionary_id, "calendarRawPacket"),
            "runInApp": False,
            "ShowWhenRun": False,
        },
    }
    return [dictionary, runner]


def patch(decoded_plist: bytes) -> tuple[bytes, dict]:
    if decoded_plist.startswith(b"AEA1"):
        raise ValueError("Signed Shortcut: privately decode before patching")
    original = plistlib.loads(decoded_plist)
    actions = original.get("WFWorkflowActions")
    if not isinstance(actions, list) or len(actions) != 1000:
        raise ValueError("Unexpected Clarity action count; refusing patch")
    events = [i for i, a in enumerate(actions)
              if a.get("WFWorkflowActionIdentifier") == CALENDAR]
    if events != [420]:
        raise ValueError("Expected only original Calendar action #421")
    if actions[421].get("WFWorkflowActionIdentifier") != "is.workflow.actions.nothing":
        raise ValueError("Original Calendar-following action is different")
    for name in ("resolvedInput", "inputMode"):
        if not any(
            x.get("WFWorkflowActionIdentifier") == "is.workflow.actions.setvariable"
            and x.get("WFWorkflowActionParameters", {}).get("WFVariableName") == name
            for x in actions[:420]
        ):
            raise ValueError(f"Required source variable missing: {name}")

    added = inserted_actions()
    old_ids = {
        a.get("WFWorkflowActionParameters", {}).get("UUID") for a in actions
    }
    if any(a["WFWorkflowActionParameters"]["UUID"] in old_ids for a in added):
        raise ValueError("Generated UUID collision")
    updated = copy.deepcopy(original)
    updated["WFWorkflowActions"][421:421] = added
    new_actions = updated["WFWorkflowActions"]

    # Verify all original actions and top-level metadata survive byte-equivalent
    # plist decoding, including private parameters and the old Notion path.
    assert new_actions[:421] == actions[:421]
    assert new_actions[423:] == actions[421:]
    assert all(original[k] == updated[k] for k in original
               if k != "WFWorkflowActions")
    encoded = plistlib.dumps(updated, fmt=plistlib.FMT_BINARY, sort_keys=False)
    assert plistlib.loads(encoded) == updated

    return encoded, {
        "original_action_count": len(actions),
        "candidate_action_count": len(new_actions),
        "inserted_after_action": 421,
        "original_actions_preserved": len(actions),
        "new_actions": [DICTIONARY, SCRIPTABLE],
        "bridge_script": BRIDGE_NAME,
        "route_mode": "raw-only",
        "original_sha256": hashlib.sha256(decoded_plist).hexdigest(),
        "candidate_sha256": hashlib.sha256(encoded).hexdigest(),
        "private_shortcut_uploaded": False,
        "signed": False,
        "installed": False,
        "iphone_tested": False,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, required=True,
                    help="Private, locally decoded .wflow binary plist")
    ap.add_argument("--output", type=Path, required=True,
                    help="Local unsigned candidate; NEVER upload this file")
    ap.add_argument("--report", type=Path)
    args = ap.parse_args()
    result, report = patch(args.input.read_bytes())
    args.output.write_bytes(result)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2),
                               encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
