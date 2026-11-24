#!/usr/bin/env python3
"""Build-stage patch for the existing Factory, not a separate signer/installer."""
import argparse
import pathlib
import plistlib
import re

INTENT = "dk.simonbs.Scriptable.RunScriptInlineIntent"

def public_script(root):
    lines=[]
    for name, file in (("publicQueryURL","discovery-core.mjs"),
                       ("parseEuropePmcSearch","discovery-adapters.mjs"),
                       ("extractArticleBody","discovery-adapters.mjs"),
                       ("collectPublicPapers","discovery-adapters.mjs")):
        rx=re.compile(r"^export ((?:async )?function "+name+r"\(.*)$")
        matches=[m.group(1) for line in (root/file).read_text().splitlines()
                 if (m:=rx.match(line))]
        if len(matches)!=1: raise ValueError("public source bundle mismatch: "+name)
        lines.extend(matches)
    script="\n".join(lines)+"\n"+(root/"preflight-public.js").read_text()
    if any(x in script for x in ("api.notion.com","Keychain","api.github.com","ShortcutInput")):
        # The comment may describe private ShortcutInput, but the source must not contain it.
        raise ValueError("public source contains private boundary")
    return script

def patch(path, root):
    wf=plistlib.loads(path.read_bytes())
    actions=wf["WFWorkflowActions"]
    inline=[(i,a["WFWorkflowActionParameters"]) for i,a in enumerate(actions)
            if a["WFWorkflowActionIdentifier"]==INTENT]
    models=[(i,a["WFWorkflowActionParameters"]) for i,a in enumerate(actions)
            if str(a["WFWorkflowActionIdentifier"]).endswith("askllm")]
    if len(inline)!=2 or len(models)!=1 or not inline[0][0]<models[0][0]<inline[1][0]:
        raise ValueError("unexpected stage order")
    model=models[0][1]
    if model.get("FollowUp") is not False or model.get("WFGenerativeResultType")!="Text":
        raise ValueError("unexpected model interaction")
    for (i,p),marker,script in zip(inline,("__YOS_DISCOVERY_PREFLIGHT_RESEARCH__","__YOS_DISCOVERY_PREFLIGHT_RECEIPT__"),
                                  (public_script(root),(root/"preflight-receipt.js").read_text())):
        if marker not in repr(p.get("script")) or p.get("runInApp") is not False or p.get("ShowWhenRun") is not False:
            raise ValueError("inline contract mismatch")
        if i==inline[0][0]:
            if p.get("parameter") not in ("",None): raise ValueError("research input not empty")
        else:
            prior=actions[i-1]
            pp=prior.get("WFWorkflowActionParameters",{})
            if prior.get("WFWorkflowActionIdentifier")!="is.workflow.actions.gettext" or not pp.get("UUID"):
                raise ValueError("model text output not materialized")
            p["parameter"]={"WFSerializationType":"WFTextTokenAttachment",
                            "Value":{"Type":"ActionOutput","OutputUUID":pp["UUID"],"OutputName":"modelText"}}
        p["script"]={"WFSerializationType":"WFTextTokenString","Value":{"string":script}}
    if "__YOS_DISCOVERY_PREFLIGHT_" in repr(wf):
        raise ValueError("placeholder survived")
    if any(a["WFWorkflowActionIdentifier"] in ("is.workflow.actions.alert","is.workflow.actions.showresult","is.workflow.actions.notification") for a in actions):
        raise ValueError("unexpected interactive output")
    raw=plistlib.dumps(wf,fmt=plistlib.FMT_XML,sort_keys=False)
    if plistlib.loads(raw)!=wf: raise ValueError("plist readback mismatch")
    path.write_bytes(raw)

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("shortcut",type=pathlib.Path)
    args=parser.parse_args()
    patch(args.shortcut,pathlib.Path(__file__).parent)
