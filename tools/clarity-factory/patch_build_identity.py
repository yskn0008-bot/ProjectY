#!/usr/bin/env python3
from __future__ import annotations

import argparse
import plistlib
import re
from pathlib import Path

BUILD_ACTION_NAME = "buildId"
PLACEHOLDER = "__CLARITY_BUILD_ID__"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def patch(path: Path, build_id: str) -> None:
    build_id = build_id.strip().lower()
    if not SHA_RE.fullmatch(build_id):
        raise SystemExit(f"BUILD_ID must be a 40-char lowercase Git SHA, got {build_id!r}")

    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    matches = []
    for index, action in enumerate(actions):
        params = action.get("WFWorkflowActionParameters", {})
        if not isinstance(params, dict):
            continue
        if params.get("CustomOutputName") != BUILD_ACTION_NAME:
            continue
        if action.get("WFWorkflowActionIdentifier") != "is.workflow.actions.gettext":
            raise SystemExit("buildId exists but is not a Text action")
        matches.append((index, params))

    if len(matches) != 1:
        raise SystemExit(f"expected exactly one buildId text action, found {len(matches)}")

    index, params = matches[0]
    value = params.get("WFTextActionText")
    if value == build_id:
        pass
    elif value == PLACEHOLDER:
        params["WFTextActionText"] = build_id
    elif isinstance(value, dict):
        # Cherri may encode text as a token-string envelope. Keep the envelope but
        # replace only the literal payload; buildId itself has no attachments.
        body = value.get("Value")
        if (
            value.get("WFSerializationType") != "WFTextTokenString"
            or not isinstance(body, dict)
            or body.get("string") not in (PLACEHOLDER, build_id)
            or body.get("attachmentsByRange") not in ({}, None)
        ):
            raise SystemExit("unexpected buildId token-string shape")
        body["string"] = build_id
        body["attachmentsByRange"] = {}
    else:
        raise SystemExit(f"unexpected buildId text payload: {value!r}")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    with path.open("rb") as fh:
        verify = plistlib.load(fh)

    actions = verify["WFWorkflowActions"]
    params = actions[index]["WFWorkflowActionParameters"]
    value = params["WFTextActionText"]
    if isinstance(value, str):
        actual = value
    else:
        actual = value["Value"]["string"]
    if actual != build_id:
        raise SystemExit(f"BUILD_ID patch verification failed: {actual!r}")
    if PLACEHOLDER in repr(verify):
        raise SystemExit("BUILD_ID placeholder survived final plist")

    print(f"Clarity BUILD_ID patch: PASS build_id={build_id}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    parser.add_argument("build_id")
    args = parser.parse_args()
    patch(args.shortcut, args.build_id)
