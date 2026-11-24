#!/usr/bin/env python3
"""Patch the private Notion draft handoff into an already-compiled YOS JOURNAL Shortcut.

Only the exact placeholder action can be patched. The parameter attachment must
reference the same generated GPT draft as the preceding iCloud Save File action.
"""
from __future__ import annotations
import argparse
import copy
import plistlib
import uuid
from pathlib import Path

INTENT="dk.simonbs.Scriptable.RunScriptInlineIntent"
SCRIPT_MARKER="__YOS_JOURNAL_INBOX_INLINE__"
PARAM_MARKER="__YOS_JOURNAL_DRAFT_INPUT__"


def provenance_parameter(actions, draft):
    research_saves=[a.get('WFWorkflowActionParameters',{}) for a in actions
        if a.get('WFWorkflowActionIdentifier')=='is.workflow.actions.documentpicker.save'
        and 'YOS-JOURNAL-GPT-RESEARCH-' in repr(a.get('WFWorkflowActionParameters',{}))]
    if not research_saves:
        return copy.deepcopy(draft)  # preserve legacy two-stage candidate
    if len(research_saves)!=1:
        raise SystemExit('ambiguous research backup')
    research=research_saves[0].get('WFInput',{})
    r=research.get('Value',{})
    if research.get('WFSerializationType')!='WFTextTokenAttachment' or r.get('Type')!='ActionOutput' or r.get('OutputName')!='researchText' or not r.get('OutputUUID'):
        raise SystemExit('wrong research variable in backup')
    separator='\n\n<<YOS_JOURNAL_RESEARCH_PROVENANCE_V1>>\n\n'
    return {'WFSerializationType':'WFTextTokenString','Value':{
        'string':'\ufffc'+separator+'\ufffc',
        'attachmentsByRange':{'{0, 1}':copy.deepcopy(draft['Value']),
            '{'+str(1+len(separator))+', 1}':copy.deepcopy(r)}}}


def patch(path:Path,script_path:Path):
    root=plistlib.loads(path.read_bytes())
    actions=root.get('WFWorkflowActions',[])
    targets=[(i,a) for i,a in enumerate(actions) if a.get('WFWorkflowActionIdentifier')==INTENT and a.get('WFWorkflowActionParameters',{}).get('script')==SCRIPT_MARKER]
    if len(targets)!=1:raise SystemExit('expected exactly one inline placeholder')
    idx,target=targets[0]
    if idx<1 or actions[idx-1].get('WFWorkflowActionIdentifier')!='is.workflow.actions.documentpicker.save':
        raise SystemExit('inline handoff must immediately follow iCloud backup')
    save=actions[idx-1].get('WFWorkflowActionParameters',{})
    if save.get('WFSaveFileOverwrite') is not False or save.get('WFAskWhereToSave') is not False:
        raise SystemExit('unsafe save action')
    attachment=save.get('WFInput')
    if not isinstance(attachment,dict) or attachment.get('WFSerializationType')!='WFTextTokenAttachment':
        raise SystemExit('cannot recover exact draft attachment')
    token=attachment.get('Value',{})
    if token.get('Type')!='ActionOutput' or token.get('OutputName')!='draftText' or not token.get('OutputUUID'):
        raise SystemExit('wrong draft variable in save action')
    p=target['WFWorkflowActionParameters']
    if p.get('parameter')!=PARAM_MARKER or p.get('runInApp') is not False or p.get('ShowWhenRun') is not False:
        raise SystemExit('unexpected Scriptable intent parameters')
    script=script_path.read_text(encoding='utf-8')
    if len(script)<300 or 'YOS_JOURNAL_DRAFT_V1' not in script or 'Keychain.contains(' not in script:
        raise SystemExit('private Inbox script contract missing')
    p['script']={'Value':{'string':script},'WFSerializationType':'WFTextTokenString'}
    parameter=provenance_parameter(actions,attachment)
    if parameter.get('WFSerializationType')=='WFTextTokenString':
        # Materialize the composite as a native Text action, then pass its single output.
        output_id=str(uuid.uuid4()).upper()
        actions.insert(idx,{'WFWorkflowActionIdentifier':'is.workflow.actions.gettext','WFWorkflowActionParameters':{'WFTextActionText':parameter,'UUID':output_id,'CustomOutputName':'journalBoundText'}})
        idx+=1
        parameter={'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'ActionOutput','OutputUUID':output_id,'OutputName':'journalBoundText'}}
    p['parameter']=parameter
    result=repr(root)
    if SCRIPT_MARKER in result or PARAM_MARKER in result:
        raise SystemExit('handoff placeholders survived')
    path.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    check=plistlib.loads(path.read_bytes())
    patched=check['WFWorkflowActions'][idx]['WFWorkflowActionParameters']
    if patched['parameter']!=parameter:raise SystemExit('draft variable parameter mismatch after readback')
    if patched['script']['Value']['string']!=script:raise SystemExit('script changed after readback')
    print('YOS JOURNAL private Notion draft patch PASS')


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('shortcut',type=Path)
    ap.add_argument('--script',type=Path,required=True)
    a=ap.parse_args()
    patch(a.shortcut,a.script)
