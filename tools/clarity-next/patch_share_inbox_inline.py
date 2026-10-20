#!/usr/bin/env python3
"""Inject the local Scriptable bridge used only by Clarity Share.

The Shortcut carries no Notion secret. The bridge reuses the existing
YOS_NOTION_INTEGRATION_TOKEN stored in Scriptable Keychain and appends only to
the existing YOS Inbox page. Shared content is never interpreted as a command.
"""
from __future__ import annotations

import argparse
import plistlib
from pathlib import Path

ACTION_ID = "dk.simonbs.Scriptable.RunScriptInlineIntent"
PLACEHOLDER = "__YOS_SHARE_INBOX_INLINE__"
INBOX_PAGE_ID = "3d35ca88-2895-81ef-9dc8-d5f11ff8e213"
TOKEN_KEY = "YOS_NOTION_INTEGRATION_TOKEN"

BRIDGE_SCRIPT = r'''const K='YOS_NOTION_INTEGRATION_TOKEN';
const API='https://api.notion.com/v1';
const VER='2025-09-03';
const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const MAX_CHARS=48000;
const CHUNK_CHARS=1800;

function parse(q){
  const out={};
  for(const part of String(q||'').split('&')){
    if(!part)continue;
    const i=part.indexOf('=');
    const k=i<0?part:part.slice(0,i);
    const v=i<0?'':part.slice(i+1);
    out[decodeURIComponent(k)]=decodeURIComponent(v.replace(/\+/g,' '));
  }
  return out;
}

function fingerprint(value){
  const s=String(value||'');
  let a=0x811c9dc5>>>0;
  let b=0x9e3779b9>>>0;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    a=Math.imul((a^c)>>>0,0x01000193)>>>0;
    b=Math.imul((b+c)>>>0,0x85ebca6b)>>>0;
    b=(b^(b>>>13))>>>0;
  }
  return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0')+'-'+s.length;
}

function richText(value){
  return [{type:'text',text:{content:String(value||'').slice(0,1900)}}];
}

function paragraph(value){
  return {object:'block',type:'paragraph',paragraph:{rich_text:richText(value)}};
}

function splitChunks(value,size){
  const s=String(value||'');
  const out=[];
  for(let i=0;i<s.length;i+=size)out.push(s.slice(i,i+size));
  return out;
}

async function notion(path,method='GET',body){
  const request=new Request(API+path);
  request.method=method;
  request.headers={
    'Authorization':'Bearer '+Keychain.get(K),
    'Notion-Version':VER,
    'Content-Type':'application/json'
  };
  if(body!==undefined)request.body=JSON.stringify(body);
  const response=await request.loadJSON();
  const status=Number(request.response?.statusCode||0);
  if(status<200||status>=300){
    throw new Error('NOTION_'+status+':'+JSON.stringify(response).slice(0,180));
  }
  return response;
}

async function main(){
  const p=parse((args.plainTexts||[])[0]||'');
  const source=String(p.source||'text').trim().toLowerCase();
  const raw=String(p.raw||'').replace(/\r\n?/g,'\n');
  if(!raw.trim())return 'ERROR:EMPTY_INPUT';
  if(!['text','image','pdf'].includes(source))return 'ERROR:UNSUPPORTED_SOURCE';
  if(!Keychain.contains(K))return 'ERROR:NOTION_TOKEN_MISSING';

  const normalized=raw.trim();
  const fp=fingerprint(source+'\n'+normalized);
  const dedupeKey='share:'+fp;
  const fm=FileManager.local();
  const statePath=fm.joinPath(fm.documentsDirectory(),'yos-clarity-notion-bridge.json');
  let state={};
  try{
    if(fm.fileExists(statePath))state=JSON.parse(fm.readString(statePath)||'{}');
  }catch{
    state={};
  }
  if(state[dedupeKey])return 'DUPLICATE:'+fp;

  const truncated=normalized.length>MAX_CHARS;
  const body=truncated?normalized.slice(0,MAX_CHARS):normalized;
  const now=new Date().toISOString();
  const children=[
    paragraph(now+' · Clarity Share · '+dedupeKey+' · source='+source),
    ...splitChunks(body,CHUNK_CHARS).map(paragraph)
  ];
  if(truncated){
    children.push(paragraph('[Clarity Share: 48,000文字を超えたため末尾を省略]'));
  }
  children.push(paragraph('---'));

  await notion('/blocks/'+INBOX+'/children','PATCH',{children});

  state[dedupeKey]={at:now,source,truncated};
  const shareKeys=Object.keys(state).filter(k=>k.startsWith('share:'));
  if(shareKeys.length>300){
    for(const k of shareKeys.slice(0,shareKeys.length-300))delete state[k];
  }
  fm.writeString(statePath,JSON.stringify(state));
  return (truncated?'OK_TRUNCATED:':'OK:')+fp;
}

let result='ERROR:UNKNOWN';
try{
  result=await main();
}catch(error){
  const message=String(error?.message||error||'UNKNOWN').replace(/[\r\n]+/g,' ').slice(0,220);
  result='ERROR:'+message;
}
Script.setShortcutOutput(result);
Script.complete();'''


def _plain_script(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        inner = value.get("Value")
        if isinstance(inner, dict):
            return inner.get("string")
    return None


def patch(path: Path) -> None:
    root = plistlib.loads(path.read_bytes())
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
        if _plain_script(params.get("script")) == PLACEHOLDER:
            matches.append(params)

    if len(matches) != 1:
        raise SystemExit(f"expected one Share Inbox bridge placeholder, found {len(matches)}")

    matches[0]["script"] = {
        "Value": {"string": BRIDGE_SCRIPT},
        "WFSerializationType": "WFTextTokenString",
    }

    blob = repr(root)
    if PLACEHOLDER in blob:
        raise SystemExit("Share Inbox bridge placeholder survived injection")
    for required in (
        TOKEN_KEY,
        INBOX_PAGE_ID,
        "https://api.notion.com/v1",
        "share:",
        "DUPLICATE:",
        "OK_TRUNCATED:",
        "MAX_CHARS=48000",
    ):
        if required not in blob:
            raise SystemExit(f"Share Inbox runtime missing: {required}")
    for forbidden in (
        "project-y-yos-ai.vercel.app",
        "money-capture.html",
        "api.openai.com",
    ):
        if forbidden in blob:
            raise SystemExit(f"Share Inbox runtime has forbidden dependency: {forbidden}")

    path.write_bytes(plistlib.dumps(root, fmt=plistlib.FMT_XML, sort_keys=False))
    print("Clarity Share direct YOS Inbox bridge: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    patch(args.shortcut)
