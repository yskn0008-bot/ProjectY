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

def diagnostic(path:Path,out:Path):
    root=plistlib.loads(path.read_bytes())
    actions=root['WFWorkflowActions']
    idx=next(i for i,a in enumerate(actions) if a.get('WFWorkflowActionIdentifier')==INTENT and 'YOS_JOURNAL_DRAFT_V1' in repr(a))
    bound=copy.deepcopy(actions[idx-1])
    assert bound['WFWorkflowActionIdentifier']=='is.workflow.actions.gettext'
    bp=bound['WFWorkflowActionParameters']
    original=bp['WFTextActionText']['Value']
    tokens=original['attachmentsByRange']
    inputs=[]
    for i,token in enumerate(tokens.values()):
        inputs.append({'WFWorkflowActionIdentifier':'is.workflow.actions.gettext','WFWorkflowActionParameters':{'UUID':token['OutputUUID'],'CustomOutputName':token['OutputName'],'WFTextActionText':{'WFSerializationType':'WFTextTokenString','Value':{'string':['YOS_DIAGNOSTIC_DRAFT','YOS_DIAGNOSTIC_RESEARCH'][i]}}}})
    intent=copy.deepcopy(actions[idx])
    expected='YOS_DIAGNOSTIC_DRAFT'+original['string'][1:-1]+'YOS_DIAGNOSTIC_RESEARCH'
    import json
    probe="let x=args.shortcutParameter;if(Array.isArray(x)&&x.length===1)x=x[0];Script.setShortcutOutput(x==="+json.dumps(expected)+"?'受け渡し成功：原稿と資料の完全一致':'受け渡し失敗：'+(x===null?'NULL':typeof x));Script.complete();"
    intent['WFWorkflowActionParameters']['script']['Value']['string']=probe
    output=intent['WFWorkflowActionParameters']['UUID']
    root['WFWorkflowActions']=inputs+[bound,intent,{'WFWorkflowActionIdentifier':'is.workflow.actions.showresult','WFWorkflowActionParameters':{'Text':{'WFSerializationType':'WFTextTokenString','Value':{'string':'\ufffc','attachmentsByRange':{'{0, 1}':{'Type':'ActionOutput','OutputUUID':output}}}}}}]
    result_text=root['WFWorkflowActions'][-1]['WFWorkflowActionParameters']['Text']['Value']
    assert result_text['string']==chr(0xfffc)
    assert result_text['attachmentsByRange']['{0, 1}']['OutputUUID']==output
    out.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    assert 'api.notion.com' not in repr(root['WFWorkflowActions'])
    print('JOURNAL no-network parameter diagnostic PASS')


def recovery(path:Path,out:Path):
    root=plistlib.loads(path.read_bytes())
    intent=copy.deepcopy(next(a for a in root['WFWorkflowActions'] if a.get('WFWorkflowActionIdentifier')==INTENT and 'YOS_JOURNAL_DRAFT_V1' in repr(a)))
    p=intent['WFWorkflowActionParameters']
    script=p['script']['Value']['string']
    marker="try{await main();}\nfinally{Script.complete();}"
    assert script.count(marker)==1
    wrapper="async function recover(){\n  const folder=await DocumentPicker.openFolder();\n  if(typeof folder!=='string'||!folder) return '選択キャンセル。未送信。';\n  const fm=FileManager.local();\n  const names=fm.listContents(folder);\n  const byKind={DRAFT:new Map(),RESEARCH:new Map()};\n  for(const name of names){\n    const m=/^YOS-JOURNAL-GPT-(DRAFT|RESEARCH)-(\\d{4}-\\d{2}-\\d{2}-\\d{2}-\\d{2}-\\d{2})\\.(txt|md)$/.exec(name);\n    if(!m)continue;\n    const rows=byKind[m[1]];\n    if(rows.has(m[2]))rows.set(m[2],null);\n    else rows.set(m[2],name);\n  }\n  const stamp=[...byKind.DRAFT.keys()].sort().reverse()[0];\n  if(!stamp||!byKind.DRAFT.get(stamp)||!byKind.RESEARCH.get(stamp))\n    return '最新原稿と同時刻の研究資料が揃っていません。未送信。';\n  const read=async name=>{\n    const path=fm.joinPath(folder,name);\n    if(!fm.fileExists(path)||fm.isDirectory(path))throw Error('FILE_NOT_FOUND');\n    const cloud=FileManager.iCloud();\n    await cloud.downloadFileFromiCloud(path);\n    const str=fm.readString(path);\n    if(typeof str!=='string'||!str.trim())throw Error('EMPTY_FILE');\n    return str.replace(/^\\uFEFF/,'').trim();\n  };\n  const draft=await read(byKind.DRAFT.get(stamp));\n  const research=await read(byKind.RESEARCH.get(stamp));\n  if(!research.startsWith('YOS_RESEARCH_ABSTRACT_V1')||!research.includes('自動公開禁止')||\n     !draft.slice(0,260).includes('YOS_EDITORIAL_DRAFT_V1')||!draft.includes('公開不可・要審査'))\n    return '原稿と資料の形式が一致しません。未送信。';\n  const combined=draft+'\\n\\n<<YOS_JOURNAL_RESEARCH_PROVENANCE_V1>>\\n\\n'+research;\n  const a=new Alert();a.title='YOS JOURNAL 非公開保存';a.message=stamp+' の保存済み原稿をNotionへ送ります。記事生成・公開はしません。';\n  a.addAction('保存');a.addCancelAction('キャンセル');\n  if(await a.presentAlert()!==0)return 'キャンセル。未送信。';\n  const r=await transfer(combined);\n  return 'YOS_JOURNAL_NOTION_'+r.status.toUpperCase()+':'+r.reason;\n}\ntry{\n  let msg;\n  try{msg=await recover();}catch(e){msg='復旧未確認：'+String(e?.message||e).slice(0,80);}\n  const a=new Alert();a.title='YOS JOURNAL';a.message=msg;a.addAction('OK');await a.presentAlert();\n}finally{Script.complete();}\n"
    p['script']['Value']['string']=script.replace(marker,wrapper)
    p['parameter']=''
    p['runInApp']=True
    root['WFWorkflowActions']=[intent]
    assert 'DocumentPicker.openFolder()' in p['script']['Value']['string']
    assert 'await transfer(combined)' in p['script']['Value']['string']
    out.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    print('JOURNAL recovery-only Shortcut generated; iPhone folder access not verified')


