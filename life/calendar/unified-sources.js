/* YOS unified calendar: READ-ONLY projection of already-authorized DAYSTREAM snapshots.
 * It never fetches private APIs, writes source records, or claims iOS Calendar permissions.
 * Storage is origin-scoped: separate iPhone Home Screen web apps may not share it.
 */
(function(root){
 'use strict';
 const TASK_KEY='YOS_DAYSTREAM_WEB_TASK_SNAPSHOT_V1';
 const CAL_KEY='YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1';
 const SCHEMA='yos-daystream-source-snapshot-v1';
 const DATE=/^\d{4}-\d{2}-\d{2}$/;
 const STATES=new Set(['次にやる','実行中','本人操作','待ち','保留','完了']);
 const DAY_MS=86400000;
 function clean(x,max=120){return String(x==null?'':x).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
 function validDay(x){return typeof x==='string'&&DATE.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x}
 function time(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')}
 function json(storage,key){
   try { const raw=storage.getItem(key);return raw&&raw.length<=1000000?JSON.parse(raw):null }
   catch {return null}
 }
 function freshness(s,kind,now){
   if(!s||s.schema!==SCHEMA||s.kind!==kind||!['user-file','yos-auth-cache'].includes(s.source))return 'missing';
   const at=Date.parse(s.checkedAt);
   if(!Number.isFinite(at))return 'invalid';
   const age=now-at,limit=s.source==='yos-auth-cache'?6*3600000:7*DAY_MS;
   if(age< -300000||age>limit)return 'stale';
   return 'ready';
 }
 function taskItems(s){
   if(!Array.isArray(s.items)||s.items.length>400||s.status!=='ok'&&s.status!=='partial')return null;
   if(s.origin==='notion'&&s.complete!==true)return null;
   const out=[],seen=new Set();
   for(const t of s.items){
     if(!t||typeof t!=='object'||typeof t.id!=='string'||!t.id||seen.has(t.id))return null;
     seen.add(t.id);
     const name=clean(t.title,100),state=clean(t.status,30),date=clean(t.due,10);
     if(!name||!STATES.has(state)||date&&!validDay(date))return null;
     if(s.origin==='notion'&&!/^notion-[a-f0-9]{32}$/.test(t.id))return null;
     if(!date)continue;  // Unscheduled work remains in DAYSTREAM's unplaced task queue.
     const dueAt=clean(t.dueAt,80);
     const isFixed=t.timing==='fixed';
     let clock='';
     if(dueAt&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dueAt)){
       // Time is a deadline unless the original source explicitly identified a calendar record.
       const m=dueAt.match(/T(\d{2}):(\d{2})/);
       clock=m?m[1]+':'+m[2]:'';
     }
     const label=isFixed?(clock?'固定予定 '+clock:'固定予定'):(clock?'期限 '+clock:'期限');
     out.push({id:'daystream:task:'+t.id,type:isFixed?'schedule':'task',date,title:name,
       subtitle:label+(state==='完了'?' · 完了':''),done:state==='完了',source:s.origin==='notion'?'Notion Tasks写し':'Tasks取込写し',
       sourceId:t.id,sourceKind:isFixed?'calendar':'task',fixed:isFixed});
   }
   return out;
 }
 function calendarItems(s){
   const days=s.calendarDays,allDayDays=s.allDayDays||{};
   if(!days||typeof days!=='object'||Array.isArray(days)||!allDayDays||typeof allDayDays!=='object'||Array.isArray(allDayDays))return null;
   const out=[];let count=0;
   if(Object.keys(days).length>366||Object.keys(allDayDays).length>366)return null;
   for(const [day,events] of Object.entries(days)){
     if(!validDay(day)||!Array.isArray(events)||events.length>80)return null;
     for(const e of events){
       if(!e||typeof e!=='object'||!Number.isInteger(e.start)||!Number.isInteger(e.duration)||e.start<0||e.start>=1440||e.duration<1||e.start+e.duration>1440)return null;
       const name=clean(e.title,100);if(!name)return null;
       out.push({id:'daystream:cal:'+day+':'+count,type:'schedule',date:day,title:name,
         subtitle:time(e.start)+' – '+time(e.start+e.duration),source:'予定取込写し',sourceKind:'calendar',fixed:true});
       if(++count>1000)return null;
     }
   }
   for(const [day,titles] of Object.entries(allDayDays)){
     if(!validDay(day)||!Array.isArray(titles)||titles.length>80)return null;
     for(const title of titles){
       const name=clean(title,100);if(!name)return null;
       out.push({id:'daystream:allday:'+day+':'+count,type:'schedule',date:day,title:name,
         subtitle:'終日',source:'予定取込写し',sourceKind:'calendar',fixed:true});
       if(++count>1000)return null;
     }
   }
   return out;
 }
 function read(storage,now){
   const current=Number.isFinite(now)?now:Date.now();
   const rawTasks=json(storage,TASK_KEY),rawCalendar=json(storage,CAL_KEY);
   const tState=freshness(rawTasks,'tasks',current),cState=freshness(rawCalendar,'calendar',current);
   let tasks=null,calendar=null;
   if(tState==='ready')tasks=taskItems(rawTasks);
   if(cState==='ready')calendar=calendarItems(rawCalendar);
   const state={tasks:tasks===null?(tState==='ready'?'invalid':tState):'ready',
     calendar:calendar===null?(cState==='ready'?'invalid':cState):'ready'};
   return {items:[...(tasks||[]),...(calendar||[])],status:state,
     details:{tasks:tasks?{at:rawTasks.checkedAt,origin:rawTasks.origin==='notion'?'notion':'manual',count:tasks.length}:null,
       calendar:calendar?{at:rawCalendar.checkedAt,origin:'manual',count:calendar.length}:null}};
 }
 // Cross-source duplicates without shared original IDs are suppressed only when
 // the same day, same title and the same *explicit* start time are verified.
 function merge(base,extra){
   const out=[...extra,...base],seenIds=new Set(),seenTime=new Set(),result=[];
   function key(e){
     if(e.type!=='schedule')return '';
     const start=/^\d{2}:\d{2}/.exec(e.subtitle||'');
     const all=e.subtitle==='終日';
     return (start||all)?e.date+'|'+clean(e.title,100)+'|'+(all?'all':start[0]):'';
   }
   for(const e of out){
     if(!e||typeof e!=='object'||!validDay(e.date)||!['schedule','task','money','habit'].includes(e.type))continue;
     if(e.id&&seenIds.has(e.id))continue;
     const k=key(e);
     if(k&&seenTime.has(k))continue;
     if(e.id)seenIds.add(e.id);
     if(k)seenTime.add(k);
     result.push(e);
   }
   return result;
 }
 root.YOS_UNIFIED_CALENDAR={read,merge,keys:{tasks:TASK_KEY,calendar:CAL_KEY}};
})(typeof window!=='undefined'?window:globalThis);
