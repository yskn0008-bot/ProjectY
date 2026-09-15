#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path


def params(action: dict) -> dict:
    value = action.get("WFWorkflowActionParameters", {})
    return value if isinstance(value, dict) else {}


def validate(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing")

    identifiers = [str(a.get("WFWorkflowActionIdentifier", "")) for a in actions]

    # Final artifact must use the secure server gateway, not Apple Use Model / ChatGPT.
    if any(i == "is.workflow.actions.askllm" for i in identifiers):
        raise AssertionError("Apple/ChatGPT model action survived final patch")
    downloads = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.downloadurl"]
    if len(downloads) != 1:
        raise AssertionError(f"expected one model gateway request, found {len(downloads)}")
    d = params(downloads[0])
    if d.get("WFURL") != "https://project-y-yos-ai.vercel.app/api/yos/intake?mode=model":
        raise AssertionError("unexpected Clarity gateway URL")
    if d.get("WFHTTPMethod") != "POST" or d.get("WFHTTPBodyType") != "JSON":
        raise AssertionError("Clarity gateway request must be POST JSON")
    if "Authorization" not in repr(d.get("WFHTTPHeaders")) or "Bearer" not in repr(d.get("WFHTTPHeaders")):
        raise AssertionError("Clarity gateway bearer header missing")

    questions = root.get("WFWorkflowImportQuestions")
    if not isinstance(questions, list) or not any(q.get("Text") == "Clarity接続トークン" for q in questions if isinstance(q, dict)):
        raise AssertionError("Clarity connection token import question missing")

    # Parser must consume modelResult and extract actions.
    if sum(i == "is.workflow.actions.detect.dictionary" for i in identifiers) < 2:
        raise AssertionError("dictionary parser chain missing")
    if not any(params(a).get("WFDictionaryKey") == "actions" for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.getvalueforkey"):
        raise AssertionError("actions[] extraction missing")

    # Calendar must have title/start/end/notes.
    calendar = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewevent"]
    if len(calendar) != 1:
        raise AssertionError(f"expected one calendar writer, found {len(calendar)}")
    cp = params(calendar[0])
    for key in ("WFCalendarItemTitle", "WFCalendarItemStartDate", "WFCalendarItemEndDate", "WFCalendarItemNotes"):
        if key not in cp:
            raise AssertionError(f"calendar writer missing {key}")

    # Reminder wire format on current iOS must use WFAlertEnabled string values.
    reminders = [a for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.addnewreminder"]
    if len(reminders) != 2:
        raise AssertionError(f"expected timed reminder + task/shopping writer, found {len(reminders)}")
    timed = [params(a) for a in reminders if "WFAlertCustomTime" in params(a)]
    untimed = [params(a) for a in reminders if "WFAlertCustomTime" not in params(a)]
    if len(timed) != 1 or len(untimed) != 1:
        raise AssertionError("could not distinguish timed and untimed reminder writers")
    if timed[0].get("WFAlertEnabled") != "Alert":
        raise AssertionError("timed reminder must use WFAlertEnabled=Alert")
    if timed[0].get("WFAlertTrigger") != "At Time":
        raise AssertionError("timed reminder must use At Time trigger")
    if untimed[0].get("WFAlertEnabled") != "No Alert":
        raise AssertionError("task/shopping reminder must use WFAlertEnabled=No Alert")
    for rp in timed + untimed:
        if "WFCalendarItemAlert" in rp:
            raise AssertionError("legacy boolean WFCalendarItemAlert survived final artifact")
        if "WFCalendarItemTitle" not in rp or "WFCalendarItemNotes" not in rp:
            raise AssertionError("reminder writer missing title/notes")

    # iPhone-safe persistence path must be present for raw, ledger and idea.
    saves = [params(a) for a in actions if a.get("WFWorkflowActionIdentifier") == "is.workflow.actions.documentpicker.save"]
    destinations = [s.get("WFFileDestinationPath") for s in saves]
    for required in ("Clarity Inbox.txt", "Clarity Ledger.txt", "Idea in Box.txt"):
        if required not in destinations:
            raise AssertionError(f"final persistence writer missing {required}")
    if any(s.get("WFAskWhereToSave") is not False or s.get("WFSaveFileOverwrite") is not True for s in saves):
        raise AssertionError("final persistence writer is not deterministic overwrite-after-merge")

    serialized = repr(root)
    for marker in ("RAW", "EXECUTING", "APPLIED", "BLOCKED", "REQUEST_DONE", "YOS-CLARITY-ID:"):
        if marker not in serialized:
            raise AssertionError(f"missing final runtime marker: {marker}")

    print("Clarity final artifact contract: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    validate(args.shortcut)
