#!/usr/bin/env python3
from __future__ import annotations
import argparse
import plistlib
from pathlib import Path

INTENTS = {
    "com.tplink.tapo.TapoDeviceToggleIntent",
    "com.tplink.tapo.TapoBulbColorSetIntent",
}
PARAMETER_KEY = "devices"
PLACEHOLDER = "__SELECT_FLOOR_LAMP__"
QUESTION = "操作するTapoのフロアランプを選んでください"

def patch(path: Path) -> None:
    root = plistlib.loads(path.read_bytes())
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    targets = []
    for index, action in enumerate(actions):
        if action.get("WFWorkflowActionIdentifier") not in INTENTS:
            continue
        params = action.get("WFWorkflowActionParameters")
        if not isinstance(params, dict):
            raise SystemExit(f"Tapo action {index} parameters missing")
        device = params.get(PARAMETER_KEY)
        if not isinstance(device, dict) or device.get("identifier") != PLACEHOLDER:
            raise SystemExit(f"Tapo action {index} device placeholder missing")
        targets.append(index)

    if len(targets) != 4:
        raise SystemExit(f"expected four Tapo device actions, found {len(targets)}")

    questions = root.get("WFWorkflowImportQuestions")
    if not isinstance(questions, list):
        questions = []
    questions = [
        q for q in questions
        if not (
            isinstance(q, dict)
            and q.get("Category") == "Parameter"
            and q.get("ParameterKey") == PARAMETER_KEY
        )
    ]
    for index in targets:
        questions.append({
            "ActionIndex": index,
            "Category": "Parameter",
            "ParameterKey": PARAMETER_KEY,
            "Text": QUESTION,
        })
    root["WFWorkflowImportQuestions"] = questions
    path.write_bytes(plistlib.dumps(root, fmt=plistlib.FMT_BINARY, sort_keys=False))

    verify = plistlib.loads(path.read_bytes())
    qs = [
        q for q in verify.get("WFWorkflowImportQuestions", [])
        if isinstance(q, dict)
        and q.get("ParameterKey") == PARAMETER_KEY
        and q.get("Category") == "Parameter"
    ]
    if len(qs) != 4:
        raise SystemExit("Tapo import questions missing")
    print("YOS_Floor_Lamp device picker: PASS (4 actions)")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    patch(parser.parse_args().shortcut)
