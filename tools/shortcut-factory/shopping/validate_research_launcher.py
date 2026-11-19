#!/usr/bin/env python3
"""Guard the YOS shopping/research launcher against app/DB changes and URL shims."""
import argparse
import plistlib
from pathlib import Path

def check(file: Path) -> None:
    plist = plistlib.loads(file.read_bytes())
    actions = plist.get("WFWorkflowActions")
    assert isinstance(actions, list) and len(actions) >= 6, "shortcut actions missing"
    ids = [str(x.get("WFWorkflowActionIdentifier", "")) for x in actions]
    text = str(plist)
    # Two native Open App targets, one Reminders and one Perplexity.
    assert ids.count("is.workflow.actions.openapp") == 2, ids
    assert "com.apple.reminders" in text or "'reminders'" in text, "Reminders launch missing"
    assert "ai.perplexity.app" in text, "Perplexity launch missing"
    assert "買い物リスト" in text and "商品リサーチ" in text
    assert any("clipboard" in identifier.lower() for identifier in ids), "product research prompt not copied"
    assert any("choosefromlist" in identifier.lower() for identifier in ids), "choose from list missing"
    assert all("openurl" not in identifier.lower() for identifier in ids), "URL bridge banned"
    assert all("quicklook" not in identifier.lower() for identifier in ids), "unwanted preview banned"
    for forbidden in (
        "YOS_NOTION_INTEGRATION_TOKEN", "api.notion.com", "YOS Shopping.js",
        "scriptable:///run", "open.scriptable.app", "vercel.app", "WFWorkflowImportQuestions"
    ):
        assert forbidden not in str(actions), forbidden
    print("Native shopping and research launcher: PASS", len(actions), "actions")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    check(parser.parse_args().file)
