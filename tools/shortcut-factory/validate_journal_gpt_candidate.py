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
    assert len(ask) == 1, f'expected one askllm, got {len(ask)}'
    params = ask[0]
    assert params.get('FollowUp') is False, 'FollowUp must be false'
    assert params.get('WFGenerativeResultType') == 'Text', 'result type must be Text'
    prompt = params.get('WFLLMPrompt')
    assert prompt is not None, 'GPT prompt missing'
    workflow_rep = repr(wf)
    # WFLLMPrompt references the preceding Text action via token attachment;
    # the literal editorial prompt is therefore elsewhere in the workflow.
    assert 'YOS JOURNAL' in workflow_rep and '要裏取り' in workflow_rep, 'editorial safety prompt missing'
    saves = [p for n, p in pairs if n == 'is.workflow.actions.documentpicker.save']
    assert len(saves) == 1, f'expected 1 save action, got {len(saves)}'
    save = saves[0]
    assert save.get('WFAskWhereToSave') is False, f'location prompt unexpected: {save}'
    assert save.get('WFSaveFileOverwrite') is False, f'overwrite unexpectedly enabled: {save}'
    assert 'YOS-JOURNAL-GPT-DRAFT-' in repr(save), 'draft filename not found'
    attachment=save.get('WFInput')
    assert isinstance(attachment,dict) and attachment.get('Value',{}).get('OutputName')=='draftText', 'saved input not draft'
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
                     'YOS_JOURNAL_DRAFT_V1','READBACK_MISMATCH',
                     'SCAN_INCOMPLETE','Keychain.contains'):
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
