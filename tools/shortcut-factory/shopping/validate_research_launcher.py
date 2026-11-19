#!/usr/bin/env python3
"""Guard the Notion YOS Shopping + Pricey launcher's native action targets."""
import argparse
import os
import plistlib
from pathlib import Path

NOTION_DATABASE_ID = "33e8d09b97d54f399e00fbcdc8a30475"

def check(file: Path, bundle_id: str) -> None:
    plist = plistlib.loads(file.read_bytes())
    actions = plist.get("WFWorkflowActions")
    assert isinstance(actions, list) and len(actions) >= 6, "shortcut menu actions missing"
    ids = [str(x.get("WFWorkflowActionIdentifier", "")).lower() for x in actions]
    text = str(actions)
    assert ids.count("is.workflow.actions.openapp") == 1, ids
    assert ids.count("is.workflow.actions.openurl") == 1, ids
    assert bundle_id and bundle_id in text, "Pricey bundle ID is missing from Open App"
    assert NOTION_DATABASE_ID in text, "Original Notion YOS Shopping database link missing"
    assert "買い物リスト" in text and "商品リサーチ" in text, "shopping/research options missing"
    assert any("clipboard" in identifier for identifier in ids), "product keyword not copied for Pricey"
    assert any("choosefromlist" in identifier for identifier in ids), "menu selection missing"
    assert all("quicklook" not in identifier for identifier in ids), "unexpected shortcut preview"
    for forbidden in (
        "ai.perplexity.app", "com.apple.reminders", "scriptable:///run",
        "YOS_NOTION_INTEGRATION_TOKEN", "api.notion.com", "vercel.app"
    ):
        assert forbidden not in text, "unexpected provider or credential: " + forbidden
    assert not plist.get("WFWorkflowImportQuestions"), "no install questions allowed"
    print("Notion shopping database and Pricey research app: PASS; actions",len(actions))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("file",type=Path)
    parser.add_argument("--pricey-bundle-id",default=os.environ.get("PRICEY_BUNDLE_ID",""))
    args = parser.parse_args()
    check(args.file,args.pricey_bundle_id)
