#!/usr/bin/env python3
from __future__ import annotations
import argparse
import plistlib
from pathlib import Path


def load(path: Path) -> dict:
    with path.open("rb") as fh:
        root = plistlib.load(fh)
    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise AssertionError("WFWorkflowActions missing")
    return root


def validate(path: Path) -> None:
    root = load(path)
    actions = root["WFWorkflowActions"]
    ids = [str(a.get("WFWorkflowActionIdentifier", "")) for a in actions]
    blob = repr(root)

    required_tokens = (
        "YOS_CLIPBOARD_OK:add",
        "YOS_CLIPBOARD_OK:next:",
        "YOS_CLIPBOARD_OK:merge:",
        "YOS_CLIPBOARD_OK:select:",
        "YOS_CLIPBOARD_OK:duplicate",
        "YOS_CLIPBOARD_OK:clear",
        "YOS_CLIPBOARD_OK:screenshots:merge:",
        "YOS_CLIPBOARD_BLOCKED:",
        "YOS Clipboard Temp",
        "WFImageCombineMode",
        "Vertically",
        "WFGetLatestPhotoCount",
        "Date Taken",
    )
    for token in required_tokens:
        if token not in blob:
            raise AssertionError(f"missing runtime contract marker: {token}")

    if not any(i.endswith("getclipboard") for i in ids):
        raise AssertionError("Get Clipboard action missing")
    if sum(i.endswith("setclipboard") for i in ids) < 4:
        raise AssertionError("expected multiple Set Clipboard actions")
    if not any(i.endswith("getlastscreenshot") for i in ids):
        raise AssertionError("Get Latest Screenshots action missing")

    forbidden_suffixes = (
        "runworkflow", "openapp", "downloadurl", "addnewevent",
        "addnewreminder", "sendmessage", "sendemail",
    )
    for ident in ids:
        if ident.endswith(forbidden_suffixes):
            raise AssertionError(f"forbidden child action: {ident}")

    for forbidden in (
        "hubsign.routinehub.services", "api.openai.com", "shortcutFactoryUnsignedXml",
        "YOS Safari Auto.shortcut",
    ):
        if forbidden in blob:
            raise AssertionError(f"network/factory content leaked into child: {forbidden}")

    print(f"YOS_Clipboard runtime: PASS ({len(actions)} actions)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("shortcut", type=Path)
    args = ap.parse_args()
    validate(args.shortcut)
