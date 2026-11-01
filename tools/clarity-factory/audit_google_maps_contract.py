"""Offline Google Maps directions contract check for private decoded Shortcut plist.
Never upload the user's original workflow or credentials.
"""
import plistlib

BASE = "https://www.google.com/maps/dir/?api=1&destination="
SUFFIX = "&travelmode=driving&dir_action=navigate"
TRIPLET = ("is.workflow.actions.urlencode", "is.workflow.actions.gettext", "is.workflow.actions.openurl")


def _output(value):
    if not isinstance(value, dict) or value.get("WFSerializationType") != "WFTextTokenAttachment":
        raise ValueError("Expected workflow action output token")
    ref = value.get("Value")
    if not isinstance(ref, dict) or ref.get("Type") != "ActionOutput":
        raise ValueError("Expected a direct action output reference")
    return ref


def audit_navigation(raw: bytes):
    if raw.startswith(b"AEA1"):
        raise ValueError("Signed workflow must be decoded offline")
    doc = plistlib.loads(raw)
    actions = doc.get("WFWorkflowActions") if isinstance(doc, dict) else None
    if not isinstance(actions, list):
        raise ValueError("Invalid workflow")
    candidates = [i for i in range(len(actions)-2)
        if tuple(x["WFWorkflowActionIdentifier"] for x in actions[i:i+3]) == TRIPLET
        and actions[i+1].get("WFWorkflowActionParameters",{}).get("CustomOutputName") == "yosNavDirectionsURL"]
    if len(candidates) != 1:
        raise ValueError("Expected one navigation URL triplet")
    i = candidates[0]
    enc, url, opener = [a["WFWorkflowActionParameters"] for a in actions[i:i+3]]
    if enc.get("WFEncodeMode") != "Encode" or enc.get("CustomOutputName") != "yosNavDestinationEncoded":
        raise ValueError("Destination not encoded")
    from_ = _output(enc.get("WFInput"))
    if from_.get("OutputName") != "destination" or not from_.get("OutputUUID"):
        raise ValueError("Unexpected source for destination")
    # Prove destination came from parameters.destination rather than an arbitrary action.
    upstream = [(j,a["WFWorkflowActionParameters"]) for j,a in enumerate(actions[:i])
                if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.gettext"
                and a["WFWorkflowActionParameters"].get("UUID") == from_["OutputUUID"]
                and a["WFWorkflowActionParameters"].get("CustomOutputName") == "destination"]
    if len(upstream) != 1:
        raise ValueError("Destination text action not found")
    source_index, source_action = upstream[0]
    source_text = source_action.get("WFTextActionText", {})
    source_val = source_text.get("Value", {})
    source_token = source_val.get("attachmentsByRange", {}).get("{0, 1}", {})
    if source_text.get("WFSerializationType") != "WFTextTokenString" or source_val.get("string") != "\ufffc":
        raise ValueError("Destination text is not a token")
    if (source_token.get("Type") != "ActionOutput" or source_token.get("OutputName") != "parameters"
        or source_token.get("Aggrandizements") != [
            {"Type": "WFDictionaryValueVariableAggrandizement", "DictionaryKey": "destination"}]):
        raise ValueError("Destination not extracted from parameters.destination")
    model_dict = [a for a in actions[:source_index]
                  if a["WFWorkflowActionIdentifier"] == "is.workflow.actions.detect.dictionary"
                  and a["WFWorkflowActionParameters"].get("UUID") == source_token.get("OutputUUID")
                  and a["WFWorkflowActionParameters"].get("CustomOutputName") == "parameters"]
    if len(model_dict) != 1:
        raise ValueError("Upstream parameters dictionary not found")
    enc_id, url_id = enc.get("UUID"), url.get("UUID")
    if not enc_id or not url_id:
        raise ValueError("Missing output UUID")
    token = url.get("WFTextActionText", {})
    value = token.get("Value", {})
    if token.get("WFSerializationType") != "WFTextTokenString" or value.get("string") != BASE+"\ufffc"+SUFFIX:
        raise ValueError("Google Maps URL is not exact")
    if value.get("attachmentsByRange") != {
        f"{{{len(BASE)}, 1}}": {"Type": "ActionOutput", "OutputUUID": enc_id, "OutputName": "yosNavDestinationEncoded"}
    }:
        raise ValueError("URL token not linked to encoded destination")
    ref = _output(opener.get("WFInput"))
    if ref.get("OutputUUID") != url_id or ref.get("OutputName") != "yosNavDirectionsURL":
        raise ValueError("Open URLs output reference incorrect")
    if any(a["WFWorkflowActionIdentifier"] == "is.workflow.actions.searchmaps" for a in actions):
        raise ValueError("Old Search Maps action remains")
    return {"navigation_actions_1based":[i+1,i+2,i+3],
            "destination_and_google_url_verified":True,
            "iphone_tested":False}
