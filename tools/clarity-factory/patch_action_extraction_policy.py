#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

MARKER = "Return keys request_id, original_input, context, interpretation, actions, watches, feedback."

EXTRA = (
    "Treat ordinary spoken declarative phrases as capture/execute intent when they clearly map to a supported destination; "
    "the user does not need to say add, register, save, or remind me. "
    "If the utterance contains one or more clear actionable or capturable clauses, actions MUST contain one planned action for each such clause. "
    "Do not return an empty actions list for clear calendar, reminder, shopping, task, idea, memo, open_app, device_setting, or myway intent. "
    "For a direct supported execution request, actions MUST contain the corresponding planned executor action. "
    "Examples: MY WAYを開いて -> executor myway, target home; ChatGPTを開いて -> executor open_app, target chatgpt; "
    "Wi-Fiを切って -> executor device_setting, target wifi, content off. "
    "Only return no actions when the utterance truly contains no actionable or capturable intent. "
    "Split compact Japanese speech into separate actions even when punctuation is missing. "
    "Example: 明日3時に歯医者。30分前に教えて。帰りにトマト買う。あと棚のアイデア思いついた。 "
    "must produce four actions: calendar content 歯医者 at tomorrow 15:00 with a 60-minute default end, "
    "reminder linked to that event at 30 minutes before, shopping content トマト, and idea content 棚のアイデア. "
    "A transcript such as 明日3時に歯医者30分前に教えて帰りにトマト買うあと棚のアイデア思いついた expresses the same four intents. "
)


def prompt_string(params: dict) -> tuple[dict, str] | None:
    text = params.get("WFTextActionText")
    if not isinstance(text, dict):
        return None
    value = text.get("Value")
    if not isinstance(value, dict):
        return None
    string = value.get("string")
    if not isinstance(string, str):
        return None
    return value, string


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    hits = 0
    for action in actions:
        params = action.get("WFWorkflowActionParameters", {})
        if not isinstance(params, dict):
            continue
        found = prompt_string(params)
        if not found:
            continue
        value, string = found
        if "You are Clarity, the single natural-language gateway" not in string:
            continue
        if MARKER not in string:
            raise SystemExit("Clarity model prompt found but return-contract marker missing")
        if EXTRA in string:
            raise SystemExit("action extraction policy already present")
        value["string"] = string.replace(MARKER, EXTRA + MARKER)
        hits += 1

    if hits != 1:
        raise SystemExit(f"expected exactly one Clarity model prompt, found {hits}")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)
    blob = repr(verify)
    required = [
        "actions MUST contain one planned action",
        "MY WAYを開いて",
        "ChatGPTを開いて",
        "Wi-Fiを切って",
        "明日3時に歯医者",
        "shopping content トマト",
        "same four intents",
    ]
    for needle in required:
        if needle not in blob:
            raise SystemExit(f"missing action-extraction policy marker: {needle}")
    print("Clarity action-extraction policy patch: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
