#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
import uuid
from pathlib import Path

OPENAI_URL = "https://api.openai.com/v1/responses"
API_KEY_PROMPT = "OpenAI APIキー"
MODEL = "gpt-5.6-terra"
OUTPUT_PATH = "output.1.content.1.text"


def output_ref(output_uuid: str, output_name: str) -> dict:
    return {"Type": "ActionOutput", "OutputUUID": output_uuid, "OutputName": output_name}


def attachment(output_uuid: str, output_name: str) -> dict:
    return {"Value": output_ref(output_uuid, output_name), "WFSerializationType": "WFTextTokenAttachment"}


def text_token(value: str) -> dict:
    return {"Value": {"string": value}, "WFSerializationType": "WFTextTokenString"}


def mixed_text(prefix: str, output_uuid: str, output_name: str) -> dict:
    return {
        "Value": {
            "string": prefix + "\ufffc",
            "attachmentsByRange": {
                f"{{{len(prefix)}, 1}}": output_ref(output_uuid, output_name)
            },
        },
        "WFSerializationType": "WFTextTokenString",
    }


def boolean_value(value: bool) -> dict:
    return {"Value": value, "WFSerializationType": "WFNumberSubstitutableState"}


def dictionary_value(items: list[dict]) -> dict:
    return {
        "Value": {"WFDictionaryFieldValueItems": items},
        "WFSerializationType": "WFDictionaryFieldValue",
    }


def string_item(key: str, value: str | dict) -> dict:
    if isinstance(value, str):
        value = text_token(value)
    return {"WFItemType": 0, "WFKey": text_token(key), "WFValue": value}


def bool_item(key: str, value: bool) -> dict:
    return {"WFItemType": 4, "WFKey": text_token(key), "WFValue": boolean_value(value)}


def dict_item(key: str, items: list[dict]) -> dict:
    nested = {
        "Value": dictionary_value(items),
        "WFSerializationType": "WFDictionaryFieldValue",
    }
    return {"WFItemType": 1, "WFKey": text_token(key), "WFValue": nested}


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
    params = old.get("WFWorkflowActionParameters", {})
    model_uuid = params.get("UUID")
    output_name = params.get("CustomOutputName", "modelResult")
    prompt = params.get("WFLLMPrompt", {})
    prompt_value = prompt.get("Value", {}) if isinstance(prompt, dict) else {}
    refs = prompt_value.get("attachmentsByRange", {}) if isinstance(prompt_value, dict) else {}
    prompt_ref = refs.get("{0, 1}") if isinstance(refs, dict) else None
    if not isinstance(model_uuid, str) or not isinstance(prompt_ref, dict):
        raise SystemExit("could not resolve askllm UUID or modelPrompt reference")
    prompt_uuid = prompt_ref.get("OutputUUID")
    prompt_name = prompt_ref.get("OutputName", "modelPrompt")
    if not isinstance(prompt_uuid, str):
        raise SystemExit("modelPrompt UUID missing")

    key_uuid = str(uuid.uuid4())
    response_uuid = str(uuid.uuid4())

    key_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {
            "UUID": key_uuid,
            "CustomOutputName": "openAIAPIKey",
            "WFTextActionText": "",
        },
    }

    body_items = [
        string_item("model", MODEL),
        string_item("input", attachment(prompt_uuid, prompt_name)),
        bool_item("store", False),
        dict_item("text", [
            dict_item("format", [string_item("type", "json_object")])
        ]),
    ]
    header_items = [
        string_item("Authorization", mixed_text("Bearer ", key_uuid, "openAIAPIKey")),
        string_item("Content-Type", "application/json"),
    ]
    request_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": response_uuid,
            "CustomOutputName": "openAIResponse",
            "WFURL": OPENAI_URL,
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFHTTPHeaders": dictionary_value(header_items),
            "WFJSONValues": dictionary_value(body_items),
        },
    }

    # Shortcuts dictionary/list paths use 1-based indexes. The Responses API places
    # assistant text at output[0].content[0].text, so the Shortcut key is output.1.content.1.text.
    extract_action = {
        "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
        "WFWorkflowActionParameters": {
            "UUID": model_uuid,
            "CustomOutputName": output_name,
            "WFDictionaryKey": OUTPUT_PATH,
            "WFGetDictionaryValueType": "Value",
            "WFInput": attachment(response_uuid, "openAIResponse"),
        },
    }

    actions[index:index + 1] = [key_action, request_action, extract_action]

    questions = root.setdefault("WFWorkflowImportQuestions", [])
    if not isinstance(questions, list):
        raise SystemExit("WFWorkflowImportQuestions is not an array")
    questions.append({
        "ActionIndex": index,
        "Category": "Parameter",
        "ParameterKey": "WFTextActionText",
        "Text": API_KEY_PROMPT,
        "DefaultValue": "",
    })
    root["WFWorkflowActions"] = actions

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    v_actions = verify.get("WFWorkflowActions", [])
    blob = repr(verify)
    if any(a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.askllm" for a in v_actions):
        raise SystemExit("Apple model action survived direct OpenAI patch")
    if sum(a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.downloadurl" for a in v_actions) != 1:
        raise SystemExit("expected exactly one network request")
    if OPENAI_URL not in blob or API_KEY_PROMPT not in blob or OUTPUT_PATH not in blob:
        raise SystemExit("direct OpenAI contract marker missing")
    if "sk-" in blob:
        raise SystemExit("an actual-looking API key must never be embedded in artifact")
    q = [q for q in verify.get("WFWorkflowImportQuestions", []) if q.get("Text") == API_KEY_PROMPT]
    if len(q) != 1:
        raise SystemExit("expected one OpenAI API key import question")
    qi = q[0].get("ActionIndex")
    if not isinstance(qi, int) or qi >= len(v_actions):
        raise SystemExit("OpenAI API key import question index invalid")
    target = v_actions[qi]
    tp = target.get("WFWorkflowActionParameters", {})
    if target.get("WFWorkflowActionIdentifier") != "is.workflow.actions.gettext" or tp.get("CustomOutputName") != "openAIAPIKey":
        raise SystemExit("OpenAI API key import question is not bound to API key Text action")
    print(f"Clarity direct OpenAI fallback patch: PASS (key ActionIndex={qi})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
