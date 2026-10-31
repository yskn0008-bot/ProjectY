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
function pending(v){return v===true||v===1||/^(yes|true|1|はい)$/i.test(String(v||''));}
function payload(v){
 if(typeof v==='string'){
  const s=v.trim();if(s.startsWith('{')){try{v=JSON.parse(s);}catch(_){throw new Error('Clarity Notion JSON payload is invalid');}}
  else return parse(s);
 }
 if(!v||typeof v!=='object'||Array.isArray(v))return {};
 if(Object.prototype.hasOwnProperty.call(v,'notionPending')&&!pending(v.notionPending))return {};
 return {request_id:v.request_id||v.requestId||v.notionRequestId||'',target:v.target||v.notionTarget||'',title:v.title||v.notionTitle||'',raw:v.raw||v.raw_text||v.notionRaw||'',date_time:v.date_time||v.dateTime||v.notionDateTime||'',amount:v.amount||v.notionAmount||'',kind:v.kind||v.notionKind||''};
}
const shortcutPayload=args.shortcutParameter;
const p=payload((args.plainTexts||[])[0]||shortcutPayload);
if(!p.request_id&&p.target&&p.raw){const day=new Date().toISOString().slice(0,10),seed=[p.target,p.raw,p.date_time,p.amount].join('|');let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}p.request_id='clarity-shortcut:'+day+':'+(h>>>0).toString(16).padStart(8,'0');}
if(!p.request_id||!p.target)throw new Error('Clarity Notion payload is incomplete');
if(!Keychain.contains(K))throw new Error('Notion token missing. Run YOS_Notion_Sync once.');
const API='https://api.notion.com/v1',VER='2025-09-03';
async function api(path,method='GET',body){const r=new Request(API+path);r.method=method;r.headers={'Authorization':'Bearer '+Keychain.get(K),'Notion-Version':VER,'Content-Type':'application/json'};if(body!==undefined)r.body=JSON.stringify(body);const j=await r.loadJSON();if(r.response.statusCode>=300)throw new Error('Notion '+r.response.statusCode+': '+JSON.stringify(j).slice(0,220));return j;}
const DS={task:'965c6086-32c1-463d-93b4-87a9cb69b3ad',shopping:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc',project:'9205e5b7-f8b9-4497-9d6f-4727d67e4866',life_event:'30df9a73-2ea7-4ff7-8187-2b62dc8f9da4',person:'829c91b0-08dc-4ab0-b8fd-b9725dd0d9d2',learning:'28bcd894-b709-4b23-9fdc-c9dc43043bfc',money:'95b30d16-7530-40c6-a320-dab99acad55d',balance:'94fc7e9f-fd20-4073-bbcf-02efe8e95c5c'};
const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const fm=FileManager.local(),statePath=fm.joinPath(fm.documentsDirectory(),'yos-clarity-notion-bridge.json');
function readState(){try{return fm.fileExists(statePath)?JSON.parse(fm.readString(statePath)||'{}'):{};}catch{return {};}}
function rt(s){const chars=Array.from(String(s||''));const out=[];for(let i=0;i<chars.length;i+=1800)out.push({type:'text',text:{content:chars.slice(i,i+1800).join('')}});if(out.length>100)throw new Error('Notion text exceeds the safe single-property limit');return out.length?out:[{type:'text',text:{content:''}}];}
function t(s){return {title:rt(s)};} function x(s){return {rich_text:rt(s)};}
// Day-bounded semantic retry key: a repeat of the same task text on a later day may be intentional.
function taskSyncKey(raw,when){const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');const norm=String(raw||'').normalize('NFKC').trim().replace(/\s+/g,' ')+'|'+String(when||'').trim();let h=2166136261;for(let i=0;i<norm.length;i++){h^=norm.charCodeAt(i);h=Math.imul(h,16777619);}return 'clarity:task:'+day+':'+(h>>>0).toString(16).padStart(8,'0');}
function captureSyncKey(target,raw,when,amount){if(target==='task')return taskSyncKey(raw,when);const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');const norm=[target,String(raw||'').normalize('NFKC').trim().replace(/\s+/g,' '),String(when||'').trim(),String(amount||'').trim()].join('|');let h=2166136261;for(let i=0;i<norm.length;i++){h^=norm.charCodeAt(i);h=Math.imul(h,16777619);}return 'clarity:'+target+':'+day+':'+(h>>>0).toString(16).padStart(8,'0');}
const KEY_FIELD={task:'同期キー',shopping:'メモ',project:'同期キー',life_event:'記録キー',person:'元データ・根拠',learning:'根拠・参照',money:'原本ID',balance:'原本'};
const TITLE_FIELD={task:'やること',shopping:'商品名',project:'案件名',life_event:'イベント名',person:'人物・イベント',learning:'判断・経験',money:'項目',balance:'口座・資産'};
async function findRecordByKey(ds,field,key,contains=false){const condition=contains?{contains:'[ClarityCapture:'+key+']'}:{equals:key};const r=await api('/data_sources/'+ds+'/query','POST',{filter:{property:field,rich_text:condition},page_size:2});const pages=r.results||[];if(pages.length>1)throw new Error('Multiple Notion records have the same Clarity capture key');return pages[0]?.id||null;}
async function findLegacyTitleMatch(target,ds,title,when){const field=TITLE_FIELD[target];if(!field||!title)return false;const filters=[{property:field,title:{equals:title}}];const dateField={task:'期限',money:'日付',balance:'確認日'}[target];if(dateField&&when)filters.push({property:dateField,date:{equals:when}});const filter=filters.length===1?filters[0]:{and:filters};const r=await api('/data_sources/'+ds+'/query','POST',{filter,page_size:2});const pages=r.results||[];if(pages.length>1)throw new Error('Multiple existing Notion records match this capture title; review required');return pages.length===1;}
function propertyText(property){return (property?.rich_text||property?.title||[]).map(v=>v.plain_text||v.text?.content||'').join('');}
async function verifyRecord(id,field,key,contains=false){const page=await api('/pages/'+id);const value=propertyText(page.properties?.[field]);if(contains?!value.includes('[ClarityCapture:'+key+']'):value!==key)throw new Error('Notion destination readback did not match capture key');}
function blockText(block){const data=block?.[block.type]||{};return (data.rich_text||[]).map(v=>v.plain_text||v.text?.content||'').join('');}
async function inboxContains(key){let cursor=null;do{const query='?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):'');const page=await api('/blocks/'+INBOX+'/children'+query);for(const block of page.results||[])if(blockText(block).includes('[ClarityCapture:'+key+']'))return true;cursor=page.has_more?page.next_cursor:null;if(page.has_more&&!cursor)throw new Error('Notion Inbox pagination cursor missing');}while(cursor);return false;}
async function ensureInboxCapture(target,key,raw){if(await inboxContains(key))return false;const line=new Date().toISOString()+' [ClarityCapture:'+key+'] ['+target+'] '+raw;await api('/blocks/'+INBOX+'/children','PATCH',{children:[{object:'block',type:'paragraph',paragraph:{rich_text:rt(line)}}]});return true;}
async function main(){
 const state=readState();if(state[p.request_id])return 'DUPLICATE:'+p.target;
 const title=p.title||p.raw||'Clarity',raw=p.raw||title,key=captureSyncKey(p.target,raw,p.date_time,p.amount);
 if(p.target==='inbox'){const added=await ensureInboxCapture(p.target,key,raw);state[p.request_id]={target:p.target,key,at:new Date().toISOString()};fm.writeString(statePath,JSON.stringify(state));return (added?'OK:':'DUPLICATE:')+'inbox';}
 const ds=DS[p.target],field=KEY_FIELD[p.target];if(!ds||!field)throw new Error('Unsupported Notion target: '+p.target);
 // Raw-first: require an Inbox capture before touching any long-term database.
 await ensureInboxCapture(p.target,key,raw);
 const fieldContains=!['task','project','life_event','money','balance'].includes(p.target);
 let pageId=await findRecordByKey(ds,field,key,fieldContains),duplicateTarget=Boolean(pageId);
 {
  let props={};
  if(p.target==='task'){props={'やること':t(title),'同期キー':x(key),'種類':{select:{name:'Task'}},'状態':{select:{name:'次にやる'}},'正本・根拠':x('Clarity '+p.request_id)};if(p.date_time)props['期限']={date:{start:p.date_time}};}
  if(p.target==='shopping')props={'商品名':t(title),'メモ':x(raw+'\n[ClarityCapture:'+key+']')};
  if(p.target==='project')props={'案件名':t(title),'同期キー':x(key),'情報源':x('Clarity'),'次の一手':x(raw)};
  if(p.target==='life_event')props={'イベント名':t(title),'備考':x(raw),'記録キー':x(key)};
  if(p.target==='person')props={'人物・イベント':t(title),'元データ・根拠':x(raw+'\n[ClarityCapture:'+key+']')};
  if(p.target==='learning')props={'判断・経験':t(title),'根拠・参照':x(raw+'\n[ClarityCapture:'+key+']')};
  if(p.target==='money'){props={'項目':t(title),'原本ID':x(key),'メモ':x(raw),'確認元':x('Clarity')};const n=Number(String(p.amount||'').replace(/[^0-9.-]/g,''));if(Number.isFinite(n)&&String(p.amount||'').trim())props['金額']={number:n};if(['収入','支出','資金移動'].includes(p.kind))props['区分']={select:{name:p.kind}};if(p.date_time)props['日付']={date:{start:p.date_time}};}
  if(p.target==='balance'){props={'口座・資産':t(title),'原本':x(key),'注記':x(raw),'確認状況':{select:{name:'未確認'}}};const n=Number(String(p.amount||'').replace(/[^0-9.-]/g,''));if(Number.isFinite(n)&&String(p.amount||'').trim())props['金額']={number:n};}
  if(!pageId){if(await findLegacyTitleMatch(p.target,ds,title,p.date_time))throw new Error('An existing Notion record has the same title; Inbox capture kept for review instead of creating a duplicate');const created=await api('/pages','POST',{parent:{type:'data_source_id',data_source_id:ds},properties:props});pageId=created.id;if(!pageId)throw new Error('Notion returned no destination page id');}
  await verifyRecord(pageId,field,key,fieldContains);
  }
 state[p.request_id]={target:p.target,key,at:new Date().toISOString()};const keys=Object.keys(state);if(keys.length>200)for(const k of keys.slice(0,keys.length-200))delete state[k];fm.writeString(statePath,JSON.stringify(state));return (duplicateTarget?'DUPLICATE:':'OK:')+p.target;
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