def convert_to_clarity(path:Path):
    """Replace only the verified private writer with the existing named Bridge.
    Run after the old candidate validator; diagnostic/recovery artifacts remain unchanged.
    """
    original=plistlib.loads(path.read_bytes())
    root=copy.deepcopy(original)
    actions=root['WFWorkflowActions']
    matches=[i for i,a in enumerate(actions) if a.get('WFWorkflowActionIdentifier')==INTENT
        and 'YOS_JOURNAL_DRAFT_V1' in repr(a.get('WFWorkflowActionParameters',{}).get('script'))]
    if len(matches)!=1:raise SystemExit('expected one validated private handoff')
    idx=matches[0]; prior=actions[idx]['WFWorkflowActionParameters']
    parameter=prior.get('parameter',{})
    attachment=parameter.get('Value',{})
    if parameter.get('WFSerializationType')!='WFTextTokenAttachment' or attachment.get('Type')!='ActionOutput' or attachment.get('OutputName') not in ('journalBoundText','draftText') or not attachment.get('OutputUUID'):
        raise SystemExit('invalid materialized journal source')
    if not any(a.get('WFWorkflowActionParameters',{}).get('UUID')==attachment['OutputUUID'] for a in actions[:idx]):
        raise SystemExit('missing original text producer')
    if prior.get('runInApp') is not False or prior.get('ShowWhenRun') is not False:
        raise SystemExit('unexpected handoff mode')
    def literal(s):
        return {'Value':{'string':s},'WFSerializationType':'WFTextTokenString'}
    raw={'WFSerializationType':'WFTextTokenString','Value':{'string':'\ufffc','attachmentsByRange':{'{0, 1}':copy.deepcopy(attachment)}}}
    packet={'source':literal('journal'),'captureId':literal('journal:auto'),'routeMode':literal('raw-only'),'rawText':raw}
    dictionary_id=str(uuid.uuid4()).upper()
    dictionary={'WFWorkflowActionIdentifier':'is.workflow.actions.dictionary','WFWorkflowActionParameters':{
        'UUID':dictionary_id,'CustomOutputName':'journalClarityPacket','WFItems':{'Value':{'WFDictionaryFieldValueItems':[
        {'WFItemType':0,'WFKey':literal(k),'WFValue':v} for k,v in packet.items()]},'WFSerializationType':'WFDictionaryFieldValue'}}}
    runner=copy.deepcopy(actions[idx])
    runner['WFWorkflowActionIdentifier']='dk.simonbs.Scriptable.ParameterizedRunScriptIntent'
    p=runner['WFWorkflowActionParameters'];del p['script'];p['fileName']='YOS Clarity Inbox Bridge'
    p['parameter']={'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'ActionOutput','OutputUUID':dictionary_id,'OutputName':'journalClarityPacket'}}
    actions[idx:idx+1]=[dictionary,runner]
    encoded=plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False)
    read=plistlib.loads(encoded)
    check=read['WFWorkflowActions'];old=original['WFWorkflowActions']
    assert check[:idx]==old[:idx] and check[idx+2:]==old[idx+1:]
    assert all(read[k]==v for k,v in original.items() if k!='WFWorkflowActions')
    assert check[idx]==dictionary and check[idx+1]==runner
    assert check[idx]['WFWorkflowActionParameters']['WFItems']['Value']['WFDictionaryFieldValueItems'][-1]['WFValue']==raw
    assert 'script' not in check[idx+1]['WFWorkflowActionParameters']
    path.write_bytes(encoded)
    assert plistlib.loads(path.read_bytes())==read
    print('JOURNAL -> existing Clarity Bridge named action PASS (unsigned)')

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('shortcut',type=Path)
    ap.add_argument('--script',type=Path)
    ap.add_argument('--convert-to-clarity',action='store_true')
    ap.add_argument('--diagnostic',type=Path)
    ap.add_argument('--recovery',type=Path)
    a=ap.parse_args()
    if a.convert_to_clarity:
        if a.script or a.diagnostic or a.recovery:ap.error('conversion must follow original validation')
        convert_to_clarity(a.shortcut)
        raise SystemExit(0)
    if not a.script:ap.error('--script is required for original patch')
    patch(a.shortcut,a.script)
    if a.diagnostic:diagnostic(a.shortcut,a.diagnostic)
    if a.recovery:recovery(a.shortcut,a.recovery)
