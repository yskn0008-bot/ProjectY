#!/usr/bin/env python3
from __future__ import annotations
import plistlib, sys, uuid
from pathlib import Path

START_MARKER="YOS_MONEY_LOCAL_BRIDGE_START"
RESTORE_MARKER="YOS_MONEY_LOCAL_BRIDGE_RESTORE"

LOCAL_SCRIPT=r'''const CLIP_KEY='yos-money-alert-clipboard-backup-v1';
const fm=FileManager.iCloud();
const root=fm.documentsDirectory();
const moneyPath=fm.joinPath(root,'YOS/Money/money.json');
const oldClip=Pasteboard.pasteString();
try{Keychain.set(CLIP_KEY,JSON.stringify({value:oldClip??''}));}catch{}

const clean=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const finite=v=>v===null||v===undefined||String(v).trim()===''?null:(Number.isFinite(Number(v))?Number(v):null);
const yen=v=>finite(v)===null?'':Math.round(Number(v)).toLocaleString('ja-JP')+'円';
function isoDate(d=new Date()){
  const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get=t=>parts.find(x=>x.type===t)?.value||'';
  return get('year')+'-'+get('month')+'-'+get('day');
}
function dateObj(s){const d=new Date(String(s||'')+'T12:00:00+09:00');return Number.isNaN(d.getTime())?null:d}
function daysBetween(a,b){return Math.ceil((b.getTime()-a.getTime())/86400000)}
function monthAfter(mk,delta){const [y,m]=mk.split('-').map(Number),d=new Date(y,m-1+delta,1,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function endOfMonthDay(y,m){return new Date(y,m,0).getDate()}
function nthWeekdayOfMonth(year,month,weekday,n){const first=new Date(year,month-1,1,12),firstWd=first.getDay();return 1+((7+weekday-firstWd)%7)+(n-1)*7}
function vernalEquinoxDay(year){if(year<=1979)return Math.floor(20.8357+0.242194*(year-1980)-Math.floor((year-1983)/4));if(year<=2099)return Math.floor(20.8431+0.242194*(year-1980)-Math.floor((year-1980)/4));return 20}
function autumnEquinoxDay(year){if(year<=1979)return Math.floor(23.2588+0.242194*(year-1980)-Math.floor((year-1983)/4));if(year<=2099)return Math.floor(23.2488+0.242194*(year-1980)-Math.floor((year-1980)/4));return 23}
function jpHolidaySet(year){
  const raw=new Set(),add=(m,d)=>raw.add(year+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'));
  add(1,1);if(year>=2000)add(1,nthWeekdayOfMonth(year,1,1,2));else add(1,15);
  add(2,11);if(year>=2020)add(2,23);add(3,vernalEquinoxDay(year));add(4,29);add(5,3);add(5,4);add(5,5);
  if(year>=2003)add(7,nthWeekdayOfMonth(year,7,1,3));else if(year>=1996)add(7,20);
  if(year>=2016)add(8,11);if(year>=2003)add(9,nthWeekdayOfMonth(year,9,1,3));else add(9,15);
  add(9,autumnEquinoxDay(year));if(year>=2000)add(10,nthWeekdayOfMonth(year,10,1,2));else add(10,10);add(11,3);add(11,23);
  if(year===2019){add(4,30);add(5,1);add(5,2);add(10,22)}
  if(year===2020){raw.delete(year+'-07-'+String(nthWeekdayOfMonth(year,7,1,3)).padStart(2,'0'));raw.delete(year+'-10-'+String(nthWeekdayOfMonth(year,10,1,2)).padStart(2,'0'));raw.delete(year+'-08-11');add(7,23);add(7,24);add(8,10)}
  if(year===2021){raw.delete(year+'-07-'+String(nthWeekdayOfMonth(year,7,1,3)).padStart(2,'0'));raw.delete(year+'-10-'+String(nthWeekdayOfMonth(year,10,1,2)).padStart(2,'0'));raw.delete(year+'-08-11');add(7,22);add(7,23);add(8,8)}
  const all=new Set(raw);let changed=true;
  while(changed){changed=false;for(let m=1;m<=12;m++){const last=endOfMonthDay(year,m);for(let d=2;d<last;d++){const cur=year+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');if(all.has(cur))continue;const dt=new Date(year,m-1,d,12);if(dt.getDay()===0||dt.getDay()===6)continue;const prev=new Date(year,m-1,d-1,12),next=new Date(year,m-1,d+1,12);const p=prev.getFullYear()+'-'+String(prev.getMonth()+1).padStart(2,'0')+'-'+String(prev.getDate()).padStart(2,'0'),n=next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-'+String(next.getDate()).padStart(2,'0');if(all.has(p)&&all.has(n)){all.add(cur);changed=true}}}}
  const sunday=[...all].filter(s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12).getDay()===0}).sort();
  for(const s of sunday){const [y,m,d]=s.split('-').map(Number);let dt=new Date(y,m-1,d+1,12);while(true){const key=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');if(!all.has(key)){all.add(key);break}dt.setDate(dt.getDate()+1)}}
  return all;
}
function isJpHoliday(date){const y=date.getFullYear(),key=y+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');return jpHolidaySet(y).has(key)}
function nextJpBusinessDate(dateString){const [y,m,d]=dateString.split('-').map(Number);let dt=new Date(y,m-1,d,12);while(dt.getDay()===0||dt.getDay()===6||isJpHoliday(dt))dt.setDate(dt.getDate()+1);return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')}
function isDone(tx){return tx?.status==='done'||tx?.paid===true||tx?.completed===true||tx?.received===true}
function knownAmount(tx){return tx?.amount!==null&&tx?.amount!==undefined&&Number.isFinite(Number(tx.amount))}
function outgoing(tx){return tx?.type==='expense'||tx?.type==='debt'}
function recurringOccurrences(data,startDate,monthsAhead=3){
  const out=[],startMk=startDate.slice(0,7);
  for(let off=0;off<=monthsAhead;off++){
    const mk=monthAfter(startMk,off),[y,m]=mk.split('-').map(Number),last=endOfMonthDay(y,m);
    for(const rule of (data.recurring||[])){
      if(rule.enabled===false)continue;
      if(rule.intervalMonths&&rule.anchorMonth){const a=rule.anchorMonth.split('-').map(Number),diff=(y-a[0])*12+(m-a[1]);if(diff<0||diff%Number(rule.intervalMonths)!==0)continue}
      const day=Math.min(last,Math.max(1,Number(rule.day)||1));let date=mk+'-'+String(day).padStart(2,'0');
      if(rule.businessDayRule==='next_jp_business_day')date=nextJpBusinessDate(date);
      if(date<startDate||(rule.startDate&&date<rule.startDate))continue;
      const duplicate=(data.transactions||[]).some(tx=>(tx.scheduledDate||tx.date)===date&&(tx.recurringId===rule.id||(tx.label===rule.label&&tx.type===rule.type)));
      if(duplicate)continue;
      out.push({id:'virtual-'+rule.id+'-'+date,recurringId:rule.id,virtual:true,date,type:rule.type,label:rule.label,amount:rule.variableAmount?null:rule.amount,variableAmount:Boolean(rule.variableAmount),lastKnownAmount:rule.lastKnownAmount??null,amountApproximate:Boolean(rule.amountApproximate),status:'planned'});
    }
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date)||String(a.label).localeCompare(String(b.label)));
}
function upcoming(data){
  const today=isoDate(),explicit=(data.transactions||[]).filter(tx=>!isDone(tx));
  const start=(data.recurring||[]).filter(r=>r.enabled!==false).reduce((d,r)=>r.startDate&&r.startDate<d?r.startDate:d,today);
  const months=Math.min(1200,Math.max(3,(Number(today.slice(0,4))-Number(start.slice(0,4)))*12+Number(today.slice(5,7))-Number(start.slice(5,7))+3));
  return [...explicit,...recurringOccurrences(data,start,months)].sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='income'?-1:b.type==='income'?1:String(a.label).localeCompare(String(b.label))));
}
function alertPayload(data){
  if(!data||data.schema!=='yos-money-local-v1')throw new Error('Money形式不一致');
  const balance=finite(data.balance?.amount);
  if(balance===null)return 'YOS_MONEY_ALERT_V1\n警告：Money Alertが現在残高を確認できません\n必要な対応：YOS Moneyで残高を確認してください';
  const list=upcoming(data),today=isoDate(),nextPayment=list.find(outgoing)||null,nextIncome=list.find(x=>x.type==='income')||null;
  const anchor=nextIncome?(nextIncome.date>today?nextIncome.date:today):today.slice(0,7)+'-'+String(endOfMonthDay(Number(today.slice(0,4)),Number(today.slice(5,7)))).padStart(2,'0');
  const required=list.filter(x=>x.date<=anchor&&outgoing(x));
  const unknownRequired=required.some(x=>!knownAmount(x));
  const requiredTotal=required.reduce((s,x)=>s+(knownAmount(x)?Number(x.amount):0),0);
  const shortage=!unknownRequired&&(balance-requiredTotal)<0;
  const shortfall=shortage?Math.abs(balance-requiredTotal):0;
  let daily=null;
  if(!unknownRequired){const a=dateObj(today),b=dateObj(anchor);if(a&&b)daily=Math.floor(Math.max(0,balance-requiredTotal)/Math.max(1,daysBetween(a,b)+1))}
  const spentToday=(data.transactions||[]).filter(tx=>outgoing(tx)&&String(tx?.date||'')===today&&isDone(tx)&&knownAmount(tx)).reduce((s,x)=>s+Number(x.amount),0);
  const over=daily!==null&&spentToday>daily?spentToday-daily:0;
  if(!shortage&&!over)return 'YOS_MONEY_ALERT_V1\n緊急Money Alertなし';
  const lines=['YOS_MONEY_ALERT_V1'];
  lines.push('現在残高：'+yen(balance));
  if(daily!==null)lines.push('今日使える金額：'+yen(daily));
  if(nextPayment)lines.push('次の支払い：'+nextPayment.date+' '+clean(nextPayment.label,80)+(knownAmount(nextPayment)?' '+yen(nextPayment.amount):' 金額未確定'));
  if(nextIncome)lines.push('次の入金：'+nextIncome.date+' '+clean(nextIncome.label,80)+(knownAmount(nextIncome)?' '+(nextIncome.amountApproximate?'約':'')+yen(nextIncome.amount):' 金額未確定'));
  if(shortage)lines.push('警告：次の入金までに資金不足の可能性 '+yen(shortfall));
  if(over)lines.push('警告：今日使える金額を超過 '+yen(over));
  return lines.join('\n');
}
let payload='YOS_MONEY_ALERT_V1\n警告：Money AlertがMoney正本を読み取れません\n必要な対応：YOS Moneyを一度開いてください';
try{
  if(!fm.fileExists(moneyPath))throw new Error('money.json not found');
  try{if(typeof fm.isFileStoredIniCloud==='function'&&fm.isFileStoredIniCloud(moneyPath))await fm.downloadFileFromiCloud(moneyPath)}catch{}
  const data=JSON.parse(fm.readString(moneyPath));
  payload=alertPayload(data);
}catch{}
Pasteboard.copyString(payload);
Script.complete();'''

