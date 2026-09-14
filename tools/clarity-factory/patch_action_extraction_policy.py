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
    "Do not return an empty actions list for clear calendar, reminder, shopping, task, idea, or memo content. "
    "Only return no actions when the utterance truly contains no actionable or capturable intent. "
    "Split compact Japanese speech into separate actions even when punctuation is missing. "
    "Example: 明日3時に歯医者。30分前に教えて。帰りにトマト買う。あと棚のアイデア思いついた。 "
    "must produce four actions: calendar content 歯医者 at tomorrow 15:00 with a 60-minute default end, "
    "reminder linked to that event at 30 minutes before, shopping content トマト, and idea content 棚のアイデア. "
    "A transcript such as 明日3時に歯医者30分前に教えて帰りにトマト買うあと棚のアイデア思いついた expresses the same four intents. "
)


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    hits = 0
    for action in actions:
        params = action.get("WFWorkflowActionParameters")
        if not isinstance(params, dict):
            continue
        for key, value in list(params.items()):
            if not isinstance(value, str):
                continue
            if "You are Clarity, the single natural-language gateway" not in value:
                continue
            if MARKER not in value:
                raise SystemExit("Clarity model prompt found but return-contract marker missing")
            if EXTRA in value:
                raise SystemExit("action extraction policy already present")
            params[key] = value.replace(MARKER, EXTRA + MARKER)
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
