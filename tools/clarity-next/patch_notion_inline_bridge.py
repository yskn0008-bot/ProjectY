#!/usr/bin/env python3
"""Inject the background Scriptable Notion bridge into compiled Clarity.

Cherri treats braces in inline JavaScript as Shortcut variables. The Cherri
source therefore contains one harmless placeholder which is replaced here
after compilation and before signing.
"""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

ACTION_ID = "dk.simonbs.Scriptable.RunScriptInlineIntent"
PLACEHOLDER = "__YOS_NOTION_BRIDGE_INLINE__"

BRIDGE_SCRIPT = r'''const K='YOS_NOTION_INTEGRATION_TOKEN';
const API='https://api.notion.com/v1';
const VER='2026-03-11';
const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const DS={
  task:'965c6086-32c1-463d-93b4-87a9cb69b3ad',
  shopping:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc',
  project:'9205e5b7-f8b9-4497-9d6f-4727d67e4866',
  life_event:'30df9a73-2ea7-4ff7-8187-2b62dc8f9da4',
  person:'829c91b0-08dc-4ab0-b8fd-b9725dd0d9d2',
  learning:'28bcd894-b709-4b23-9fdc-c9dc43043bfc',
  money:'95b30d16-7530-40c6-a320-dab99acad55d',
  balance:'94fc7e9f-fd20-4073-bbcf-02efe8e95c5c'
};
const MONEY_CATEGORIES=new Set(['住居','光熱','食費','日用品','車・交通','通信・サブスク','保険','税金・社会保険','貯金','返済','給与・事業収入','家賃収入','その他']);

function inputText(){
  const v=args.shortcutParameter;
  if(typeof v==='string') return v;
  if(Array.isArray(args.plainTexts)&&args.plainTexts.length) return String(args.plainTexts[0]||'');
  return v==null?'':String(v);
}
function parse(q){
  const out={};
  for(const part of String(q||'').split('&')){
    if(!part) continue;
    const i=part.indexOf('=');
    const k=i<0?part:part.slice(0,i);
    const v=i<0?'':part.slice(i+1);
    out[decodeURIComponent(k)]=decodeURIComponent(v.replace(/\+/g,' '));
  }
  return out;
}
function rt(v){return [{type:'text',text:{content:String(v||'').slice(0,1900)}}];}
function t(v){return {title:rt(v)};}
function x(v){return {rich_text:rt(v)};}
function num(v){
  const s=String(v||'').replace(/[¥￥,円\s]/g,'');
  if(!s) return null;
  const n=Number(s);
  return Number.isFinite(n)?Math.abs(n):null;
}
function iso(v){
  const raw=String(v||'').trim();
  if(!raw) return '';
  let s=raw
    .replace(/^(\\d{4})\\/(\\d{1,2})\\/(\\d{1,2})\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?$/,(_,y,m,d,h,mi,se)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${mi}:${se||'00'}+09:00`)
    .replace(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?$/,(_,y,m,d,h,mi,se)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${mi}:${se||'00'}+09:00`);
  const d=new Date(s);
  return Number.isNaN(d.getTime())?'':s;
}
async function api(path,method='GET',body){
  if(!Keychain.contains(K)) throw new Error('Notion token missing. Run YOS_Notion_Sync once.');
  const r=new Request(API+path);
  r.method=method;
  r.headers={'Authorization':'Bearer '+Keychain.get(K),'Notion-Version':VER,'Content-Type':'application/json'};
  if(body!==undefined) r.body=JSON.stringify(body);
  const text=await r.loadString();
  let j={}; try{j=text?JSON.parse(text):{};}catch{j={raw:text};}
  const status=r.response?r.response.statusCode:0;
  if(status<200||status>=300) throw new Error('Notion '+status+': '+String(j.message||text).slice(0,220));
  return j;
}
async function create(ds,properties){
  return api('/pages','POST',{parent:{type:'data_source_id',data_source_id:ds},properties});
}
async function inbox(raw,label,key){
  return api('/blocks/'+INBOX+'/children','PATCH',{children:[
    {object:'block',type:'paragraph',paragraph:{rich_text:rt(new Date().toISOString()+' · '+label+' · '+key)}},
    {object:'block',type:'paragraph',paragraph:{rich_text:rt(raw)}},
    {object:'block',type:'divider',divider:{}}
  ]});
}

const p=parse(inputText());
if(!p.request_id||!p.target||!p.raw) throw new Error('Clarity Notion payload is incomplete');
const fm=FileManager.local();
const statePath=fm.joinPath(fm.documentsDirectory(),'yos-clarity-notion-bridge.json');
let state={};
try{if(fm.fileExists(statePath)) state=JSON.parse(fm.readString(statePath)||'{}');}catch{state={};}
if(state[p.request_id]){Script.setShortcutOutput('DUPLICATE:'+p.target);Script.complete();return;}

const key='clarity:'+p.request_id;
const raw=p.raw;
const title=(p.title||raw||'Clarity').slice(0,180);
const date=iso(p.date_time);
const amount=num(p.amount);
let result;

if(p.target==='inbox'){
  result=await inbox(raw,p.kind==='idea'?'Idea':p.kind==='memo'?'Memo':'Clarity',key);
}else if(p.target==='task'){
  const props={
    'やること':t(title),'同期キー':x(key),'種類':{select:{name:'Task'}},
    '状態':{select:{name:'次にやる'}},'正本・根拠':x('Clarity: '+raw)
  };
  if(date) props['期限']={date:{start:date}};
  result=await create(DS.task,props);
}else if(p.target==='shopping'){
  result=await create(DS.shopping,{
    '商品名':t(title),'メモ':x(raw),'区分':{select:{name:'欲しいもの'}},
    '買い物状態':{select:{name:'検討中'}}
  });
}else if(p.target==='money'){
  if(amount===null||!date){
    result=await inbox('[家計・要照合]\n'+raw,'Clarity Money fallback',key);
  }else{
    const kind=['収入','支出','資金移動'].includes(p.kind)?p.kind:'支出';
    const certainty=['確認済','見込み','未確認'].includes(p.certainty)?p.certainty:'未確認';
    const props={
      '項目':t(title),'金額':{number:amount},'日付':{date:{start:date}},
      '区分':{select:{name:kind}},'状態':{select:{name:certainty==='見込み'?'予定':'実績'}},
      '確度':{select:{name:certainty}},'原本ID':x(key),'確認元':x('Clarity'),'メモ':x(raw)
    };
    if(p.category&&MONEY_CATEGORIES.has(p.category)) props['分類']={select:{name:p.category}};
    if(p.account) props['支払元']=x(p.account);
    result=await create(DS.money,props);
  }
}else if(p.target==='balance'){
  if(amount===null){
    result=await inbox('[残高・要照合]\n'+raw,'Clarity Balance fallback',key);
  }else{
    const props={'口座・資産':t(title),'金額':{number:amount},'原本':x('Clarity '+key),'注記':x(raw),'確認状況':{select:{name:'未確認'}}};
    if(date) props['確認日']={date:{start:date}};
    result=await create(DS.balance,props);
  }
}else if(p.target==='project'){
  result=await create(DS.project,{'案件名':t(title),'同期キー':x(key),'情報源':x('Clarity'),'次の一手':x(raw),'事実の確度':{select:{name:'未確認'}}});
}else if(p.target==='life_event'){
  const props={'イベント名':t(title),'備考':x(raw),'記録キー':x(key),'取得元':{select:{name:'Clarity'}}};
  if(date) props['発生日時']={date:{start:date}};
  result=await create(DS.life_event,props);
}else if(p.target==='person'){
  result=await create(DS.person,{'人物・イベント':t(title),'元データ・根拠':x(raw),'事実の確度':{select:{name:'未確認'}}});
}else if(p.target==='learning'){
  const props={'判断・経験':t(title),'本人の決定':x(raw),'根拠・参照':x('Clarity'),'状態':{select:{name:'実行中'}}};
  if(date) props['判断日']={date:{start:date}};
  result=await create(DS.learning,props);
}else{
  throw new Error('Unsupported Notion target: '+p.target);
}

state[p.request_id]={target:p.target,at:new Date().toISOString()};
const keys=Object.keys(state);
if(keys.length>200) for(const k of keys.slice(0,keys.length-200)) delete state[k];
fm.writeString(statePath,JSON.stringify(state));
Script.setShortcutOutput(result&&result.id?'OK:'+p.target:'OK:'+p.target);
Script.complete();'''