RESTORE_SCRIPT=r'''const CLIP_KEY='yos-money-alert-clipboard-backup-v1';
try{
  if(Keychain.contains(CLIP_KEY)){
    const record=JSON.parse(Keychain.get(CLIP_KEY)||'{}');
    Pasteboard.copyString(typeof record.value==='string'?record.value:'');
    Keychain.remove(CLIP_KEY);
  }
}catch{}
Script.complete();'''

def fail(msg): raise SystemExit(msg)

def text_payload(action):
    value=action.get("WFWorkflowActionParameters",{}).get("WFTextActionText","")
    if isinstance(value,str): return value
    if isinstance(value,dict):
        p=value.get("Value",{})
        if isinstance(p,dict): return str(p.get("string",""))
    return ""

def uid(action):
    return str(action.get("WFWorkflowActionParameters",{}).get("UUID") or uuid.uuid4()).upper()

def inline_action(action, script):
    return {
      "WFWorkflowActionIdentifier":"dk.simonbs.Scriptable.RunScriptInlineIntent",
      "WFWorkflowActionParameters":{
        "UUID":uid(action),
        "script":script,
        "texts":{"Value":{"string":""},"WFSerializationType":"WFTextTokenString"},
        "runInApp":False,
        "ShowWhenRun":False,
      }
    }

