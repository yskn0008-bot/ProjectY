#!/usr/bin/env python3
"""Validate Cherri-produced shortcut plists before any external signing."""
import plistlib
import sys
from pathlib import Path
assert len(sys.argv)==3
for path in map(Path,sys.argv[1:]):
    wf=plistlib.loads(path.read_bytes())
    actions=wf.get('WFWorkflowActions',[])
    assert len(actions)>=3, (path,len(actions))
    ids=[x.get('WFWorkflowActionIdentifier','') for x in actions]
    assert any('openurl' in x.lower() for x in ids), (path,ids)
    assert not any('delete' in x.lower() or 'appendfile' in x.lower() for x in ids),path
    print(path.name, 'PASS',len(actions),'actions')
