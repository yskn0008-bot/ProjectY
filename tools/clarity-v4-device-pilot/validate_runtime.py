"""Fail-closed static audit for unsigned compiled Clarity v4 (not a live iPhone test)."""
from pathlib import Path
import plistlib
import sys
p=Path(sys.argv[1])
wf=plistlib.loads(p.read_bytes())
ids=[a.get('WFWorkflowActionIdentifier','') for a in wf.get('WFWorkflowActions',[])]
num=lambda v: sum(x==v for x in ids)
assert num('is.workflow.actions.askllm')==1, ids
assert num('dk.simonbs.Scriptable.RunScriptInlineIntent')==4, ids
assert num('is.workflow.actions.timer.start')==1, ids
assert num('is.workflow.actions.setbrightness')==1, ids
assert not any(x.endswith('runworkflow') for x in ids), ids
assert len(ids)>=12
assert not any(x in ('is.workflow.actions.openurl','is.workflow.actions.sendmessage') for x in ids)
print(f'PASS compile audit: {len(ids)} actions, AI=1, Scriptable=4, timer=1, brightness=1 (unsigned)')
