#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path


def params(action: dict) -> dict:
    p = action.get("WFWorkflowActionParameters", {})
    return p if isinstance(p, dict) else {}


def custom_name(action: dict) -> str:
    v = params(action).get("CustomOutputName", "")
    return v if isinstance(v, str) else ""


def validate(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing")

    ids = [str(a.get("WFWorkflowActionIdentifier", "")) for a in actions]
    llm = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.askllm"]
    if len(llm) != 1:
        raise AssertionError(f"expected one local ChatGPT action, found {len(llm)}")
    lp = params(llm[0])
    if lp.get("WFLLMModel") != "ChatGPT" or lp.get("WFGenerativeResultType") != "Text":
        raise AssertionError("local ChatGPT action is not configured for JSON text")

    nets = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.downloadurl"]
    if len(nets) != 1:
        raise AssertionError(f"expected one HubSign request, found {len(nets)}")
    np = params(nets[0])
    if np.get("WFURL") != "https://hubsign.routinehub.services/sign":
        raise AssertionError("unexpected network endpoint in local build")
    if np.get("WFHTTPMethod") != "POST" or np.get("WFHTTPBodyType") != "JSON":
        raise AssertionError("HubSign request must be POST JSON")
    headers = repr(np.get("WFHTTPHeaders"))
    for required in ("Content-Type", "User-Agent", "Origin", "Referer"):
        if required not in headers:
            raise AssertionError(f"HubSign header missing {required}")

    xml = [a for a in actions if custom_name(a) == "shortcutFactoryUnsignedXml"]
    if len(xml) != 1:
        raise AssertionError("local Shortcut XML action missing")
    xml_text = str(params(xml[0]).get("WFTextActionText", ""))
    if "is.workflow.actions.openapp" not in xml_text or "com.apple.mobilesafari" not in xml_text:
        raise AssertionError("Safari child Shortcut XML invalid")

    names = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.setitemname"]
    if len(names) != 1 or params(names[0]).get("WFName") != "YOS Safari Auto.shortcut":
        raise AssertionError("generated Shortcut filename invalid")

    opens = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.openin"]
    if len(opens) != 1:
        raise AssertionError("generated Shortcut handoff missing")
    op = params(opens[0])
    selected = op.get("WFSelectedApp")
    if not isinstance(selected, dict) or selected.get("BundleIdentifier") != "com.apple.shortcuts":
        raise AssertionError("generated Shortcut must open in Shortcuts")
    if "namedGeneratedShortcut" not in repr(op.get("WFInput")):
        raise AssertionError("Shortcuts handoff is not wired to named signed file")

    blob = repr(root)
    for forbidden in (
        "Clarity接続トークン",
        "OpenAI APIキー",
        "project-y-yos-ai.vercel.app/api/yos/intake?mode=model",
        "api.openai.com",
        "sk-",
    ):
        if forbidden in blob:
            raise AssertionError(f"forbidden token/server marker in local build: {forbidden}")

    questions = root.get("WFWorkflowImportQuestions", [])
    if not isinstance(questions, list):
        raise AssertionError("WFWorkflowImportQuestions invalid")
    if questions:
        texts = [q.get("Text") for q in questions if isinstance(q, dict)]
        if "Clarity接続トークン" in texts or "OpenAI APIキー" in texts:
            raise AssertionError("local build still asks for token/API key")

    if "shortcut_factory" not in blob or "HANDOFF_READY" not in blob:
        raise AssertionError("Shortcut Factory runtime markers missing")

    print("Clarity local factory contract: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