def patch(path: Path) -> None:
    with path.open("rb") as fh:
        root = plistlib.load(fh)

    matches = []
    for action in root.get("WFWorkflowActions", []):
        if action.get("WFWorkflowActionIdentifier") != ACTION_ID:
            continue
        params = action.get("WFWorkflowActionParameters", {})
        if params.get("script") == PLACEHOLDER:
            matches.append(params)

    if len(matches) != 1:
        raise SystemExit(f"expected one Notion bridge placeholder, found {len(matches)}")

    params = matches[0]
    params["script"] = {
        "Value": {"string": BRIDGE_SCRIPT},
        "WFSerializationType": "WFTextTokenString",
    }

    blob = repr(root)
    if PLACEHOLDER in blob:
        raise SystemExit("Notion bridge placeholder survived injection")
    if "YOS_NOTION_INTEGRATION_TOKEN" not in blob:
        raise SystemExit("Notion Keychain key missing")
    if "YOS_Money_Local" in blob:
        raise SystemExit("legacy YOS_Money_Local route survived")

    with path.open("wb") as fh:
        plistlib.dump(root, fh, fmt=plistlib.FMT_XML, sort_keys=False)

    print("Clarity full Notion inline bridge injection: PASS")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("shortcut", type=Path)
    args = ap.parse_args()
    patch(args.shortcut)
