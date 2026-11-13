/* DAYSTREAM browser read-only source adapter.
 * Offline user-selected files only. No credentials, outbound requests or source writes.
 */
(function(root){
 'use strict';
 const MAX_EVENTS=500, MAX_TASKS=400, MAX_BYTES=1000000, DAY=/^\d{4}-\d{2}-\d{2}$/;
 const str=(v,n)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
 const date=s=>DAY.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function normalizeTasks(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('タスクJSON形式が不正');
  const raw=Array.isArray(data.items)?data.items:Array.isArray(data.tasks)?data.tasks:null;
  if(!raw||raw.length>MAX_TASKS)throw Error('タスク数が上限外');
  const seen=new Set(),items=[];
  for(const t of raw){
   if(!t||typeof t!=='object')throw Error('タスクが不正');
   const id=str(t.id,80),title=str(t.title,120),status=str(t.status||t.state,32),due=str(t.due,10);
   if(!/^[a-z0-9-]{8,80}$/i.test(id)||!title||!['次にやる','実行中','本人操作','待ち','保留','完了'].includes(status)||due&&!date(due))throw Error('タスクのID・名前・期限・状態を確認できない');
   if(seen.has(id))continue;seen.add(id);
   items.push({id,title,status,due,priority:['P0','P1','P2','P3'].includes(t.priority)?t.priority:'',area:str(t.area||'未分類',40),action:str(t.action,140)});
  }
  // A projection only. It is not evidence that Notion is currently synchronized.
  const checkedAt=new Date().toISOString();
  return {schema:'yos-daystream-source-snapshot-v1',kind:'tasks',status:'ok',items,checkedAt,source:'user-file'};
 }
 const unescapeICS=s=>s.replace(/\\[nN]/g,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\');
 function stamp(raw,params){
  const s=raw.trim();
  if(/^\d{8}$/.test(s)){const day=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);if(!date(day))throw Error('日付が無効');return {day,minute:0,allDay:true,absolute:null}}
  const m=s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if(!m)throw Error('日付形式が未対応');
  const day=m[1]+'-'+m[2]+'-'+m[3],minute=Number(m[4])*60+Number(m[5]),second=Number(m[6]||0);
  if(!date(day)||minute>=1440||second>=60)throw Error('時刻が無効');
  const zone=(params.match(/(?:^|;)TZID=([^;:]+)/i)||[])[1];
  if(zone&&!/^(?:Asia\/Tokyo|Japan)$/i.test(zone))throw Error('異なるタイムゾーンは推測できません');
  if(m[7]){
   const ms=Date.parse(day+'T'+m[4]+':'+m[5]+':'+String(second).padStart(2,'0')+'Z');
   // Asia/Tokyo is UTC+09:00 year-round. Avoid the browser/CI machine's local timezone.
   const tokyo=new Date(ms+9*60*60000);
   return {day:[tokyo.getUTCFullYear(),String(tokyo.getUTCMonth()+1).padStart(2,'0'),String(tokyo.getUTCDate()).padStart(2,'0')].join('-'),minute:tokyo.getUTCHours()*60+tokyo.getUTCMinutes(),allDay:false,absolute:ms};
  }
  return {day,minute,allDay:false,absolute:null};
 }
 function parseICS(ics){
  if(typeof ics!=='string'||ics.length>MAX_BYTES||!ics.includes('BEGIN:VCALENDAR'))throw Error('カレンダーファイルではありません');
  const lines=ics.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').reduce((a,line)=>{if(/^[ \t]/.test(line)&&a.length)a[a.length-1]+=line.slice(1);else a.push(line);return a},[]);
  if(lines.length>30000)throw Error('カレンダーの行数が上限を超えました');
  const days={},allDayDays={},seen=new Set();let inEvent=false,fields=null,count=0,skipped=0;
  const add=(day,e)=>{if(!days[day])days[day]=[];if(days[day].length<80)days[day].push(e)};
  for(const line of lines){
   if(line==='BEGIN:VEVENT'){if(inEvent)throw Error('予定の入れ子が不正');inEvent=true;fields={};continue}
   if(line==='END:VEVENT'){
    if(!inEvent)continue;inEvent=false;count++;
    if(count>MAX_EVENTS)throw Error('予定数が上限超過');
    if(fields.STATUS==='CANCELLED'||fields.RRULE||fields['RECURRENCE-ID']){skipped++;continue}
    try{
     const begin=fields.DTSTART,end=fields.DTEND;
     if(!begin||!end)throw Error('開始・終了が不明');
     const a=stamp(begin.value,begin.params),b=stamp(end.value,end.params);
     const title=str(unescapeICS(fields.SUMMARY||'予定'),100);
     const uid=str(fields.UID||title+'|'+begin.value,180);
     if(!title||seen.has(uid+'|'+begin.value))continue;
     seen.add(uid+'|'+begin.value);
     if(a.allDay&&b.allDay){
      const from=new Date(a.day+'T00:00:00Z'),to=new Date(b.day+'T00:00:00Z');
      const n=(+to-+from)/86400000;if(n<=0||n>31)throw Error('終日予定の範囲が不正');
      for(let j=0;j<n;j++){const d=new Date(+from+j*86400000).toISOString().slice(0,10);(allDayDays[d]??=[]).push(title)}
      continue;
     }
     if(a.allDay!==b.allDay)throw Error('時刻型が異なる');
     const a0=new Date(a.day+'T00:00:00Z'),b0=new Date(b.day+'T00:00:00Z');
     const duration=(a.absolute!==null&&b.absolute!==null)?Math.round((b.absolute-a.absolute)/60000):Math.round((+b0-+a0)/60000+b.minute-a.minute);
     if(duration<=0||duration>1440)throw Error('期間が無効');
     let remaining=duration,offset=a.minute,day=a.day;
     while(remaining>0){
      const segment=Math.min(remaining,1440-offset);
      if(segment<=0)throw Error('日跨ぎが不正');
      add(day,{title,start:offset,duration:segment});
      remaining-=segment;offset=0;
      if(remaining>0){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);day=d.toISOString().slice(0,10)}
     }
    }catch{skipped++}
    continue;
   }
   if(!inEvent)continue;
   const pos=line.indexOf(':');if(pos<0)continue;
   const left=line.slice(0,pos),value=line.slice(pos+1),name=left.split(';')[0].toUpperCase();
   if(['SUMMARY','UID','STATUS','RRULE'].includes(name))fields[name]=value;
   else if(['DTSTART','DTEND','RECURRENCE-ID'].includes(name))fields[name]={value,params:left.slice(name.length)};
  }
  if(inEvent||count===0)throw Error('予定が取得できません');
  if(!Object.keys(days).length&&!Object.keys(allDayDays).length)throw Error('対応する予定がありません');
  return {schema:'yos-daystream-source-snapshot-v1',kind:'calendar',status:skipped?'partial':'ok',calendarDays:days,allDayDays,checkedAt:new Date().toISOString(),source:'user-file',eventCount:count,skippedCount:skipped};
 }
 function fromYosTaskDashboardCache(cache){
  if(!cache||typeof cache!=='object'||!Number.isFinite(cache.savedAt)||Date.now()-cache.savedAt<0||Date.now()-cache.savedAt>6*60*60*1000||!Array.isArray(cache.data?.tasks)||cache.data.tasks.length>MAX_TASKS)return null;
  const authoritative=cache.data.source==='notion';
  if(authoritative&&cache.data.complete!==true)return null;
  const items=[],seen=new Set();
  const tokyo=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'});
  const dateValue=value=>{
   if(value==null||value==='')return {day:'',at:null};
   if(typeof value!=='string')return null;
   if(date(value))return {day:value,at:value};
   // No browser timezone guesses: Notion timestamps must carry an explicit offset.
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!date(value.slice(0,10))||!Number.isFinite(Date.parse(value)))return null;
   if(Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||(value[16]===':'&&Number(value.slice(17,19))>59))return null;
   const parts=Object.fromEntries(tokyo.formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
   return {day:parts.year+'-'+parts.month+'-'+parts.day,at:value};
  };
  for(const t of cache.data.tasks){
   if(!t||typeof t!=='object'){if(authoritative)return null;continue}
   const title=str(t.title,120),state=str(t.state,32),start=dateValue(t.due),end=dateValue(t.dueEnd);
   if(!title||!['次にやる','実行中','本人操作','待ち','保留','完了'].includes(state)||!start||!end){if(authoritative)return null;continue}
   if(authoritative&&end.at&&(!start.at||Date.parse(end.at)<Date.parse(start.at)))return null;
   const order=Number.isSafeInteger(Number(t.order))?Number(t.order):0;
   let id;
   if(authoritative){
    if(typeof t.id!=='string'||!/^[a-f0-9]{32}$/i.test(t.id))return null;
    id='notion-'+t.id.toLowerCase();
   }else{
    // Backward compatibility for older read-only projection files only.
    let hash=2166136261;
    for(const ch of title+'|'+order){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0}
    id='yos-cache-'+order+'-'+hash.toString(16);
   }
   if(seen.has(id)){if(authoritative)return null;continue}seen.add(id);
   items.push({id,title,status:state,due:start.day,priority:['P0','P1','P2','P3'].includes(t.priority)?t.priority:'',area:str(t.area||'YOS Tasks',40),action:str(t.nextAction,140),...(authoritative?{
    dueAt:start.at,dueEnd:end.at,dueTimeZone:str(t.dueTimeZone,80)||null,
    // A deadline time is not proof of a fixed appointment. Do not schedule it.
    timing:t.sourceKind==='calendar'?'fixed':start.at&&start.at.includes('T')?'timed-deadline':'flexible',
    habitCycle:['毎日','毎週','毎月','年・長期'].includes(t.habitCycle)?t.habitCycle:'',
    lastEditedAt:typeof t.lastEditedAt==='string'?str(t.lastEditedAt,80):null,
    // Preserve the source mirror's sync time separately from this Notion GET time.
    // A fresh Notion read cannot prove Apple Calendar was refreshed recently.
    lastSynced:typeof t.lastSynced==='string'?str(t.lastSynced,80):null
   }:{})});
  }
  return {schema:'yos-daystream-source-snapshot-v1',kind:'tasks',status:authoritative?'ok':'partial',items,checkedAt:new Date(cache.savedAt).toISOString(),source:'yos-auth-cache',...(authoritative?{origin:'notion',complete:true,ignoredBlankCount:Number.isSafeInteger(cache.data.ignoredBlankCount)&&cache.data.ignoredBlankCount>=0?cache.data.ignoredBlankCount:0}: {})};
 }
 function fromYosLifeStore(life){
  if(!life||typeof life!=='object'||!life.days||typeof life.days!=='object'||Array.isArray(life.days))return null;
  const entries=Object.entries(life.days);
  if(entries.length>90)return null;
  const days={},seen=new Set();let validCount=0,skipped=0;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const timeParts=ms=>{const p=Object.fromEntries(formatter.formatToParts(new Date(ms)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {day:p.year+'-'+p.month+'-'+p.day,minute:Number(p.hour)*60+Number(p.minute)}};
  for(const [key,day] of entries){
   if(!date(key)||!day||typeof day!=='object')continue;
   const events=Array.isArray(day.schedule)?day.schedule:[];
   if(events.length>100)return null;
   for(const e of events){
    if(!e||typeof e!=='object'||typeof e.start!=='string'||typeof e.end!=='string'){skipped++;continue}
    const start=Date.parse(e.start),end=Date.parse(e.end),title=str(e.title||e.name,100);
    if(!Number.isFinite(start)||!Number.isFinite(end)||!title||end<=start||end-start>86400000){skipped++;continue}
    const signature=title+'|'+start+'|'+end;if(seen.has(signature))continue;seen.add(signature);
    let at=start;
    while(at<end){
     const p=timeParts(at),midnight=Date.parse(p.day+'T15:00:00Z'); // Tokyo midnight of following UTC day.
     const next=midnight>at?midnight:at+86400000;
     const boundary=Math.min(end,next),d=Math.round((boundary-at)/60000);
     if(d<=0||d>1440||p.minute+d>1440){skipped++;break}
     (days[p.day]??=[]).push({title,start:p.minute,duration:d});validCount++;at=boundary
    }
   }
  }
  if(!validCount)return null;
  // Browser-local Life data can be outdated; no proof of live Apple Calendar access.
  return {schema:'yos-daystream-life-schedule-v1',source:'yos-life-local',status:'partial',calendarDays:days,allDayDays:{},skippedCount:skipped};
 }
 function validSaved(s,kind,retentionDays=7,archiveRestore=false){
  if(!s||s.schema!=='yos-daystream-source-snapshot-v1'||s.kind!==kind||!['user-file','yos-auth-cache'].includes(s.source)||!Number.isFinite(Date.parse(s.checkedAt)))return false;
  const age=Date.now()-Date.parse(s.checkedAt);
  const maxDays=s.source==='yos-auth-cache'&&!archiveRestore?Math.min(retentionDays,0.25):retentionDays;
  return age>=-300000&&age<=maxDays*86400000;
 }
 root.YOS_DAYSTREAM_SOURCES={normalizeTasks,parseICS,fromYosTaskDashboardCache,fromYosLifeStore,validSaved,MAX_BYTES};
})(typeof window!=='undefined'?window:globalThis);
