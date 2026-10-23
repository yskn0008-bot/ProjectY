#!/usr/bin/env python3
"""Inject the Scriptable inline Notion bridge after Cherri compilation.

Cherri treats braces inside rawAction string literals as shortcut variable
references. Keep a harmless placeholder in the .cherri source, then replace
only that exact placeholder in the compiled plist.
"""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

ACTION_ID = "dk.simonbs.Scriptable.RunScriptInlineIntent"
PLACEHOLDER = "__YOS_NOTION_BRIDGE_INLINE__"
BRIDGE_SCRIPT = r'''const K='YOS_NOTION_INTEGRATION_TOKEN';
function parse(q){const o={};for(const part of String(q||'').split('&')){if(!part)continue;const i=part.indexOf('=');const k=i<0?part:part.slice(0,i);const v=i<0?'':part.slice(i+1);o[decodeURIComponent(k)]=decodeURIComponent(v.replace(/\+/g,' '));}return o;}
const p=parse((args.plainTexts||[])[0]||'');
if(!p.request_id||!p.target)throw new Error('Clarity Notion payload is incomplete');
if(!Keychain.contains(K))throw new Error('Notion token missing. Run YOS_Notion_Sync once.');
const API='https://api.notion.com/v1',VER='2025-09-03';
async function api(path,method='GET',body){const r=new Request(API+path);r.method=method;r.headers={'Authorization':'Bearer '+Keychain.get(K),'Notion-Version':VER,'Content-Type':'application/json'};if(body!==undefined)r.body=JSON.stringify(body);const j=await r.loadJSON();if(r.response.statusCode>=300)throw new Error('Notion '+r.response.statusCode+': '+JSON.stringify(j).slice(0,220));return j;}
const DS={task:'965c6086-32c1-463d-93b4-87a9cb69b3ad',shopping:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc',project:'9205e5b7-f8b9-4497-9d6f-4727d67e4866',life_event:'30df9a73-2ea7-4ff7-8187-2b62dc8f9da4',person:'829c91b0-08dc-4ab0-b8fd-b9725dd0d9d2',learning:'28bcd894-b709-4b23-9fdc-c9dc43043bfc',money:'95b30d16-7530-40c6-a320-dab99acad55d',balance:'94fc7e9f-fd20-4073-bbcf-02efe8e95c5c'};
const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const fm=FileManager.local(),statePath=fm.joinPath(fm.documentsDirectory(),'yos-clarity-notion-bridge.json');
function readState(){try{return fm.fileExists(statePath)?JSON.parse(fm.readString(statePath)||'{}'):{};}catch{return {};}}
function rt(s){return [{type:'text',text:{content:String(s||'').slice(0,1900)}}];}
function t(s){return {title:rt(s)};} function x(s){return {rich_text:rt(s)};}
async function main(){
 const state=readState();if(state[p.request_id])return 'DUPLICATE:'+p.target;
 const key='clarity:'+p.request_id,title=p.title||p.raw||'Clarity',raw=p.raw||title;
 if(p.target==='inbox'){await api('/blocks/'+INBOX+'/children','PATCH',{children:[{object:'block',type:'paragraph',paragraph:{rich_text:rt(new Date().toISOString()+' '+key+' '+raw)}}]});}
 else{
  const ds=DS[p.target];if(!ds)throw new Error('Unsupported Notion target: '+p.target);
  let props={};
  if(p.target==='task'){props={'やること':t(title),'同期キー':x(key),'種類':{select:{name:'Task'}},'状態':{select:{name:'次にやる'}},'正本・根拠':x('Clarity '+p.request_id)};if(p.date_time)props['期限']={date:{start:p.date_time}};}
  if(p.target==='shopping')props={'商品名':t(title),'メモ':x(raw)};
  if(p.target==='project')props={'案件名':t(title),'同期キー':x(key),'情報源':x('Clarity'),'次の一手':x(raw)};
  if(p.target==='life_event')props={'イベント名':t(title),'備考':x(raw),'記録キー':x(key)};
  if(p.target==='person')props={'人物・イベント':t(title),'元データ・根拠':x(raw)};
  if(p.target==='learning')props={'判断・経験':t(title),'根拠・参照':x(raw)};
  if(p.target==='money'){props={'項目':t(title),'原本ID':x(key),'メモ':x(raw),'確認元':x('Clarity')};const n=Number(String(p.amount||'').replace(/[^0-9.-]/g,''));if(Number.isFinite(n)&&String(p.amount||'').trim())props['金額']={number:n};if(['収入','支出','資金移動'].includes(p.kind))props['区分']={select:{name:p.kind}};if(p.date_time)props['日付']={date:{start:p.date_time}};}
  if(p.target==='balance'){props={'口座・資産':t(title),'原本':x('Clarity '+p.request_id),'注記':x(raw),'確認状況':{select:{name:'未確認'}}};const n=Number(String(p.amount||'').replace(/[^0-9.-]/g,''));if(Number.isFinite(n)&&String(p.amount||'').trim())props['金額']={number:n};}
  await api('/pages','POST',{parent:{type:'data_source_id',data_source_id:ds},properties:props});
 }
 state[p.request_id]={target:p.target,at:new Date().toISOString()};const keys=Object.keys(state);if(keys.length>200)for(const k of keys.slice(0,keys.length-200))delete state[k];fm.writeString(statePath,JSON.stringify(state));return 'OK:'+p.target;
}
const out=await main();Script.setShortcutOutput(out);Script.complete();'''


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    actions = root.get("WFWorkflowActions")
    if not isinstance(actions, list):
        raise SystemExit("WFWorkflowActions missing")

    matches = []
    for action in actions:
        if action.get("WFWorkflowActionIdentifier") != ACTION_ID:
            continue
        params = action.get("WFWorkflowActionParameters")
        if not isinstance(params, dict):
            continue
        if params.get("script") == PLACEHOLDER:
            matches.append(params)

    if len(matches) != 1:
        raise SystemExit(f"expected one Notion bridge placeholder, found {len(matches)}")

    matches[0]["script"] = BRIDGE_SCRIPT

    if PLACEHOLDER in repr(root):
        raise SystemExit("Notion bridge placeholder survived injection")
    if "YOS_NOTION_INTEGRATION_TOKEN" not in repr(root):
        raise SystemExit("Notion bridge token key missing after injection")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    print("Clarity Next Notion inline bridge injection: PASS")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("shortcut", type=Path)
    args = ap.parse_args()
    patch(args.shortcut)
