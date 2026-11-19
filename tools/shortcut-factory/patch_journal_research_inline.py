#!/usr/bin/env python3
"""Patch public research-only Scriptable intent in an unsigned candidate Shortcut.
Never modifies a signed or installed shortcut; refuses unexpected placeholder count.
"""
import argparse
import plistlib
from pathlib import Path

INTENT="dk.simonbs.Scriptable.RunScriptInlineIntent"
MARKER="__YOS_JOURNAL_RESEARCH_INLINE__"

def patch(path, source):
    root=plistlib.loads(path.read_bytes())
    actions=root.get('WFWorkflowActions',[])
    hits=[(i,a) for i,a in enumerate(actions)
          if a.get('WFWorkflowActionIdentifier')==INTENT and
             a.get('WFWorkflowActionParameters',{}).get('script')==MARKER]
    if len(hits)!=1: raise SystemExit('research placeholder must exist exactly once')
    i,action=hits[0]
    if any(str(a.get('WFWorkflowActionIdentifier','')).endswith('askllm') for a in actions[:i]):
        raise SystemExit('research must occur before first GPT')
    p=action.get('WFWorkflowActionParameters',{})
    if p.get('runInApp') is not False or p.get('ShowWhenRun') is not False or p.get('parameter')!='':
        raise SystemExit('unexpected public research action arguments')
    script=source.read_text('utf-8')
    required=('YOS_RESEARCH_ABSTRACT_V1','YOS_RESEARCH_HOLD_V1','Script.setShortcutOutput','Script.complete()')
    if not all(x in script for x in required):
        raise SystemExit('missing public research safety markers')
    if any(x in script for x in ['api.notion.com','api.github.com','YOS_NOTION_INTEGRATION_TOKEN']):
        raise SystemExit('public research stage must not access private or write APIs')
    p['script']={'Value':{'string':script},'WFSerializationType':'WFTextTokenString'}
    path.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    check=plistlib.loads(path.read_bytes())
    assert check['WFWorkflowActions'][i]['WFWorkflowActionParameters']['script']['Value']['string']==script
    print('YOS JOURNAL research intent patch PASS')

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument('shortcut',type=Path)
    parser.add_argument('--script',type=Path,required=True)
    args=parser.parse_args()
    patch(args.shortcut,args.script)
