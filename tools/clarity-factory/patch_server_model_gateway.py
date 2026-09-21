#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
import uuid
from pathlib import Path

ENDPOINT = "https://project-y-yos-ai.vercel.app/api/yos/intake?mode=model"
FACTORY_ENDPOINT = "https://project-y-yos-ai.vercel.app/api/yos/intake?mode=factory"
TOKEN_PROMPT = "Clarity接続トークン"


def action_output(output_uuid: str, output_name: str) -> dict:
    return {"Type": "ActionOutput", "OutputUUID": output_uuid, "OutputName": output_name}


def attachment(output_uuid: str, output_name: str) -> dict:
    return {
        "Value": action_output(output_uuid, output_name),
        "WFSerializationType": "WFTextTokenAttachment",
    }


def token_string(prefix: str, output_uuid: str, output_name: str) -> dict:
    return {
        "Value": {
            "string": prefix + "\ufffc",
            "attachmentsByRange": {
                f"{{{len(prefix)}, 1}}": action_output(output_uuid, output_name)
            },
        },
        "WFSerializationType": "WFTextTokenString",
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

    matches = [i for i, a in enumerate(actions) if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.askllm"]
    if len(matches) != 1:
        raise SystemExit(f"expected exactly one askllm action, found {len(matches)}")
    index = matches[0]
    old = actions[index]
    old_params = old.get("WFWorkflowActionParameters", {})
    model_uuid = old_params.get("UUID")
    output_name = old_params.get("CustomOutputName", "modelResult")
    prompt_param = old_params.get("WFLLMPrompt")
    if not isinstance(model_uuid, str) or not isinstance(prompt_param, dict):
        raise SystemExit("askllm action missing UUID/prompt")
    prompt_value = prompt_param.get("Value", {})
    prompt_attachments = prompt_value.get("attachmentsByRange", {}) if isinstance(prompt_value, dict) else {}
    prompt_ref = prompt_attachments.get("{0, 1}") if isinstance(prompt_attachments, dict) else None
    if not isinstance(prompt_ref, dict) or prompt_ref.get("Type") != "ActionOutput":
        raise SystemExit("could not resolve modelPrompt action output")
    prompt_uuid = prompt_ref.get("OutputUUID")
    prompt_name = prompt_ref.get("OutputName", "modelPrompt")
    if not isinstance(prompt_uuid, str):
        raise SystemExit("modelPrompt UUID missing")

    token_uuid = str(uuid.uuid4())
    token_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": token_uuid,
            "CustomOutputName": "clarityToken",
            "WFTextActionText": "",
        },
    }

    http_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": model_uuid,
            "CustomOutputName": output_name,
            "WFURL": ENDPOINT,
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFHTTPHeaders": dictionary([
                ("Authorization", token_string("Bearer ", token_uuid, "clarityToken")),
                ("Content-Type", plain_token_string("application/json")),
            ]),
            "WFJSONValues": dictionary([
                ("prompt", attachment(prompt_uuid, prompt_name)),
            ]),
        },
    }

    actions[index:index + 1] = [token_action, http_action]

    factory_matches = [
        (i, action)
        for i, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == "is.workflow.actions.gettext"
        and action.get("WFWorkflowActionParameters", {}).get("CustomOutputName") == "shortcutFactoryRequest"
    ]
    if len(factory_matches) != 1:
        raise SystemExit(f"expected exactly one shortcutFactoryRequest action, found {len(factory_matches)}")
    factory_index, factory_request_action = factory_matches[0]
    factory_request_params = factory_request_action.get("WFWorkflowActionParameters", {})
    factory_request_uuid = factory_request_params.get("UUID")
    factory_request_name = factory_request_params.get("CustomOutputName", "shortcutFactoryRequest")
    if not isinstance(factory_request_uuid, str):
        raise SystemExit("shortcutFactoryRequest UUID missing")

    factory_uuid = str(uuid.uuid4())
    factory_http_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": factory_uuid,
            "CustomOutputName": "generatedShortcut",
            "WFURL": FACTORY_ENDPOINT,
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFHTTPHeaders": dictionary([
                ("Authorization", token_string("Bearer ", token_uuid, "clarityToken")),
                ("Content-Type", plain_token_string("application/json")),
            ]),
            "WFJSONValues": dictionary([
                ("request", attachment(factory_request_uuid, factory_request_name)),
            ]),
        },
    }
    open_generated_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.openin",
        "WFWorkflowActionParameters": {
            "UUID": str(uuid.uuid4()),
            "WFInput": attachment(factory_uuid, "generatedShortcut"),
            "WFOpenInAskWhenRun": False,
            "WFSelectedApp": {
                "BundleIdentifier": "com.apple.shortcuts",
                "Name": "Shortcuts",
            },
        },
    }
    actions[factory_index + 1:factory_index + 1] = [factory_http_action, open_generated_action]

    questions = root.setdefault("WFWorkflowImportQuestions", [])
    if not isinstance(questions, list):
        raise SystemExit("WFWorkflowImportQuestions is not an array")
    questions.append({
        "ActionIndex": index,
        "Category": "Parameter",
        "ParameterKey": "WFTextActionText",
        "Text": TOKEN_PROMPT,
        "DefaultValue": "",
    })
    root["WFWorkflowActions"] = actions

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    blob = repr(verify)
    if "is.workflow.actions.askllm" in blob:
        raise SystemExit("Apple model action survived server gateway patch")
    if blob.count("is.workflow.actions.downloadurl") != 2:
        raise SystemExit("expected model + Shortcut Factory network actions")
    if ENDPOINT not in blob or FACTORY_ENDPOINT not in blob or TOKEN_PROMPT not in blob:
        raise SystemExit("gateway/factory endpoint or setup question missing")
    if blob.count("is.workflow.actions.openin") != 1 or "com.apple.shortcuts" not in blob:
        raise SystemExit("Shortcut Factory terminal open-in handoff missing")
    if "api.openai.com" in blob or "OPENAI_API_KEY" in blob or "sk-" in blob:
        raise SystemExit("OpenAI secret/direct endpoint must not exist in Shortcut")
    print("Clarity secure server model gateway patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
