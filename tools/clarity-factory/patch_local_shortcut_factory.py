#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
import uuid
from pathlib import Path

HUBSIGN_ENDPOINT = "https://hubsign.routinehub.services/sign"


def action_output(output_uuid: str, output_name: str) -> dict:
    return {"Type": "ActionOutput", "OutputUUID": output_uuid, "OutputName": output_name}


def attachment(output_uuid: str, output_name: str) -> dict:
    return {
        "Value": action_output(output_uuid, output_name),
        "WFSerializationType": "WFTextTokenAttachment",
    }


def plain_token_string(value: str) -> dict:
    return {
        "Value": {"string": value},
        "WFSerializationType": "WFTextTokenString",
    }


def dictionary(items: list[tuple[str, object]]) -> dict:
    return {
        "Value": {
            "WFDictionaryFieldValueItems": [
                {
                    "WFItemType": 0,
                    "WFKey": plain_token_string(key),
                    "WFValue": value,
                }
                for key, value in items
            ]
        },
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    # Keep the local ChatGPT action. Only patch the terminal Shortcut Factory lane.
    llm = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.askllm"]
    if len(llm) != 1:
        raise SystemExit(f"expected exactly one local ChatGPT action, found {len(llm)}")

    factory_matches = [
        (i, action)
        for i, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.gettext"
        and action.get("WFWorkflowActionParameters", {}).get("CustomOutputName") == "shortcutFactoryRequest"
    ]
    if len(factory_matches) != 1:
        raise SystemExit(f"expected exactly one shortcutFactoryRequest action, found {len(factory_matches)}")
    factory_index, _ = factory_matches[0]

    child_action_uuid = str(uuid.uuid4()).upper()
    unsigned_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>WFWorkflowName</key><string>YOS Safari Auto</string>
<key>WFWorkflowActions</key><array><dict>
<key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.openapp</string>
<key>WFWorkflowActionParameters</key><dict>
<key>UUID</key><string>{child_action_uuid}</string>
<key>WFAppIdentifier</key><string>com.apple.mobilesafari</string>
<key>WFSelectedApp</key><dict>
<key>BundleIdentifier</key><string>com.apple.mobilesafari</string>
<key>Name</key><string>Safari</string>
</dict></dict></dict></array>
<key>WFWorkflowClientVersion</key><string>2607.1.3</string>
<key>WFWorkflowClientRelease</key><string>26.0</string>
<key>WFWorkflowMinimumClientVersion</key><integer>900</integer>
<key>WFWorkflowMinimumClientVersionString</key><string>900</string>
<key>WFWorkflowIcon</key><dict>
<key>WFWorkflowIconStartColor</key><integer>463140863</integer>
<key>WFWorkflowIconGlyphNumber</key><integer>59511</integer>
</dict>
<key>WFWorkflowImportQuestions</key><array/>
<key>WFWorkflowInputContentItemClasses</key><array><string>WFAppContentItem</string><string>WFStringContentItem</string></array>
<key>WFWorkflowOutputContentItemClasses</key><array/>
<key>WFWorkflowTypes</key><array/>
<key>WFQuickActionSurfaces</key><array/>
<key>WFWorkflowHasOutputFallback</key><false/>
<key>WFWorkflowHasShortcutInputVariables</key><false/>
</dict></plist>"""

    xml_uuid = str(uuid.uuid4())
    xml_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": xml_uuid,
            "CustomOutputName": "shortcutFactoryUnsignedXml",
            "WFTextActionText": unsigned_xml,
        },
    }

    factory_uuid = str(uuid.uuid4())
    hubsign_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": factory_uuid,
            "CustomOutputName": "generatedShortcut",
            "WFURL": HUBSIGN_ENDPOINT,
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFHTTPHeaders": dictionary([
                ("Content-Type", plain_token_string("application/json")),
                ("User-Agent", plain_token_string("cherri/1.0")),
                ("Origin", plain_token_string("https://routinehub.co")),
                ("Referer", plain_token_string("https://routinehub.co/")),
            ]),
            "WFJSONValues": dictionary([
                ("shortcutName", plain_token_string("YOS Safari Auto")),
                ("shortcut", attachment(xml_uuid, "shortcutFactoryUnsignedXml")),
            ]),
        },
    }

    named_uuid = str(uuid.uuid4())
    name_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.setitemname",
        "WFWorkflowActionParameters": {
            "UUID": named_uuid,
            "CustomOutputName": "namedGeneratedShortcut",
            "WFInput": attachment(factory_uuid, "generatedShortcut"),
            "WFName": "YOS Safari Auto.shortcut",
        },
    }

    open_generated_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.openin",
        "WFWorkflowActionParameters": {
            "UUID": str(uuid.uuid4()),
            "WFInput": attachment(named_uuid, "namedGeneratedShortcut"),
            "WFOpenInAskWhenRun": False,
            "WFSelectedApp": {
                "BundleIdentifier": "com.apple.shortcuts",
                "Name": "Shortcuts",
            },
        },
    }

    actions[factory_index + 1:factory_index + 1] = [
        xml_action,
        hubsign_action,
        name_action,
        open_generated_action,
    ]
    root["WFWorkflowActions"] = actions

    # Local build must never ask the user for a Clarity token or API key.
    questions = root.get("WFWorkflowImportQuestions", [])
    if not isinstance(questions, list):
        raise SystemExit("WFWorkflowImportQuestions is not an array")
    forbidden = {"Clarity接続トークン", "OpenAI APIキー"}
    if any(isinstance(q, dict) and q.get("Text") in forbidden for q in questions):
        raise SystemExit("token/API-key import question survived local build")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    blob = repr(verify)
    if blob.count("is.workflow.actions.askllm") != 1:
        raise SystemExit("local ChatGPT action was replaced or duplicated")
    if blob.count("is.workflow.actions.downloadurl") != 1:
        raise SystemExit("expected exactly one HubSign network action")
    if HUBSIGN_ENDPOINT not in blob:
        raise SystemExit("HubSign endpoint missing")
    if "project-y-yos-ai.vercel.app/api/yos/intake?mode=model" in blob:
        raise SystemExit("server model gateway leaked into local build")
    if "Clarity接続トークン" in blob or "OpenAI APIキー" in blob or "sk-" in blob:
        raise SystemExit("token/API-key prompt or secret leaked into local build")
    if "com.apple.mobilesafari" not in blob or "YOS Safari Auto.shortcut" not in blob:
        raise SystemExit("local Safari Shortcut template/handoff missing")
    print("Clarity local Shortcut Factory patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
