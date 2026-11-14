/* YOS Calendar: native iPhone Scriptable -> same-origin browser, read-only.
 * The URL fragment is removed immediately on arrival; no server receives it.
 * A successful import replaces only its dedicated snapshot and is read back.
 */
(function(root){
 'use strict';
 const KEY='YOS_CALENDAR_NATIVE_SNAPSHOT_V1',PENDING_KEY='YOS_CALENDAR_NATIVE_PENDING_V1';
 const SCHEMA='yos-calendar-native-snapshot-v1';
 const DAY_MS=86400000,MAX_BYTES=16000,MAX_EVENTS=80,MAX_REMINDERS=80,MAX_SPAN=15;
 const TZ='Asia/Tokyo';
 let pendingConfirmation=null; // In memory only, lost on page close or reload.
 const clean=(x,max=100)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
 function validDay(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s}
 function parseAt(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s))return null;
  const ms=Date.parse(s);return Number.isFinite(ms)?ms:null;
 }
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 function parts(ms){
  const p=Object.fromEntries(fmt.formatToParts(new Date(ms)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {day:p.year+'-'+p.month+'-'+p.day,minutes:Number(p.hour)*60+Number(p.minute)};
 }
 function nextDay(day){let d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
 function clock(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
 function verify(snapshot,now){
  if(!snapshot||snapshot.schema!==SCHEMA||snapshot.source!=='scriptable-on-device'||snapshot.completeCalendar!==true)return {ok:false,reason:'invalid'};
  const at=parseAt(snapshot.checkedAt);
  if(at===null||at>now+300000||now-at>DAY_MS)return {ok:false,reason:'stale'};
  if(!validDay(snapshot.windowStart)||!validDay(snapshot.windowEnd)||Date.parse(snapshot.windowEnd)<Date.parse(snapshot.windowStart)||Date.parse(snapshot.windowEnd)-Date.parse(snapshot.windowStart)>15*DAY_MS)return {ok:false,reason:'invalid'};
  if(!Array.isArray(snapshot.events)||snapshot.events.length>MAX_EVENTS||
     !Array.isArray(snapshot.reminders)||snapshot.reminders.length>MAX_REMINDERS||
     !['ok','unavailable'].includes(snapshot.remindersStatus))return {ok:false,reason:'invalid'};
  const seen=new Set();
  for(const e of snapshot.events){
   if(!e||typeof e!=='object'||!clean(e.id,180)||!clean(e.title,100)||typeof e.allDay!=='boolean')return {ok:false,reason:'invalid'};
   if(seen.has('event:'+e.id))return {ok:false,reason:'invalid'};
   seen.add('event:'+e.id);
   const a=parseAt(e.start),b=parseAt(e.end);
   if(a===null||b===null||b<=a||b-a>MAX_SPAN*DAY_MS)return {ok:false,reason:'invalid'};
   if(parts(b-1).day<snapshot.windowStart||parts(a).day>snapshot.windowEnd)return {ok:false,reason:'invalid'};
  }
  for(const r of snapshot.reminders){
   if(!r||typeof r!=='object'||!clean(r.id,180)||!clean(r.title,100)||r.completed!==false)return {ok:false,reason:'invalid'};
   if(seen.has('reminder:'+r.id))return {ok:false,reason:'invalid'};
   seen.add('reminder:'+r.id);
   if(r.dueAt!==null&&parseAt(r.dueAt)===null)return {ok:false,reason:'invalid'};
   if(r.dueAllDay!==undefined&&typeof r.dueAllDay!=='boolean')return {ok:false,reason:'invalid'};
  }
  if(snapshot.remindersStatus==='unavailable'&&snapshot.reminders.length)return {ok:false,reason:'invalid'};
  return {ok:true};
 }
 function map(snapshot){
  const events=[],seen=new Set();
  const add=e=>{
   const key=e.sourceKind+'|'+e.sourceId+'|'+e.date;
   if(seen.has(key))return;
   seen.add(key);events.push(e);
  };
  for(const e of snapshot.events){
   const start=parseAt(e.start),end=parseAt(e.end),a=parts(start),b=parts(end);
   let day=a.day,n=0;
   const stop=parts(end-1).day;
   while(day<=stop&&n++<MAX_SPAN+1){
    if(day>=snapshot.windowStart&&day<=snapshot.windowEnd){
     const time=e.allDay?'終日':day===a.day?clock(a.minutes)+(day===b.day?' – '+clock(b.minutes):' – 24:00'):'00:00 – '+(day===b.day?clock(b.minutes):'24:00');
     add({id:'native:event:'+clean(e.id,180)+':'+day,type:'schedule',date:day,title:clean(e.title),
      subtitle:time,source:'iPhone Calendar取込',sourceKind:'calendar',sourceId:clean(e.id,180),fixed:true});
    }
    day=nextDay(day);
   }
  }
  if(snapshot.remindersStatus==='ok'){
   for(const r of snapshot.reminders){
    if(!r.dueAt)continue;const d=parts(parseAt(r.dueAt));
    add({id:'native:reminder:'+clean(r.id,180),type:'task',date:d.day,title:clean(r.title),
     subtitle:r.dueAllDay?'リマインダー期限（日付のみ）':'リマインダー期限 '+clock(d.minutes),source:'iPhone Reminders取込',sourceKind:'reminder',sourceId:clean(r.id,180),done:false,fixed:false});
   }
  }
  return events;
 }
 function read(storage,now){
  let saved=null;try{const raw=storage.getItem(KEY);if(raw&&raw.length<=MAX_BYTES)saved=JSON.parse(raw)}catch{}
  const at=Number.isFinite(now)?now:Date.now();
  if(!saved)return {status:'missing',items:[],details:null};
  const check=verify(saved,at);
  if(!check.ok)return {status:check.reason,items:[],details:null};
  return {status:'ready',items:map(saved),details:{at:saved.checkedAt,eventCount:saved.events.length,
   reminderCount:saved.reminders.length,remindersStatus:saved.remindersStatus,windowStart:saved.windowStart,windowEnd:saved.windowEnd}};
 }
 function save(storage,snapshot,now){
  const check=verify(snapshot,Number.isFinite(now)?now:Date.now());
  if(!check.ok)return {ok:false,reason:check.reason};
  const raw=JSON.stringify(snapshot);
  if(raw.length>MAX_BYTES)return {ok:false,reason:'oversize'};
  let old=null;
  try{
   old=storage.getItem(KEY);
   if(old!==null){
    storage.setItem(KEY+'_BACKUP',old);
    if(storage.getItem(KEY+'_BACKUP')!==old)throw Error('backup');
   }
   storage.setItem(KEY,raw);
   if(storage.getItem(KEY)!==raw)throw Error('readback');
   return {ok:true,details:read(storage,Number.isFinite(now)?now:Date.now()).details};
  }catch{
   try{if(old===null)storage.removeItem(KEY);else storage.setItem(KEY,old)}catch{}
   return {ok:false,reason:'storage'};
  }
 }
 function decodePayload(encoded){
  if(!/^[A-Za-z0-9_-]{1,22000}$/.test(encoded))return null;
  try{
   const b64=encoded.replace(/-/g,'+').replace(/_/g,'/');
   const raw=root.atob(b64+'='.repeat((4-b64.length%4)%4));
   const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
   const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   if(decoded.length>MAX_BYTES)return null;
   return JSON.parse(decoded);
  }catch{return null}
 }
 function consume(storage,locationObj,historyObj,now){
  const hash=String(locationObj.hash||'');
  if(!hash.startsWith('#yos-native='))return {ok:false,reason:'none'};
  // Remove sensitive fragment even when invalid, before saving or rendering anything.
  try{historyObj.replaceState(null,'',locationObj.pathname+locationObj.search)}catch{
   // When history cannot clear the fragment, reject rather than retain a private URL.
   return {ok:false,reason:'history'};
  }
  const snapshot=decodePayload(hash.slice('#yos-native='.length));
  if(!snapshot)return {ok:false,reason:'invalid'};
  // A web link alone is not proof that the user's Scriptable produced the data.
  // Bind it to a locally initiated one-tap request for integrity (no server secrets).
  let pending=null;
  try{pending=JSON.parse(storage.getItem(PENDING_KEY)||'null')}catch{}
  const current=Number.isFinite(now)?now:Date.now();
  const pendingValid=pending&&typeof pending.nonce==='string'&&/^[a-f0-9]{32}$/.test(pending.nonce)
     &&snapshot.requestNonce===pending.nonce&&Number.isFinite(pending.createdAt)
     &&current-pending.createdAt<=5*60000&&current-pending.createdAt>=-300000;
  if(!pendingValid){
    // Only a genuinely separate Safari/PWA storage context has no pending
    // request. A mismatched or expired request in this context is rejected.
    if(!pending&&/^[a-f0-9]{32}$/.test(String(snapshot.requestNonce||''))&&verify(snapshot,current).ok){
      pendingConfirmation=snapshot;
      return {ok:false,reason:'confirmation-needed',details:{
       eventCount:snapshot.events.length,reminderCount:snapshot.reminders.length,remindersStatus:snapshot.remindersStatus}};
    }
    return {ok:false,reason:'unrequested'};
  }
  try{storage.removeItem(PENDING_KEY)}catch{return {ok:false,reason:'storage'}}
  return save(storage,snapshot,now);
 }
 function asDaystream(storage,now){
  const snapshot=read(storage,now);
  if(snapshot.status!=='ready')return null;
  const days={},allDayDays={};
  for(const e of snapshot.items){
   if(e.type!=='schedule')continue;
   if(e.subtitle==='終日'){(allDayDays[e.date]??=[]).push(e.title);continue}
   const m=/^(\d{2}):(\d{2}) – (\d{2}):(\d{2})$/.exec(e.subtitle);
   if(!m)return null;
   const from=Number(m[1])*60+Number(m[2]),until=Number(m[3])*60+Number(m[4]);
   if(!Number.isSafeInteger(from)||!Number.isSafeInteger(until)||from<0||until>1440||until<=from)return null;
   (days[e.date]??=[]).push({title:e.title,start:from,duration:until-from});
  }
  return {status:'ok',source:'scriptable-on-device',calendarDays:days,allDayDays,
   calendarCoverage:{from:snapshot.details.windowStart,until:nextDay(snapshot.details.windowEnd),status:'ok'},
   checkedAt:snapshot.details.at};
 }
 function confirmImport(storage,now){
  const value=pendingConfirmation;pendingConfirmation=null;
  if(!value)return {ok:false,reason:'none'};
  return save(storage,value,now);
 }
 root.YOS_CALENDAR_NATIVE={read,save,consume,confirmImport,asDaystream,keys:{snapshot:KEY,pending:PENDING_KEY}};
})(typeof window!=='undefined'?window:globalThis);