def patch(path:Path):
    root=plistlib.loads(path.read_bytes())
    actions=root.get("WFWorkflowActions",[])
    hits={}
    for marker in (START_MARKER,RESTORE_MARKER):
        idx=[i for i,a in enumerate(actions)
             if a.get("WFWorkflowActionIdentifier")=="is.workflow.actions.gettext"
             and marker in text_payload(a)]
        if len(idx)!=1: fail(f"{marker}: expected one placeholder, found {len(idx)}")
        hits[marker]=idx[0]
    if hits[START_MARKER] >= hits[RESTORE_MARKER]: fail("Money local bridge markers out of order")
    actions[hits[START_MARKER]]=inline_action(actions[hits[START_MARKER]],LOCAL_SCRIPT)
    actions[hits[RESTORE_MARKER]]=inline_action(actions[hits[RESTORE_MARKER]],RESTORE_SCRIPT)
    root["WFWorkflowActions"]=actions
    blob=repr(root)
    ids=[a.get("WFWorkflowActionIdentifier","") for a in actions]
    if START_MARKER in blob or RESTORE_MARKER in blob: fail("Money local bridge placeholder survived")
    if ids.count("is.workflow.actions.openurl")!=0: fail("Money Alert must not open Safari")
    if ids.count("is.workflow.actions.getclipboard")!=1: fail("Money Alert clipboard bridge missing")
    if ids.count("dk.simonbs.Scriptable.RunScriptInlineIntent")!=2: fail("Money local Scriptable bridge count mismatch")
    for token in ("YOS/Money/money.json","yos-money-local-v1","Pasteboard.copyString","YOS_MONEY_ALERT_V1","Keychain"):
        if token not in blob: fail(f"Money local runtime missing {token}")
    path.write_bytes(plistlib.dumps(root,fmt=plistlib.FMT_XML,sort_keys=False))
    print(f"Money Alert local bridge patch: PASS ({len(actions)} actions)")

if __name__=="__main__":
    if len(sys.argv)!=2: fail("usage: patch_money_alert_local.py SHORTCUT.plist")
    patch(Path(sys.argv[1]))
