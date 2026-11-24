#!/usr/bin/env python3
"""Patch public research-only Scriptable intent in an unsigned candidate Shortcut.
Never modifies a signed or installed shortcut; refuses unexpected placeholder count.
"""
import argparse
import plistlib
import copy
import uuid
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

def patch(path, source, selection):
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
    required=('YOS_RESEARCH_FULLTEXT_POOL_V1','YOS_RESEARCH_HOLD_V1','Script.setShortcutOutput','Script.complete()')
    if not all(x in script for x in required):
        raise SystemExit('missing public research safety markers')
    validate_research_boundary(script)
    p['script']={'Value':{'string':script},'WFSerializationType':'WFTextTokenString'}
    # Materialize the exact pool and reviewer backups as one native Text value.
    selected=[(j,v) for j,v in enumerate(actions) if v.get('WFWorkflowActionIdentifier')==INTENT and
              '__YOS_JOURNAL_REVIEW_INLINE__' in repr(v.get('WFWorkflowActionParameters',{}).get('script'))]
    if len(selected)!=1:raise SystemExit('missing unique review selection action')
    j,action=selected[0]
    q=action['WFWorkflowActionParameters']
    if q.get('parameter')!='__YOS_JOURNAL_REVIEW_INPUT__' or q.get('runInApp') is not False or q.get('ShowWhenRun') is not False:
        raise SystemExit('unexpected review parameters')
    def backup(prefix,name):
        found=[v['WFWorkflowActionParameters']['WFInput'] for v in actions[:j] if v.get('WFWorkflowActionIdentifier')=='is.workflow.actions.documentpicker.save' and prefix in repr(v.get('WFWorkflowActionParameters',{}))]
        if len(found)!=1:raise SystemExit('missing unique '+name+' backup')
        t=found[0]
        if t.get('WFSerializationType')!='WFTextTokenAttachment' or t['Value'].get('Type')!='ActionOutput' or t['Value'].get('OutputName')!=name or not t['Value'].get('OutputUUID'):
            raise SystemExit('invalid '+name+' backup token')
        return copy.deepcopy(t['Value'])
    pool=backup('YOS-JOURNAL-GPT-CANDIDATES-','researchPool')
    reviewer=backup('YOS-JOURNAL-GPT-WRITER-','writerText')
    gate=selection.read_text('utf-8')
    if not all(x in gate for x in ('YOS_RESEARCH_APPROVED_V1','YOS_REVIEW_HOLD_V1','UNSUPPORTED_EXCERPT')) or any(x in gate for x in ('new Request','Keychain.','fetch(')):
        raise SystemExit('invalid offline review gate')
    sep='\n<<YOS_REVIEW_SELECTION_V1>>\n'
    bound={'WFSerializationType':'WFTextTokenString','Value':{'string':'\ufffc'+sep+'\ufffc','attachmentsByRange':{'{0, 1}':pool,'{'+str(len(sep)+1)+', 1}':reviewer}}}
    uid=str(uuid.uuid4()).upper()
    actions.insert(j,{'WFWorkflowActionIdentifier':'is.workflow.actions.gettext','WFWorkflowActionParameters':{'UUID':uid,'CustomOutputName':'journalReviewBoundText','WFTextActionText':bound}})
    q['script']={'Value':{'string':gate},'WFSerializationType':'WFTextTokenString'}
    q['parameter']={'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'ActionOutput','OutputUUID':uid,'OutputName':'journalReviewBoundText'}}
    path.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    check=plistlib.loads(path.read_bytes())
    assert check['WFWorkflowActions'][i]['WFWorkflowActionParameters']['script']['Value']['string']==script
    print('YOS JOURNAL research intent patch PASS')

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument('shortcut',type=Path)
    parser.add_argument('--script',type=Path,required=True)
    parser.add_argument('--selection',type=Path,required=True)
    args=parser.parse_args()
    patch(args.shortcut,args.script,args.selection)
