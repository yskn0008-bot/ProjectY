#!/usr/bin/env python3
import plistlib
from pathlib import Path

base=Path(__file__).parent
script=(base/"YOS_Home.js").read_text(encoding="utf-8")

root={
  "WFWorkflowMinimumClientVersionString":"900",
  "WFWorkflowMinimumClientVersion":900,
  "WFWorkflowIcon":{
    "WFWorkflowIconStartColor":3679049983,
    "WFWorkflowIconGlyphNumber":61440,
  },
  "WFWorkflowClientVersion":"5037.109",
  "WFWorkflowOutputContentItemClasses":[],
  "WFWorkflowHasOutputFallback":False,
  "WFWorkflowInputContentItemClasses":["WFStringContentItem"],
  "WFWorkflowImportQuestions":[],
  "WFWorkflowTypes":["Watch"],
  "WFQuickActionSurfaces":[],
  "WFWorkflowHasShortcutInputVariables":False,
  "WFWorkflowActions":[
    {
      "WFWorkflowActionIdentifier":"dk.simonbs.Scriptable.RunScriptInlineIntent",
      "WFWorkflowActionParameters":{
        "script":{
          "Value":{"string":script},
          "WFSerializationType":"WFTextTokenString",
        },
        "runInApp":False,
        "ShowWhenRun":False,
      },
    }
  ],
}

out=base/"artifacts"/"YOS_Home-unsigned.shortcut"
out.parent.mkdir(parents=True,exist_ok=True)
out.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_BINARY,sort_keys=False))
print(out)
