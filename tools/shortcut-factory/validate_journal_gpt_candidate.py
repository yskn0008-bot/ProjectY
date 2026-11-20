#!/usr/bin/env python3
"""Safety verification for the YOS JOURNAL GPT制作 Shortcut (unsigned plist).

Only checks compiled structure, not generated editorial facts or iPhone behaviour.
"""
from __future__ import annotations
import argparse
import plistlib
from pathlib import Path

BANNED_ACTIONS = {
    'is.workflow.actions.getcontentssofurl',
    'is.workflow.actions.openurl',
    'is.workflow.actions.runworkflow',
    'is.workflow.actions.file.append',
    'is.workflow.actions.file.delete',
    'is.workflow.actions.deletefiles',
    'is.workflow.actions.setclipboard',
}


def validate(path: Path) -> dict:
    wf = plistlib.loads(path.read_bytes())
    actions = wf.get('WFWorkflowActions')
    if not isinstance(actions, list):
        raise AssertionError('WFWorkflowActions missing')
    pairs = [(a.get('WFWorkflowActionIdentifier', ''), a.get('WFWorkflowActionParameters', {})) for a in actions]
    ids = [ident for ident, _ in pairs]
    for banned in BANNED_ACTIONS:
        assert banned not in ids, f'unexpected action: {banned}'
    ask = [p for n, p in pairs if str(n).endswith('askllm')]
    assert len(ask) == 2, f'expected writer+editor askllm, got {len(ask)}'
    for stage, params in enumerate(ask):
        assert params.get('FollowUp') is False, f'stage {stage} FollowUp must be false'
        assert params.get('WFGenerativeResultType') == 'Text', f'stage {stage} must output text'
        assert params.get('WFLLMModel') == 'ChatGPT', f'stage {stage} model not ChatGPT'
        assert params.get('WFLLMPrompt') is not None, f'stage {stage} missing prompt'
    workflow_rep = repr(wf)
    # WFLLMPrompt references the preceding Text action via token attachment;
    # the literal editorial prompt is therefore elsewhere in the workflow.
    assert 'YOS JOURNAL' in workflow_rep and '要裏取り' in workflow_rep, 'editorial safety prompt missing'
    saves = [p for n, p in pairs if n == 'is.workflow.actions.documentpicker.save']
    assert len(saves) == 2, f'expected writer and editor backup actions, got {len(saves)}'
    for save in saves:
        assert save.get('WFAskWhereToSave') is False, f'location prompt unexpected: {save}'
        assert save.get('WFSaveFileOverwrite') is False, f'overwrite unexpectedly enabled: {save}'
    writer_backup,save=saves
    assert 'YOS-JOURNAL-GPT-WRITER-' in repr(writer_backup), 'writer backup missing'
    assert 'YOS-JOURNAL-GPT-DRAFT-' in repr(save), 'editor backup missing'
    writer_attachment=writer_backup.get('WFInput')
    assert isinstance(writer_attachment,dict) and writer_attachment.get('Value',{}).get('OutputName')=='writerText', 'writer backup not from GPT1'
    attachment=save.get('WFInput')
    assert isinstance(attachment,dict) and attachment.get('Value',{}).get('OutputName')=='draftText', 'editor backup not from GPT2'
    writer_uuid=writer_attachment.get('Value',{}).get('OutputUUID')
    editor_uuid=attachment.get('Value',{}).get('OutputUUID')
    assert writer_uuid and editor_uuid and writer_uuid!=editor_uuid, 'GPT stages not separate'
    writer_ask_index=next(i for i,n in enumerate(ids) if str(n).endswith('askllm'))
    editor_ask_index=[i for i,n in enumerate(ids) if str(n).endswith('askllm')][1]
    saves_index=[i for i,n in enumerate(ids) if n=='is.workflow.actions.documentpicker.save']
    handoff_index=ids.index('dk.simonbs.Scriptable.RunScriptInlineIntent')
    assert writer_ask_index<saves_index[0]<editor_ask_index<saves_index[1]<handoff_index, 'writer/editor action order invalid'
    assert '執筆原稿' in workflow_rep and 'writerText' in workflow_rep, 'second GPT must receive first GPT text'
    scriptable_id='dk.simonbs.Scriptable.RunScriptInlineIntent'
    inline=[p for n,p in pairs if n==scriptable_id]
    assert len(inline)==1, f'expected one private Scriptable handoff, got {len(inline)}'
    handoff=inline[0]
    assert handoff.get('runInApp') is False and handoff.get('ShowWhenRun') is False, 'unexpected UI handoff'
    assert handoff.get('parameter')==attachment, 'Notion input differs from locally saved draft'
    raw=handoff.get('script',{})
    script=raw.get('Value',{}).get('string') if isinstance(raw,dict) else None
    assert isinstance(script,str), 'Notion inline script missing'
    for required in ('api.notion.com/v1','YOS_NOTION_INTEGRATION_TOKEN',
                     'YOS_JOURNAL_DRAFT_V1','LOCAL_RECEIPT_READBACK_FAILED',
                     'PREVIOUS_RESULT_UNKNOWN','NOTION_API_ACK_PENDING_READBACK',
                     'Keychain.contains','Script.complete()'):
        assert required in script, f'private handoff safety missing: {required}'
    assert 'raw.githubusercontent.com' not in script and 'api.github.com' not in script, 'public upload forbidden'
    assert '__YOS_JOURNAL_INBOX_INLINE__' not in workflow_rep, 'unpatched Scriptable action'
    assert '__YOS_JOURNAL_DRAFT_INPUT__' not in workflow_rep, 'unpatched draft attachment'
    return {'actions': len(actions), 'ask_llm': len(ask), 'save': len(saves), 'private_handoff':len(inline)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('plist', type=Path)
    args = ap.parse_args()
    print('YOS JOURNAL GPT structure PASS:', validate(args.plist))


if __name__ == '__main__':
    main()
