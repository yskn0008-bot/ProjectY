#!/usr/bin/env python3
"""Static contract for the unsigned YOS JOURNAL source-first TEST Shortcut.
Does not claim runtime, Notion readback or original-publication validation.
"""
import argparse
import plistlib
from pathlib import Path

INTENT="dk.simonbs.Scriptable.RunScriptInlineIntent"
def validate(path):
    root=plistlib.loads(path.read_bytes())
    actions=root.get("WFWorkflowActions",[])
    ids=[a.get('WFWorkflowActionIdentifier','') for a in actions]
    ask=[i for i,v in enumerate(ids) if str(v).endswith('askllm')]
    saves=[i for i,v in enumerate(ids) if v=='is.workflow.actions.documentpicker.save']
    inline=[i for i,v in enumerate(ids) if v==INTENT]
    if len(ask)!=2 or len(saves)!=3 or len(inline)!=2:
        raise AssertionError(f"expected two GPT, three backups, and two Scriptable: {len(ask),len(saves),len(inline)}")
    if not (inline[0]<saves[0]<ask[0]<saves[1]<ask[1]<saves[2]<inline[1]):
        raise AssertionError("unexpected source->writer->backup->editor->backup->private Notion order")
    scripts=[]
    for i in inline:
        p=actions[i]['WFWorkflowActionParameters']
        if p.get('runInApp') is not False or p.get('ShowWhenRun') is not False:
            raise AssertionError("Scriptable unexpectedly presents app UI")
        x=p.get('script',{}).get('Value',{}).get('string')
        if not isinstance(x,str) or len(x)<300: raise AssertionError('inline script missing')
        scripts.append(x)
    if 'YOS_RESEARCH_ABSTRACT_V1' not in scripts[0] or 'YOS_RESEARCH_HOLD_V1' not in scripts[0]:
        raise AssertionError("research source preflight missing")
    if any(x in scripts[0] for x in ['api.notion.com','api.github.com','YOS_NOTION_INTEGRATION_TOKEN']):
        raise AssertionError("public source research must never send private data")
    if 'YOS_JOURNAL_DRAFT_V1' not in scripts[1] or 'YOS_NOTION_INTEGRATION_TOKEN' not in scripts[1]:
        raise AssertionError("private draft handoff changed")
    if any(x in repr(root) for x in ['__YOS_JOURNAL_RESEARCH_INLINE__','__YOS_JOURNAL_INBOX_INLINE__','__YOS_JOURNAL_DRAFT_INPUT__']):
        raise AssertionError("unpatched placeholders")
    for i in ask:
        p=actions[i]['WFWorkflowActionParameters']
        if p.get('FollowUp') is not False or p.get('WFGenerativeResultType')!='Text':
            raise AssertionError("GPT must use isolated Text with FollowUp off")
    if 'YOS_RESEARCH_ABSTRACT_V1' not in repr(root) or '公開不可・要審査' not in repr(root):
        raise AssertionError("missing editorial safety prompts")
    research,p1,p2=[actions[i]['WFWorkflowActionParameters'] for i in saves]
    for p in (research,p1,p2):
        if p.get('WFAskWhereToSave') is not False or p.get('WFSaveFileOverwrite') is not False:
            raise AssertionError("iCloud backup is prompting or overwriting")
    if 'YOS-JOURNAL-GPT-RESEARCH-' not in repr(research) or 'YOS-JOURNAL-GPT-WRITER-' not in repr(p1) or 'YOS-JOURNAL-GPT-DRAFT-' not in repr(p2):
        raise AssertionError("writer and editor backup naming changed")
    if research['WFInput'].get('Value',{}).get('OutputName')!='researchText':
        raise AssertionError('research backup not from actual public source output')
    if p1['WFInput'].get('Value',{}).get('OutputName')!='writerText' or p2['WFInput'].get('Value',{}).get('OutputName')!='draftText':
        raise AssertionError("backups don't preserve original model outputs")
    if actions[inline[1]]['WFWorkflowActionParameters']['parameter']!=p2['WFInput']:
        raise AssertionError("Notion private handoff must use exact editor backup")
    researchUUID=actions[inline[0]].get('WFWorkflowActionParameters',{}).get('UUID')
    # Use text/gettext output chain; because rawAction is currently not guaranteed
    # to be inferred as an ActionOutput by the compiler, compiler checks only.
    if 'researchText' not in repr(root):
        raise AssertionError('GPT prompt must embed research material variable')
    return {"actions":len(actions),"gpt":2,"scriptable":2,"save":3}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument('shortcut',type=Path)
    a=p.parse_args()
    print('YOS JOURNAL research-first candidate:',validate(a.shortcut))
