#!/usr/bin/env python3
import plistlib, uuid
from pathlib import Path

base=Path(__file__).parent
script=(base/"YOS_Home.js").read_text(encoding="utf-8")

root={
  "WFWorkflowActions":[{
    "WFWorkflowActionIdentifier":"dk.simonbs.Scriptable.RunScriptInlineIntent",
    "WFWorkflowActionParameters":{
      "script":script,
      "parameter":{
        "Value":{"VariableName":"ShortcutInput","Type":"ExtensionInput"},
        "WFSerializationType":"WFTextTokenAttachment"
      },
      "ShowWhenRun":False,
      "runInApp":False,
      "UUID":str(uuid.uuid4()).upper()
    }
  }],
  "WFWorkflowClientVersion":"4033.0.4.3",
  "WFWorkflowIcon":{"WFWorkflowIconGlyphNumber":59511,"WFWorkflowIconStartColor":3679049983},
  "WFWorkflowImportQuestions":[],
  "WFWorkflowInputContentItemClasses":[
    "WFGenericFileContentItem","WFImageContentItem","WFiTunesProductContentItem",
    "WFArticleContentItem","WFDateContentItem","WFFolderContentItem","WFPDFContentItem",
    "WFStringContentItem","WFDictionaryContentItem","WFNumberContentItem",
    "WFAppStoreAppContentItem","WFContactContentItem","WFAVAssetContentItem",
    "WFSafariWebPageContentItem","WFLocationContentItem","WFDCMapsLinkContentItem",
    "WFPhoneNumberContentItem","WFRichTextContentItem","WFURLContentItem",
    "WFEmailAddressContentItem"
  ],
  "WFWorkflowMinimumClientVersion":900,
  "WFWorkflowMinimumClientVersionString":"900",
  "WFWorkflowHasShortcutInputVariables":True,
  "WFWorkflowName":"YOS_Home"
}
out=base/"artifacts"/"YOS_Home-unsigned.shortcut"
out.parent.mkdir(parents=True,exist_ok=True)
out.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_BINARY,sort_keys=False))
print(out)
