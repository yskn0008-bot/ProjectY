#!/usr/bin/env python3
"""Patch a single read-only published-issue Scriptable intent in a TEST Shortcut."""
import argparse
import plistlib
from pathlib import Path

INTENT="dk.simonbs.Scriptable.RunScriptInlineIntent"
MARKER="__YOS_JOURNAL_NOTIFICATION_INLINE__"

def patch(candidate, source):
    root=plistlib.loads(candidate.read_bytes())
    acts=root.get('WFWorkflowActions',[])
    matches=[(i,a) for i,a in enumerate(acts) if
        a.get('WFWorkflowActionIdentifier')==INTENT and
        MARKER in repr(a.get('WFWorkflowActionParameters',{}).get('script'))]
    if len(matches)!=1:
        raise SystemExit('Notification intent placeholder not found exactly once')
    i,action=matches[0]
    p=action['WFWorkflowActionParameters']
    if p.get('runInApp') is not False or p.get('ShowWhenRun') is not False or p.get('parameter') not in ('',None):
        raise SystemExit('Unexpected Scriptable UI or input parameters')
    script=source.read_text(encoding='utf-8')
    required=['YOS_JOURNAL_NOTIFY_HOLD','YOS_JOURNAL_NOTIFY_SCHEDULED',
              'raw.githubusercontent.com','Notification','Script.setShortcutOutput','Script.complete()']
    if not all(x in script for x in required): raise SystemExit('Notification contract missing')
    prohibited=['api.notion.com','api.github.com','YOS_NOTION_INTEGRATION_TOKEN',
                'YOS_JOURNAL_DRAFT_V1','YOS_RESEARCH_ABSTRACT_V1']
    if any(x in script for x in prohibited): raise SystemExit('Notification cannot access private research')
    p['script']={'Value':{'string':script},'WFSerializationType':'WFTextTokenString'}
    candidate.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    check=plistlib.loads(candidate.read_bytes())
    if check['WFWorkflowActions'][i]['WFWorkflowActionParameters']['script']['Value']['string']!=script:
        raise SystemExit('Failed to read back notification script')
    print('YOS JOURNAL published issue notification patch PASS')

if __name__=='__main__':
    cli=argparse.ArgumentParser()
    cli.add_argument('shortcut',type=Path)
    cli.add_argument('--script',type=Path,required=True)
    a=cli.parse_args()
    patch(a.shortcut,a.script)
