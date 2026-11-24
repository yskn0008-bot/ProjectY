#!/usr/bin/env python3
"""Compiled iPhone candidate safety contract: read-only inspection."""
import plistlib
from pathlib import Path
import sys

root=plistlib.loads(Path(sys.argv[1]).read_bytes())
actions=root.get("WFWorkflowActions",[])
inline=[a for a in actions if a.get("WFWorkflowActionIdentifier")=="dk.simonbs.Scriptable.RunScriptInlineIntent"]
assert len(inline)==1, f"Expected exactly one Scriptable app action, found {len(inline)}"
p=inline[0]["WFWorkflowActionParameters"]
source=p.get("script",{}).get("Value",{}).get("string","")
assert len(source)>65000
for expected in ('YOS Remote Hub v6.6','id="quickPictureModes"','id="quickSoundModes"',
                 'id="quickAudioOutputs"','YOS Light Widget','YOS AC Widget',
                 'yos.tapo.floor.local-host','getSoundSettings','getApplicationList',
                 'extInput:hdmi?port=3','VPN接続・解除の直接操作はまだ非対応'):
    assert expected in source, expected
assert 'Untitled Script 9' not in repr(root), "No active installed Script should be modified or even referenced"
assert '__YOS_BRAVIA_QUICK_MEDIA_INLINE__' not in repr(root)
assert p.get("runInApp") is True, "WebView.present requires Scriptable foreground mode"
assert p.get("ShowWhenRun") is False
# The signed isolated launcher must include the new responsive and direct-control revision.
for expected in ('async function pictureSingle(target)', 'async function runProbeLane()',
                 'probeEpoch', 'async function executeTVShortcut(raw)',
                 'yos.remote.power-toggle.lock.v1.tv', 'height:48px',
                 'grid-auto-columns:calc((100% - 10px)/3)'):
    assert expected in source, expected
assert "ntn_" not in source and "sk-proj-" not in source
assert not any(a.get("WFWorkflowActionIdentifier") in (
    "is.workflow.actions.deletefile","is.workflow.actions.file.delete") for a in actions)
print("BRAVIA Quick signed candidate structural PASS:",len(actions),"actions",len(source),"embedded chars")
