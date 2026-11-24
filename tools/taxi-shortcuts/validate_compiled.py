#!/usr/bin/env python3
"""Validate every compiled native Shortcut before HubSign."""
import plistlib
import sys
from pathlib import Path
names={'YOS TAXI 運行','YOS TAXI 降車','YOS TAXI 出庫','YOS TAXI 休憩','YOS TAXI 帰庫','YOS TAXI 日報','YOS TAXI 緊急'}
assert len(sys.argv)==len(names)+1, sys.argv
assert {Path(x).name.replace('_unsigned.shortcut','') for x in sys.argv[1:]}==names
for path in map(Path,sys.argv[1:]):
    wf=plistlib.loads(path.read_bytes())
    actions=wf.get('WFWorkflowActions',[])
    assert len(actions)>=2, (path,len(actions))
    ids=[str(x.get('WFWorkflowActionIdentifier','')).lower() for x in actions]
    if path.stem not in ('YOS TAXI 休憩_unsigned','YOS TAXI 緊急_unsigned'):
        assert any('openurl' in x for x in ids), (path,ids)
    assert not any('delete' in x or 'appendfile' in x or 'getfile' in x for x in ids),path
    if path.stem=='YOS TAXI 日報_unsigned':
        # The same shortcut must work from Photos Share Sheet without remote OCR.
        assert 'ActionExtension' in set(wf.get('WFWorkflowTypes') or []),path
        assert wf.get('WFWorkflowHasShortcutInputVariables') is True,path
        assert any('extracttextfromimage' in x for x in ids),(path,ids)
        assert any('setclipboard' in x for x in ids),(path,ids)
        assert sum('openurl' in x for x in ids)>=2,(path,ids)
        assert not any('getcontents' in x or 'upload' in x for x in ids),(path,ids)
    print(path.name, 'PASS',len(actions),'actions')
