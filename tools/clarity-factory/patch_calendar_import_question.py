#!/usr/bin/env python3
"""Attach the one-time Calendar picker to the final Clarity event writer."""

from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

CALENDAR_WRITER = "is.workflow.actions.addnewevent"
PARAMETER_KEY = "WFCalendarItemCalendar"
QUESTION_TEXT = "予定を保存するカレンダーを選んでください（通常使うカレンダー）"


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    matches = [
        (index, action)
        for index, action in enumerate(actions)
        if action.get("WFWorkflowActionIdentifier") == CALENDAR_WRITER
    ]
    if len(matches) != 1:
        raise SystemExit(f"expected one Calendar writer, found {len(matches)}")

    action_index, writer = matches[0]
    params = writer.get("WFWorkflowActionParameters")
    if not isinstance(params, dict):
        raise SystemExit("Calendar writer parameters missing")

    # Import Questions replace this exact parameter with a real calendar chosen
    # from the user's own EventKit store. A placeholder is required so the picker
    # has an editable parameter to bind to at import time.
    params[PARAMETER_KEY] = params.get(PARAMETER_KEY) or "Calendar"

    questions = root.get("WFWorkflowImportQuestions")
    if not isinstance(questions, list):
        questions = []

    questions = [
        q
        for q in questions
        if not (
            isinstance(q, dict)
            and q.get("ParameterKey") == PARAMETER_KEY
            and q.get("Category") == "Parameter"
        )
    ]
    questions.append(
        {
            "ActionIndex": action_index,
            "Category": "Parameter",
            "ParameterKey": PARAMETER_KEY,
            "Text": QUESTION_TEXT,
        }
    )
    root["WFWorkflowImportQuestions"] = questions

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    actions = verify["WFWorkflowActions"]
    matching = [
        q
        for q in verify.get("WFWorkflowImportQuestions", [])
        if isinstance(q, dict) and q.get("ParameterKey") == PARAMETER_KEY
    ]
    if len(matching) != 1:
        raise SystemExit("Calendar import question missing or duplicated")
    question = matching[0]
    index = question.get("ActionIndex")
    if not isinstance(index, int) or not (0 <= index < len(actions)):
        raise SystemExit("Calendar import question has invalid ActionIndex")
    if actions[index].get("WFWorkflowActionIdentifier") != CALENDAR_WRITER:
        raise SystemExit("Calendar import question no longer points to Add New Event")
    if not actions[index].get("WFWorkflowActionParameters", {}).get(PARAMETER_KEY):
        raise SystemExit("Calendar destination parameter is empty")

    print(
        "Clarity Calendar destination picker: PASS "
        f"(action_index={index}, question={QUESTION_TEXT})"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
