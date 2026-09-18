#!/usr/bin/env python3
"""Validate data/yos-assets.json. Python stdlib only."""
from __future__ import annotations
import json, sys
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "yos-assets.json"
REQUIRED = {
    "id","name","area","status","progress","current","next_action","priority",
    "blocker","needs_user_action","device_verified","production_verified",
    "updated_at","deep_link","completion_criteria","evidence","progress_basis",
}
STAGES=("spec","implementation","test","device","production")
STATUSES={"planned","building","awaiting_device_verification",
          "awaiting_production_verification","blocked","complete"}

def main() -> int:
    errors=[]
    def err(x): errors.append(x)
    try:
        data=json.loads(DATA.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"FAIL: cannot load {DATA}: {exc}", file=sys.stderr); return 1

    weights=data.get("progress_model",{}).get("weights",{})
    if set(weights)!=set(STAGES): err(f"weights must define exactly {STAGES}")
    if sum(weights.get(x,0) for x in STAGES)!=100: err("weights must total 100")

    assets=data.get("assets")
    if not isinstance(assets,list): err("assets must be a list"); assets=[]
    if len(assets)!=22: err(f"expected 22 assets, got {len(assets)}")

    ids=set(); names=set(); progresses=[]; user_actions=0
    for i,a in enumerate(assets):
        if not isinstance(a,dict): err(f"index:{i}: asset must be object"); continue
        label=a.get("id",f"index:{i}")
        missing=REQUIRED-set(a)
        if missing: err(f"{label}: missing {sorted(missing)}")
        if not isinstance(a.get("id"),str) or not a["id"]: err(f"{label}: invalid id")
        elif a["id"] in ids: err(f"{label}: duplicate id")
        else: ids.add(a["id"])
        if not isinstance(a.get("name"),str) or not a["name"]: err(f"{label}: invalid name")
        elif a["name"] in names: err(f"{label}: duplicate name")
        else: names.add(a["name"])
        if a.get("status") not in STATUSES: err(f"{label}: invalid status")
        if not isinstance(a.get("priority"),int) or not 1<=a.get("priority",0)<=5: err(f"{label}: priority must be 1..5")
        if not isinstance(a.get("needs_user_action"),bool): err(f"{label}: needs_user_action must be bool")
        elif a["needs_user_action"]: user_actions+=1
        if not isinstance(a.get("device_verified"),bool): err(f"{label}: device_verified must be bool")
        if not isinstance(a.get("production_verified"),bool): err(f"{label}: production_verified must be bool")
        if a.get("deep_link") is not None and not isinstance(a.get("deep_link"),str): err(f"{label}: deep_link must be string/null")
        if not isinstance(a.get("completion_criteria"),list) or not a["completion_criteria"]: err(f"{label}: completion_criteria required")
        evidence=a.get("evidence")
        if not isinstance(evidence,list) or not evidence or not all(isinstance(x,str) and x for x in evidence):
            err(f"{label}: evidence must be a non-empty string list")
        basis=a.get("progress_basis")
        if not isinstance(basis,dict) or set(basis)!=set(STAGES) or not all(isinstance(basis.get(x),bool) for x in STAGES):
            err(f"{label}: invalid progress_basis"); continue
        if any(basis[x] for x in ("spec","implementation","test")) and not evidence:
            err(f"{label}: verified work requires evidence")
        if basis["device"] and not any(x.startswith("device:") for x in evidence):
            err(f"{label}: device verification requires device: evidence")
        if basis["production"] and not any(x.startswith("production:") for x in evidence):
            err(f"{label}: production verification requires production: evidence")
        computed=sum(weights.get(x,0) for x in STAGES if basis[x])
        if a.get("device_verified")!=basis["device"]: err(f"{label}: device flag mismatch")
        if a.get("production_verified")!=basis["production"]: err(f"{label}: production flag mismatch")
        if a.get("progress")!=computed: err(f"{label}: progress={a.get('progress')} computed={computed}")
        progresses.append(computed)
        if a.get("status")=="complete" and (computed!=100 or not basis["device"] or not basis["production"]):
            err(f"{label}: complete requires all 5 verified")
        if computed==100 and a.get("status")!="complete": err(f"{label}: 100% requires complete status")

    overall=round(sum(progresses)/len(progresses)) if progresses else 0
    s=data.get("summary",{})
    if s.get("asset_count")!=len(assets): err("summary.asset_count mismatch")
    if s.get("overall_progress")!=overall: err(f"summary.overall_progress must be {overall}")
    if s.get("needs_user_action_count")!=user_actions: err("summary.needs_user_action_count mismatch")
    if errors:
        print("YOS asset SSOT validation FAILED")
        for x in errors: print(f"- {x}")
        return 1
    print(f"YOS asset SSOT validation OK: {len(assets)} assets, overall={overall}%, needs_user_action={user_actions}")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
