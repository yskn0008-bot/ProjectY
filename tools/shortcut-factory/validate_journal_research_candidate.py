#!/usr/bin/env python3
"""Static contract for the unsigned YOS JOURNAL source-first TEST Shortcut.
Does not claim runtime, Notion readback or original-publication validation.
"""
import argparse
import plistlib
from patch_journal_draft_inbox import provenance_parameter
from patch_journal_research_inline import validate_research_boundary
from pathlib import Path

INTENT="dk.simonbs.Scriptable.RunScriptInlineIntent"
def validate(path):
    root=plistlib.loads(path.read_bytes())
    actions=root.get("WFWorkflowActions",[])
    ids=[a.get('WFWorkflowActionIdentifier','') for a in actions]
    ask=[i for i,v in enumerate(ids) if str(v).endswith('askllm')]
    saves=[i for i,v in enumerate(ids) if v=='is.workflow.actions.documentpicker.save']
    inline=[i for i,v in enumerate(ids) if v==INTENT]
    if len(ask)!=3 or len(saves)!=6 or len(inline)!=4:
        raise AssertionError(f"expected three GPT, six backups, and four Scriptable: {len(ask),len(saves),len(inline)}")
    if not (inline[0]<saves[0]<ask[0]<saves[1]<inline[1]<saves[2]<ask[1]<saves[3]<ask[2]<saves[4]<inline[2]<saves[5]<inline[3]):
        raise AssertionError("unexpected source pool->reviewer->offline selection->approved evidence->writer->private Notion order")
    scripts=[]
    for i in inline[:3]:
        p=actions[i]['WFWorkflowActionParameters']
        if p.get('runInApp') is not False or p.get('ShowWhenRun') is not False:
            raise AssertionError("Scriptable unexpectedly presents app UI")
        x=p.get('script',{}).get('Value',{}).get('string')
        if not isinstance(x,str) or len(x)<300: raise AssertionError('inline script missing')
        scripts.append(x)
    if 'YOS_RESEARCH_FULLTEXT_POOL_V1' not in scripts[0] or 'YOS_RESEARCH_HOLD_V1' not in scripts[0]:
        raise AssertionError("research source preflight missing")
    validate_research_boundary(scripts[0])
    if not all(x in scripts[1] for x in ('YOS_RESEARCH_APPROVED_V1','YOS_REVIEW_HOLD_V1','UNSUPPORTED_EXCERPT')) or any(x in scripts[1] for x in ('new Request','Keychain.','fetch(')):
        raise AssertionError('offline source gate missing')
    if 'YOS_JOURNAL_DRAFT_V1' not in scripts[2] or 'YOS_NOTION_INTEGRATION_TOKEN' not in scripts[2]:
        raise AssertionError("private draft handoff changed")
    if any(x in repr(root) for x in ['__YOS_JOURNAL_RESEARCH_INLINE__','__YOS_JOURNAL_INBOX_INLINE__','__YOS_JOURNAL_DRAFT_INPUT__','__YOS_JOURNAL_REVIEW_INLINE__','__YOS_JOURNAL_REVIEW_INPUT__']):
        raise AssertionError("unpatched placeholders")
    for i in ask:
        p=actions[i]['WFWorkflowActionParameters']
        if p.get('FollowUp') is not False or p.get('WFGenerativeResultType')!='Text':
            raise AssertionError("GPT must use isolated Text with FollowUp off")
    if 'validProvenance(raw)' not in scripts[2] or 'THREE_SOURCE_PROVENANCE_MISMATCH_REVIEW_REQUIRED' not in scripts[2] or 'JOURNAL下書き・未検証・公開禁止' not in scripts[2]:
        raise AssertionError('private archive must preserve source review and never-publish state')
    if 'YOS_RESEARCH_APPROVED_V1' not in repr(root) or '公開不可・要審査' not in repr(root):
        raise AssertionError("missing editorial safety prompts")
    pool,p1,research,p2,final,receipt=[actions[i]['WFWorkflowActionParameters'] for i in saves]
    for p in (pool,research,p1,p2,final,receipt):
        if p.get('WFAskWhereToSave') is not False or p.get('WFSaveFileOverwrite') is not False:
            raise AssertionError("iCloud backup is prompting or overwriting")
    if 'YOS-JOURNAL-GPT-RESEARCH-' not in repr(research) or 'YOS-JOURNAL-GPT-WRITER-' not in repr(p1) or 'YOS-JOURNAL-GPT-DRAFT-' not in repr(p2):
        raise AssertionError("writer and editor backup naming changed")
    if research['WFInput'].get('Value',{}).get('OutputName')!='researchText':
        raise AssertionError('research backup not from actual public source output')
    if p1['WFInput'].get('Value',{}).get('OutputName')!='writerText' or p2['WFInput'].get('Value',{}).get('OutputName')!='draftText':
        raise AssertionError("backups don't preserve original model outputs")
    if 'YOS-JOURNAL-GPT-CANDIDATES-' not in repr(pool) or pool['WFInput']['Value'].get('OutputName')!='researchPool':
        raise AssertionError('original candidate backup missing')
    review_bound=actions[inline[1]-1]
    rb=review_bound['WFWorkflowActionParameters']
    review_value=rb['WFTextActionText']['Value']
    if review_bound['WFWorkflowActionIdentifier']!='is.workflow.actions.gettext' or review_value['string']!='\ufffc\n<<YOS_REVIEW_SELECTION_V1>>\n\ufffc' or list(review_value['attachmentsByRange'].values())!=[pool['WFInput']['Value'],p1['WFInput']['Value']]:
        raise AssertionError('exact reviewer and pool binding missing')
    if actions[inline[1]]['WFWorkflowActionParameters']['parameter']['Value'].get('OutputUUID')!=rb['UUID']:
        raise AssertionError('wrong review input')
    if 'YOS-JOURNAL-GPT-FINALCHECK-' not in repr(final) or final['WFInput']['Value'].get('OutputName')!='finalReviewText':
        raise AssertionError('final check backup missing')
    if 'YOS_FINAL_REVIEW_PASS_V1' not in repr(actions[ask[2]:inline[2]]) or 'YOS_FINAL_REVIEW_HOLD_V1' not in repr(actions[saves[3]:ask[2]+1]):
        raise AssertionError('independent final review gate missing')
    bound=actions[inline[2]-1]
    bp=bound['WFWorkflowActionParameters']
    if bound['WFWorkflowActionIdentifier']!='is.workflow.actions.gettext' or bp.get('WFTextActionText')!=provenance_parameter(actions,p2['WFInput']):
        raise AssertionError("Notion handoff must materialize exact editor and research backups")
    param=actions[inline[2]]['WFWorkflowActionParameters']['parameter']
    if not bp.get('UUID') or param!={'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'ActionOutput','OutputUUID':bp['UUID'],'OutputName':'journalBoundText'}}:
        raise AssertionError("Notion handoff must reference native Text output")
    researchUUID=actions[inline[0]].get('WFWorkflowActionParameters',{}).get('UUID')
    # Use text/gettext output chain; because rawAction is currently not guaranteed
    # to be inferred as an ActionOutput by the compiler, compiler checks only.
    if 'researchText' not in repr(root):
        raise AssertionError('GPT prompt must embed research material variable')
    rp=actions[inline[3]]['WFWorkflowActionParameters']
    if '__YOS_JOURNAL_REFLECT_INLINE__' not in repr(rp.get('script')) or rp.get('parameter')!='__YOS_JOURNAL_REFLECT_INPUT__' or rp.get('runInApp') is not False or rp.get('ShowWhenRun') is not False:
        raise AssertionError('private reflection placeholder mismatch')
    if 'YOS-JOURNAL-GPT-INBOX-RECEIPT-' not in repr(receipt) or receipt['WFInput']['Value'].get('OutputName')!='notionText':
        raise AssertionError('Inbox receipt backup mismatch')
    if 'YOS_JOURNAL_NOTION_VERIFIED:' not in repr(actions[inline[2]:inline[3]]):
        raise AssertionError('reflection must follow verified Inbox save')
    return {"actions":len(actions),"gpt":3,"scriptable":4,"save":6}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument('shortcut',type=Path)
    a=p.parse_args()
    print('YOS JOURNAL research-first candidate:',validate(a.shortcut))
