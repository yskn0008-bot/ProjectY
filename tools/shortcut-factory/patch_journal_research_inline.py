#!/usr/bin/env python3
"""Patch public research-only Scriptable intent in an unsigned candidate Shortcut.
Never modifies a signed or installed shortcut; refuses unexpected placeholder count.
"""
import argparse
import plistlib
from pathlib import Path

INTENT="dk.simonbs.Scriptable.RunScriptInlineIntent"
MARKER="__YOS_JOURNAL_RESEARCH_INLINE__"


def validate_research_boundary(script):
    """Allow the exact reviewed-history GET in this private on-device workflow.
    Public research requests still use fixed topics and never carry the Notion token.
    This is a structural check, supplemented by the runtime privacy regression tests.
    """
    required = (
        "const REVIEW_PAGE='4215ca88-2895-816f-bdd3-c48c6cf700ae';",
        "const base='https://api.notion.com/v1/blocks/'+REVIEW_PAGE+'/children?page_size=100';",
        "const token=Keychain.get('YOS_NOTION_INTEGRATION_TOKEN');",
        "r.method='GET';r.timeoutInterval=Math.min(4,remaining/1000);",
        "r.onRedirect=()=>null;",
        "r.headers={Authorization:'Bearer '+token,'Notion-Version':'2025-09-03',Accept:'application/json'};",
        "return historyFromBlocks(blocks);",
        "const seen=new Set(history);",
        "await reviewedHistory()",
    )
    if not all(x in script for x in required):
        raise AssertionError('reviewed history read-only boundary incomplete')
    if (script.count('api.notion.com') != 1 or
        script.count('YOS_NOTION_INTEGRATION_TOKEN') != 2 or
        script.count('Keychain.get(') != 1 or
        script.count('Authorization:') != 1 or
        'api.github.com' in script or 'args.shortcutParameter' in script or
        'Keychain.set(' in script or 'Keychain.remove(' in script or
        any(v in script for v in ("method='POST'", "method='PATCH'", "method='PUT'", "method='DELETE'"))):
        raise AssertionError('unexpected credential, user input or write API in research stage')

def patch(path, source):
    root=plistlib.loads(path.read_bytes())
    actions=root.get('WFWorkflowActions',[])
    hits=[(i,a) for i,a in enumerate(actions)
          if a.get('WFWorkflowActionIdentifier')==INTENT and
             MARKER in repr(a.get('WFWorkflowActionParameters',{}).get('script'))]
    if len(hits)!=1:
        found=[(i,str(a.get('WFWorkflowActionParameters',{}).get('script'))[:240])
               for i,a in enumerate(actions) if a.get('WFWorkflowActionIdentifier')==INTENT]
        diagnostic=[(i,a.get('WFWorkflowActionIdentifier',''),repr(a.get('WFWorkflowActionParameters',{}))[:300])
                    for i,a in enumerate(actions) if MARKER in repr(a)]
        raise SystemExit(f'research placeholder missing; inline: {found}; marker matches: {diagnostic}; first actions: {[x.get("WFWorkflowActionIdentifier") for x in actions[:14]]}')
    i,action=hits[0]
    if any(str(a.get('WFWorkflowActionIdentifier','')).endswith('askllm') for a in actions[:i]):
        raise SystemExit('research must occur before first GPT')
    p=action.get('WFWorkflowActionParameters',{})
    if p.get('runInApp') is not False or p.get('ShowWhenRun') is not False or p.get('parameter') not in ('',None):
        raise SystemExit('unexpected public research action arguments')
    script=source.read_text('utf-8')
    required=('YOS_RESEARCH_ABSTRACT_V1','YOS_RESEARCH_HOLD_V1','Script.setShortcutOutput','Script.complete()')
    if not all(x in script for x in required):
        raise SystemExit('missing public research safety markers')
    validate_research_boundary(script)
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
