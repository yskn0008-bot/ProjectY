#!/usr/bin/env python3
import plistlib
import sys
from pathlib import Path

p=Path(sys.argv[1])
root=plistlib.loads(p.read_bytes())
actions=root["WFWorkflowActions"]
ids=[a.get("WFWorkflowActionIdentifier","") for a in actions]
blob=repr(root)

assert root.get("WFWorkflowName") == "Clarity Core"
assert root.get("WFWorkflowHasShortcutInputVariables") is True
assert len(actions) >= 490, len(actions)
assert "is.workflow.actions.dictatetext" not in ids
assert ids.count("is.workflow.actions.ask") == 1
assert ids.count("is.workflow.actions.askllm") == 1

# Input front door: Shortcut Input if supplied, otherwise one text question.
front=actions[:8]
assert front[0].get("WFWorkflowActionIdentifier") == "is.workflow.actions.number.random"
assert any(a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.conditional" and
           a.get("WFWorkflowActionParameters",{}).get("WFCondition")==100 and
           "ShortcutInput" in repr(a) for a in front)
assert sum(a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.setvariable" and
           a.get("WFWorkflowActionParameters",{}).get("WFVariableName")=="userInput"
           for a in front) == 2
ask=next(a for a in front if a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.ask")
assert ask["WFWorkflowActionParameters"].get("WFAskActionPrompt")=="Clarity"
assert ask["WFWorkflowActionParameters"].get("WFInputType")=="Text"

llm=next(a for a in actions if a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.askllm")
lp=llm["WFWorkflowActionParameters"]
assert lp.get("WFLLMModel")=="ChatGPT"
assert lp.get("WFGenerativeResultType")=="Dictionary"
assert lp.get("FollowUp") is False
assert lp.get("WFAllowWebSearch") is True

assert "Clarity Core" in blob
assert "NEXT_ANSWER" in blob
assert "YOS_Home" in blob
assert "NEXT_MONEY" not in blob
assert "通常回答でもactionsを空にしない" in blob
assert "BEGIN_USER_INPUT" in blob
assert "END_USER_INPUT" in blob

runs=[a for a in actions if a.get("WFWorkflowActionIdentifier","").endswith("runworkflow")]
assert any("YOS_Home" in repr(a.get("WFWorkflowActionParameters",{})) for a in runs)

# Existing engine essentials.
for marker in ("YOS_OpenApp","NEXT_DEVICE","NEXT_TIMER","NEXT_CALENDAR","NEXT_REMINDER","NEXT_NAVIGATE","NEXT_ANSWER"):
    assert marker in blob, marker
assert any(i.endswith("setbrightness") for i in ids)
assert any(i.endswith("setvolume") for i in ids)
assert any(i.endswith("timer.start") for i in ids)
assert any(i.endswith("addnewevent") for i in ids)
assert any(i.endswith("addnewreminder") for i in ids)
assert "Clarity Next Ledger.txt" in blob
assert "安全に操作を判断できませんでした" not in blob\nassert "answer_fallback" in blob\n
# No lingering reference to deleted voice input action.
assert "WFSpeechLanguage" not in blob
print(f"Clarity Core structural audit: PASS ({len(actions)} actions)")
