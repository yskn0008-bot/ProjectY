"""Build a secret-free OCR entry reusing Voice action 648's inline save route."""
from pathlib import Path
import plistlib,uuid
ROOT=Path(__file__).resolve().parent
NAME='スクショ受信'
def ref(i,name):return {'Value':{'OutputUUID':i,'Type':'ActionOutput','OutputName':name},'WFSerializationType':'WFTextTokenAttachment'}
def build():
 actions=[]
 def add(ident,**params):
  ident=ident if '.' in ident and not ident.startswith('detect.') else 'is.workflow.actions.'+ident
  uid=str(uuid.uuid4()).upper();params['UUID']=uid
  actions.append({'WFWorkflowActionIdentifier':ident,'WFWorkflowActionParameters':params});return uid
 inp={'Value':{'Type':'ExtensionInput'},'WFSerializationType':'WFTextTokenAttachment'}
 image=add('is.workflow.actions.detect.images',WFInput=inp)
 count=add('is.workflow.actions.count',Input=ref(image,'Images'),WFCountType='Items')
 group=str(uuid.uuid4()).upper()
 add('is.workflow.actions.conditional',WFControlFlowMode=0,GroupingIdentifier=group,WFInput=ref(count,'Count'),WFCondition=4,WFNumberValue=1)
 ocr=add('is.workflow.actions.extracttextfromimage',WFImage=ref(image,'Images'))
 add('dk.simonbs.Scriptable.RunScriptInlineIntent',script=(ROOT/'inbox-inline.js').read_text(),parameter=ref(ocr,'Text from Image'),runInApp=False,ShowWhenRun=False)
 add('is.workflow.actions.conditional',WFControlFlowMode=1,GroupingIdentifier=group)
 add('is.workflow.actions.alert',WFAlertActionTitle='YOS｜画像入力を確認',WFAlertActionMessage='撮影したスクショ画像を1枚渡してください。最新の写真やクリップボードは取得しません。',WFAlertActionCancelButtonShown=False)
 add('is.workflow.actions.conditional',WFControlFlowMode=2,GroupingIdentifier=group)
 return {'WFWorkflowName':NAME,'WFWorkflowMinimumClientVersion':3010,'WFWorkflowClientVersion':'5114.0.8.3','WFWorkflowMinimumClientVersionString':'3010','WFWorkflowIcon':{'WFWorkflowIconStartColor':3679049983,'WFWorkflowIconGlyphNumber':59511},'WFWorkflowInputContentItemClasses':['WFImageContentItem'],'WFWorkflowTypes':['WFWorkflowTypeShowInSearch','ActionExtension'],'WFWorkflowHasShortcutInputVariables':True,'WFWorkflowImportQuestions':[],'WFWorkflowActions':actions}
if __name__=='__main__':
 out=ROOT/'artifacts';out.mkdir(exist_ok=True)
 (out/'Screenshot_Intake.plist').write_bytes(plistlib.dumps(build(),fmt=plistlib.FMT_XML,sort_keys=False))
 print('Built secret-free OCR Shortcut: 8 actions, original image never transmitted')
