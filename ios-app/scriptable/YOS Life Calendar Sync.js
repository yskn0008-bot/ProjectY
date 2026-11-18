// Variables used by Scriptable.
// icon-color: blue; icon-glyph: calendar;
// YOS_SCRIPT_NAME: YOS Life Calendar Sync
// YOS Life Calendar Sync
// Scriptable bridge: iPhone Calendar -> MY LIFE ?sync= URL

const LIFE_URL = 'https://yskn0008-bot.github.io/ProjectY/life/?sync=';

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function iso(date) {
  return new Date(date).toISOString();
}

function base64Url(text) {
  return Data.fromString(text)
    .toBase64String()
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function run() {
  const now = new Date();
  const events = await CalendarEvent.today();
  if (localDateKey(now) !== localDateKey(new Date())) {
    throw new Error("日付が変わりました。もう一度実行してください。");
  }
  const normalized = events
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .map((event, index) => ({
      id: String(event.identifier || `scriptable-${index}`),
      title: String(event.title || '予定'),
      start: iso(event.startDate),
      end: iso(event.endDate),
      location: String(event.location || ''),
      category: 'other',
      isAllDay: event.isAllDay === true,
    }));

  const payload = { date: localDateKey(now), events: normalized };
  const url = `${LIFE_URL}${base64Url(JSON.stringify(payload))}`;
  const after = typeof args !== 'undefined' && args.queryParameters?.destination === 'myway' ? '&after=myway' : '';
  Safari.open(url + after);

  // URLを開いただけではLifeでの保存成功を確認できないため、成功通知は出さない。

}


// Optional destination: same existing Scriptable script, no second installer.
// It reads Apple Calendar and incomplete Reminders locally and carries a bounded,
// read-only snapshot in an HTTPS URL *fragment* (not a server request parameter).
const YOS_CALENDAR_NATIVE_URL='https://yskn0008-bot.github.io/ProjectY/life/calendar/#yos-native=';
function nativeStableId(parts){
 let h=2166136261;
 for(const ch of parts.join('|')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0}
 return 'local-'+h.toString(16);
}
async function runNativeCalendar(){
 const nonce=String(args.queryParameters?.nonce||'');
 if(!/^[a-f0-9]{32}$/.test(nonce))throw Error('統合カレンダーの更新ボタンから実行してください');
 const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const end=new Date(start);end.setDate(end.getDate()+15);
 const raw=await CalendarEvent.between(start,end);
 if(!Array.isArray(raw)||raw.length>80)throw Error('予定が上限を超えました。元データは変更しません。');
 const events=raw.map(event=>{
  if(!event||!event.title||!event.startDate||!event.endDate)throw Error('予定の日付またはタイトルが不明');
  const begin=iso(event.startDate),finish=iso(event.endDate);
  if(Date.parse(finish)<=Date.parse(begin))throw Error('予定の終了時刻が不正');
  const id=String(event.identifier||nativeStableId([event.title,begin,finish]));
  return {id:(id+':'+begin).slice(0,180),title:String(event.title).slice(0,100),
   start:begin,end:finish,allDay:event.isAllDay===true};
 });
 // A failed Reminders permission read is clearly labeled unavailable; never
 // turn it into "no reminders", and never delete a source reminder.
 let remindersStatus='ok',reminders=[];
 try {
  const pending=await Reminder.allIncomplete();
  if(!Array.isArray(pending))throw Error('Incomplete reminders unavailable');
  const due=pending.filter(r=>r&&r.title&&r.dueDate).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  if(due.length>80)throw Error('Too many due reminders to import completely');
  reminders=due.map(r=>{
   const d=iso(r.dueDate),id=String(r.identifier||nativeStableId([r.title,d]));
   return {id:id.slice(0,180),title:String(r.title).slice(0,100),dueAt:d,
    completed:false,dueAllDay:r.dueDateIncludesTime===false};
  });
 } catch(error) {
  // Permission failures are partial-source, but capacity/validation failures
  // may hide obligations: abort instead of silently dropping records.
  if(/too many/i.test(String(error)))throw error;
  remindersStatus='unavailable';reminders=[];
 }
 if(localDateKey(start)!==localDateKey(new Date()))
  throw Error('日付が変わりました。再実行してください');
 const snapshot={schema:'yos-calendar-native-snapshot-v1',source:'scriptable-on-device',requestNonce:nonce,
  checkedAt:new Date().toISOString(),windowStart:localDateKey(start),
  windowEnd:localDateKey(new Date(end.getTime()-1000)),completeCalendar:true,
  remindersStatus,events,reminders};
 const serialized=JSON.stringify(snapshot);
 if(serialized.length>16000)throw Error('データ量が上限を超えました。保存は行いません。');
 const encoded=base64Url(serialized);
 if(encoded.length>22000)throw Error('安全に引き継げるURL長を超えました。保存は行いません。');
 Safari.open(YOS_CALENDAR_NATIVE_URL+encoded);
 // Opening Safari does NOT prove that storage succeeded. Only the receiving page
 // may report successful validation and readback after it clears its URL fragment.
}

try {
  if(typeof args!=='undefined'&&args.queryParameters?.target==='calendar')await runNativeCalendar();
  else await run();
} catch (error) {
  const alert = new Alert();
  alert.title = 'カレンダー同期に失敗';
  alert.message = String(error && error.message ? error.message : error);
  alert.addAction('閉じる');
  await alert.presentAlert();
}

Script.complete();
