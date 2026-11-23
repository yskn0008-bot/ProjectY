// Variables used by Scriptable.
// icon-color: blue; icon-glyph: tasks;
// YOS_SCRIPT_NAME: YOS DAYSTREAM Notion
// Existing DAYSTREAM UI with read-only Notion/iCloud inputs and a local plan.
'use strict';
const NOTION_KEY='YOS_NOTION_INTEGRATION_TOKEN';
const UI_REF='c0735bf7dc092f8c30753b1c0c73cfd1cd758416';
// Stable, already-published HTTPS base for Scriptable's generated HTML.
// Do not delete or migrate any existing DAYSTREAM localStorage keys.
const UI_BASE_URL='https://yskn0008-bot.github.io/ProjectY/yos/daystream/';
const ROOT='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/'+UI_REF+'/';
const SOURCE='965c6086-32c1-463d-93b4-87a9cb69b3ad';
const STATES=['次にやる','実行中','本人操作','待ち','保留','完了'];
const clean=(x,n=120)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const rich=p=>(p?.title||p?.rich_text||[]).map(x=>x.plain_text||x.text?.content||'').join('');
const pick=p=>clean(p?.select?.name||p?.status?.name||'',40);
function validDate(s){
 return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
}
function validAt(s){
 if(validDate(s))return true;
 return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(s)&&validDate(s.slice(0,10))&&Number.isFinite(Date.parse(s));
}
function project(row){
 const id=typeof row?.id==='string'?row.id.replace(/-/g,'').toLowerCase():'';
 if(!/^[a-f0-9]{32}$/.test(id)||!row.properties)throw Error('Notionの識別情報を確認できません');
 if(row.archived||row.in_trash)return null;
 const p=row.properties,title=clean(rich(p['やること']));
 if(!title)return null;
 const sync=rich(p['同期キー']);
 const calendarSource=/^(?:yos-shift-|apple-calendar:|calendar:)/.test(sync);
 const sourceState=pick(p['状態']),due=p['期限']?.date;
 // Calendar entries may have no task status. Never write a guessed status to Notion.
 // The legacy read-only adapter needs a known value; this placeholder is never
 // shown as task state or included in task completion counts for calendar entries.
 if(!STATES.includes(sourceState)&&!(calendarSource&&sourceState===''))
  throw Error('タスクの状態を確認できません：'+clean(title,48));
 const state=sourceState||'次にやる';
 if(due&&(!validAt(due.start)||due.end&&(!validAt(due.end)||due.end.includes('T')!==due.start.includes('T')||Date.parse(due.end)<Date.parse(due.start))))throw Error('タスクの日時を確認できません');
 return {id,title,state,due:due?.start||null,dueEnd:due?.end||null,dueTimeZone:due?.time_zone||null,
 priority:pick(p['優先度']),area:pick(p['領域'])||'YOS Tasks',nextAction:clean(rich(p['次の一手']),140),
 order:Number.isSafeInteger(p['実行順']?.number)?p['実行順'].number:0,
 sourceKind:calendarSource?'calendar':'task',
 evidence:clean(rich(p['正本・根拠']),150),
 habitCycle:pick(p['習慣周期']),syncKey:sync,lastEditedAt:row.last_edited_time||null,
 lastSynced:p['最終同期']?.date?.start||null};
}
async function readTasks(token){
 const tasks=[],seen=new Set(),cursors=new Set();let cursor=null,ignoredBlankCount=0;
 for(let page=0;page<4;page++){
  const req=new Request('https://api.notion.com/v1/data_sources/'+SOURCE+'/query');
  req.method='POST';req.timeoutInterval=20;
  req.headers={Authorization:'Bearer '+token,'Notion-Version':'2025-09-03','Content-Type':'application/json'};
  req.body=JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})});
  let data,fetchError=null;
  try{data=await req.loadJSON()}catch(error){fetchError=error}
  const http=req.response?.statusCode;
  if(http!==200){
   const hint=http===401?'認証情報が無効または期限切れです':
    http===403?'連携にYOS Tasksの閲覧権限がありません':
    http===404?'YOS Tasksの共有設定またはデータソースIDを確認してください':
    http===429?'Notionのアクセス制限中です。しばらくして更新してください':
    http>=500?'Notion側が一時的に応答していません':
    http==null?'応答がありません（通信環境を確認してください）':'APIの応答を確認してください';
   throw Error('Notion取得 HTTP '+(http??'不明')+'：'+hint);
  }
  if(fetchError)throw Error('Notion取得 HTTP 200：応答データを読み取れません');
  if(!Array.isArray(data?.results)||typeof data.has_more!=='boolean')
   throw Error('Notion取得 HTTP 200：応答の形式が想定と異なります');
  for(const row of data.results){
   const task=project(row),id=String(row.id).replace(/-/g,'').toLowerCase();
   if(seen.has(id))throw Error('Notionの重複応答を検出しました');
   seen.add(id);if(task)tasks.push(task);else ignoredBlankCount++;
  }
  if(!data.has_more)return {source:'notion',complete:true,tasks,ignoredBlankCount};
  if(typeof data.next_cursor!=='string'||!data.next_cursor||cursors.has(data.next_cursor))throw Error('Notionのページ取得に失敗しました');
  cursor=data.next_cursor;cursors.add(cursor);
 }
 throw Error('取得上限400件を超えました。一部だけの反映は行いません');
}
function dayProjection(items,day){
 if(!validDate(day))return [];
 const start=Date.parse(day+'T00:00:00+09:00'),stop=start+86400000,out=[];
 for(const t of items){
  if(!t.dueAt)continue;
  const base={id:t.id,title:t.title,status:t.status,sourceFamily:t.sourceFamily,originalStart:t.dueAt,originalEnd:t.dueEnd||null,editedAt:t.lastEditedAt||null};
  if(!t.dueAt.includes('T')){
   if(t.due<=day&&day<=(t.dueEnd||t.due))out.push({...base,type:'undated'});
   continue;
  }
  const a=Date.parse(t.dueAt),b=t.dueEnd&&t.dueEnd.includes('T')?Date.parse(t.dueEnd):null;
  if(b!==null&&b>a){
   if(a<stop&&b>start)out.push({...base,type:'range',s:(Math.max(a,start)-start)/60000,d:(Math.min(b,stop)-Math.max(a,start))/60000});
  }else if(a>=start&&a<stop)out.push({...base,type:'deadline',s:(a-start)/60000,d:0});
 }
 return out;
}
const BROWSER_BOOT=String.raw`
(()=>{
 const snapshot=__SNAPSHOT__;
 const calendarStatus=__CALENDAR_STATUS__;
 window.YOS_CHARCOAL_BOOT.taskSource=snapshot;
 window.YOS_DAYSTREAM_TASK_AUTH={
  setup:()=>{location.href='scriptable:///run?scriptName=YOS%20DAYSTREAM%20Notion';return Promise.resolve(true)},
  complete:()=>Promise.resolve({ok:false,reason:'表示専用です。Notionの元ページで完了してください'})
 };
 window.addEventListener('DOMContentLoaded',()=>{
  const button=document.getElementById('yosWebTaskRefresh');
  const refresh=()=>{location.href='scriptable:///run?scriptName=YOS%20DAYSTREAM%20Notion'};
  button.textContent='↻ Notionを更新';button.onclick=refresh;
  // The Web-only sync link was absent from the previously pinned HTML.
  // Keep one visible action in the existing timeline, not another settings page.
  const sync=document.getElementById('yosTimelineSync');
  if(sync){sync.textContent='↻ Notion同期';sync.title='Notionの最新タスクを取得してDAYSTREAMを開く';}
  const top=document.createElement('button');top.textContent='↻ Notionを更新';top.onclick=refresh;
  const port=document.querySelector('.yos-web-port');
  port.insertBefore(top,document.getElementById('yosWebImport'));

  document.getElementById('yosWebSourceState').textContent='Notion '+snapshot.items.length+'件取得 · '+new Date(snapshot.checkedAt).toLocaleString('ja-JP')+' · 開き直し・更新で再取得 · '+calendarStatus;
 });
})();
`;

const BROWSER_DIRECT_IMPORT=String.raw`
(()=>{
 'use strict';
 // Notion projection with per-day, time-only local overrides. Never mutate the saved plan or Notion source.
 const templates=__DIRECT_ROWS__,DAY=86400000;
 if(!Array.isArray(templates)||templates.length>40)return;
 const MOVE_KEY='YOS_DAYSTREAM_NOTION_MOVES_V1';
 const validDay=x=>/^\d{4}-\d{2}-\d{2}$/.test(x);
 const slotKey=(day,ref)=>day+'|'+ref;
 const readMoves=()=>{
  try{
   const raw=localStorage.getItem(MOVE_KEY);
   if(raw===null)return {};
   const parsed=JSON.parse(raw);
   if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')return null;
   const pairs=Object.entries(parsed);
   if(pairs.length>200||pairs.some(([k,v])=>!/^\d{4}-\d{2}-\d{2}\|notion:[a-f0-9]{32}$/.test(k)||
    !Number.isInteger(v)||v<0||v>1439))return null;
   return parsed;
  }catch{return null;}
 };
 window.YOS_NOTION_LOCAL_MOVE=(day,ref,start,duration)=>{
  if(!validDay(day)||!/^notion:[a-f0-9]{32}$/.test(ref)||
    !Number.isInteger(start)||!Number.isInteger(duration)||
    duration<=0||duration>1440||start<0||start+duration>1440)return false;
  const moves=readMoves();
  if(!moves)return false;
  moves[slotKey(day,ref)]=start;
  try{
   const json=JSON.stringify(moves);
   localStorage.setItem(MOVE_KEY,json);
   return localStorage.getItem(MOVE_KEY)===json;
  }catch{return false;}
 };
 const toneFor=title=>{
  if(/睡眠|就寝|YOS Night|JOURNAL|自由時間|休息|読書|リラックス/i.test(title))return 'violet';
  if(/食事|朝食|昼食|夕食|保湿|肌|イケメン|美容|基準写真/.test(title))return 'peach';
  if(/歯磨き|歯間|筋トレ|運動|ウォーキング|水を飲む/.test(title))return 'mint';
  return 'blue';
 };
 window.YOS_ONE_TAP_FOR_DAY=(day,existing=[])=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Array.isArray(existing))return [];
  const from=Date.parse(day+'T00:00:00+09:00'),until=from+DAY;
  if(!Number.isFinite(from))return [];
  const out=[],moves=readMoves()||{};
  for(let i=0;i<templates.length;i++){
   const x=templates[i],a=Date.parse(x.startAt),b=Date.parse(x.endAt);
   if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>DAY)continue;
   const n=x.repeat==='daily'?Math.floor((from-a)/DAY):0;
   for(const [k,shift] of (x.repeat==='daily'?[n,n+1]:[0]).entries()){
    if(shift<0)continue;
    const s0=Math.max(from,a+shift*DAY),e0=Math.min(until,b+shift*DAY);
    if(s0>=e0)continue;
    const s=(s0-from)/60000,d=(e0-s0)/60000,ref='notion:'+x.id;
    if(existing.some(y=>y?.sourceRef===ref||y?.sourceRef==='yos-direct:'+x.id))continue;
    if(existing.some(y=>y?.t===x.title&&y?.s===s&&y?.d===d))continue;
    const moved=moves[slotKey(day,ref)];
    const at=Number.isInteger(moved)&&moved>=0&&moved+d<=1440?moved:s;
    out.push({id:880000000+i*3+k,t:x.title,s:at,d,f:0,
     kind:'task',source:'YOS Tasks',flowTone:toneFor(x.title),
     sourceRef:ref,done:x.repeat==='daily'?false:x.done});
   }
  }
  return out;
 };
 window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('yosNativeBoot')?.remove();
  const status=document.getElementById('notice');
  if(status)status.textContent='YOS Tasks同期済み · 時刻移動はこの端末だけに保存（Notion原本は変更しません）';
 });
})();
`;
function nativeDirectRows(tasks){
 if(!Array.isArray(tasks)||tasks.length>400)throw Error('Notionのタスク件数が不正');
 const enabled=/^yos-daystream-routine-202612-(?:night(?:-[a-z]+)?|wake(?:-[a-z]+)?|care(?:-[a-z]+)?|sleep)$|^yos-daystream-ideal-20261123-(?:meal|journal|free)$|^yos-ikemen90-task-0[12]$/;
 const rows=[],used=new Set();
 for(const t of tasks){
  if(!t||!enabled.test(t.syncKey||''))continue;
  if(t.sourceKind!=='task'||!/^[a-f0-9]{32}$/.test(t.id||'')||!STATES.includes(t.state)||
    !validAt(t.due)||!validAt(t.dueEnd)||!t.due.includes('T')||!t.dueEnd.includes('T')||
    used.has(t.id)||!t.title||typeof t.title!=='string')throw Error('生活タスクの元データを確認できません');
  const start=Date.parse(t.due),end=Date.parse(t.dueEnd);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>86400000)
    throw Error('生活タスクの時刻・所要時間を確認できません');
  used.add(t.id);
  rows.push({id:t.id,title:clean(t.title,120),startAt:t.due,endAt:t.dueEnd,
    repeat:t.habitCycle==='毎日'?'daily':'once',done:t.state==='完了'});
 }
 if(rows.length>40)throw Error('生活タスクの登録上限を超えました');
 return rows.sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt)||a.id.localeCompare(b.id));
}

/**
 * iPhone Calendar is already the destination of some Clarity calendar actions.
 * Mirror it read-only when the existing Scriptable DAYSTREAM opens, without
 * creating a second task, altering Shortcuts, or changing the public PWA store.
 * Permission errors or incomplete event lists must not block Notion tasks.
 */
let deviceCalendarStatus='Apple予定：未確認';
async function readDeviceCalendar(nativeSource,tasks,now=new Date()){
 deviceCalendarStatus='Apple予定：読取未完了';
 if(typeof CalendarEvent==='undefined'||typeof CalendarEvent.between!=='function'){
  deviceCalendarStatus='Apple予定：ScriptableのカレンダーAPI利用不可';return null;
 }
 const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const end=new Date(start);end.setDate(end.getDate()+15);
 let events;
 try{events=await CalendarEvent.between(start,end)}catch(_){
  deviceCalendarStatus='Apple予定：読取エラー（端末カレンダーまたはアプリ接続を確認）';return null;
 }
 if(!Array.isArray(events)){
  deviceCalendarStatus='Apple予定：応答形式の不一致';return null;
 }
 if(events.length>80){
  deviceCalendarStatus='Apple予定：15日間に'+events.length+'件あり、取得上限80件を超過';return null;
 }
 // Only deduplicate Notion Clarity windows that the DAYSTREAM timeline
 // actually renders. Notion calendar mirrors (yos-shift-, apple-calendar:,
 // calendar:) are shown only as source candidates, not native timeline cards.
 // Skipping their iCloud event would silently hide the actual fixed schedule.
 const matched=(Array.isArray(tasks)?tasks:[]).filter(t=>t&&t.due?.includes('T')&&t.dueEnd?.includes('T')&&
   Number.isFinite(Date.parse(t.due))&&Number.isFinite(Date.parse(t.dueEnd))&&
   t.sourceKind==='task'&&/^YOS Inbox clarity:/i.test(t.evidence||''));
 const mirror=[],ids=new Set();
 for(const e of events){
  const title=clean(e?.title,100),a=new Date(e?.startDate),b=new Date(e?.endDate);
  if(!title||!Number.isFinite(+a)||!Number.isFinite(+b)||b<=a||b-a>15*86400000){
   deviceCalendarStatus='Apple予定：日時・件名の形式を確認できません';return null;
  }
  // A rendered Clarity window with identical title and exact time already
  // occupies the timeline; keep it once, but never suppress a calendar mirror.
  if(matched.some(t=>clean(t.title,100)===title&&Date.parse(t.due)===+a&&Date.parse(t.dueEnd)===+b))continue;
  const identity=clean(e.identifier,130)||('no-id:'+title+'|'+a.toISOString()+'|'+b.toISOString());
  const id=(identity+':'+a.toISOString()).slice(0,180);
  if(ids.has(id)){
   deviceCalendarStatus='Apple予定：同一IDの重複を検出';return null;
  }
  ids.add(id);
  mirror.push({id,title,start:a.toISOString(),end:b.toISOString(),allDay:e.isAllDay===true});
 }
 const day=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const snapshot={schema:'yos-calendar-native-snapshot-v1',source:'scriptable-on-device',
  checkedAt:now.toISOString(),windowStart:day(start),
  windowEnd:day(new Date(end.getTime()-1000)),completeCalendar:true,
  remindersStatus:'unavailable',reminders:[],events:mirror};
 const raw=JSON.stringify(snapshot);
 if(raw.length>16000){
  deviceCalendarStatus='Apple予定：安全な取込サイズ上限を超過';return null;
 }
 try{
  const scope={};new Function('window',nativeSource)(scope);
  const projected=scope.YOS_CALENDAR_NATIVE?.asDaystream({getItem:key=>
   key==='YOS_CALENDAR_NATIVE_SNAPSHOT_V1'?raw:null})||null;
  if(!projected||projected.status!=='ok'){
   deviceCalendarStatus='Apple予定：読み取り後の画面変換に失敗';return null;
  }
  deviceCalendarStatus='Apple予定：'+events.length+'件読取／'+mirror.length+'件表示対象';
  return projected;
 }catch(_){
  deviceCalendarStatus='Apple予定：読み取り後の画面変換に失敗';return null;
 }
}


// PRIVATE DAYSTREAM XL: DrawContext image saved only to Scriptable iCloud.
// The image contains on-device task and calendar titles, never credentials.
function yosXlRows(templates,calendar,now=new Date()){
 const begin=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
 const day=[begin.getFullYear(),String(begin.getMonth()+1).padStart(2,'0'),String(begin.getDate()).padStart(2,'0')].join('-');
 if(!Array.isArray(templates)||templates.length>40)throw Error('生活タスクの形式が不正');
 const rows=[],seen=new Set();
 function push(title,start,finish,source,done=false){
  const t=String(title||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,70);
  const a=Math.max(+begin,+start),b=Math.min(+end,+finish);
  if(!t||!Number.isFinite(a)||!Number.isFinite(b)||a>=b)return;
  const minute=Math.max(0,Math.min(1439,Math.floor((a-+begin)/60000)));
  const duration=Math.max(1,Math.ceil((b-a)/60000));
  const key=minute+'|'+duration+'|'+t;
  if(seen.has(key))return;seen.add(key);rows.push({title:t,minute,duration,source,done:done===true});
 }
 for(const t of templates){
  if(!t||typeof t.title!=='string')continue;
  const a=new Date(t.startAt),b=new Date(t.endAt),span=+b-+a;
  if(!Number.isFinite(+a)||!Number.isFinite(span)||span<=0||span>86400000)continue;
  if(t.repeat==='daily'){
   for(const offset of [-1,0]){
    const d=new Date(begin.getFullYear(),begin.getMonth(),begin.getDate()+offset,a.getHours(),a.getMinutes(),a.getSeconds());
    push(t.title,d,new Date(+d+span),'habit',t.done);
   }
  }else if(t.repeat==='once')push(t.title,a,b,'task',t.done);
 }
 const agenda=calendar?.calendarDays?.[day];
 if(Array.isArray(agenda))for(const e of agenda.slice(0,80)){
  const m=Number(e?.start),dur=Number(e?.duration);
  if(!Number.isFinite(m)||!Number.isFinite(dur)||m<0||m>=1440||dur<=0||m+dur>1440)continue;
  push(e.title||'予定',new Date(+begin+m*60000),new Date(+begin+(m+dur)*60000),'calendar');
 }
 const all=calendar?.allDayDays?.[day];
 if(Array.isArray(all))for(const name of all.slice(0,12)){
  const t=String(name||'').trim().slice(0,70);
  if(t&&!seen.has('allday|'+t)){seen.add('allday|'+t);rows.push({title:t,minute:-1,duration:1440,source:'calendar',done:false})}
 }
 const rank={calendar:0,habit:1,task:2};
 rows.sort((a,b)=>a.minute-b.minute||rank[a.source]-rank[b.source]||a.title.localeCompare(b.title,'ja'));
 return {schema:'yos-xl-private-v1',day,checkedAt:now.toISOString(),rows,notionConfirmed:true,calendarConfirmed:calendar?.status==='ok'};
}
function yosXlImage(snapshot){
 const c=new DrawContext();c.size=new Size(640,1040);c.respectScreenScale=false;c.opaque=true;
 const box=(x,y,w,h,hex)=>{c.setFillColor(new Color(hex));c.fillRect(new Rect(x,y,w,h))};
 const text=(s,x,y,w,h,size,hex,strong=false)=>{
  c.setFont(strong?Font.semiboldSystemFont(size):Font.regularSystemFont(size));
  c.setTextColor(new Color(hex));c.drawTextInRect(String(s),new Rect(x,y,w,h));
 };
 const clock=m=>m<0?'終日':String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 box(0,0,640,1040,'#F1F6FB');box(18,18,604,1004,'#FFFFFF');
 text('YOS / DAYSTREAM',48,40,520,38,23,'#51708C',true);
 text('今日のタイムライン',48,93,540,62,36,'#203955',true);
 text(snapshot.day.replace(/-/g,'/'),48,159,275,32,21,'#668099');
 text(snapshot.rows.length+'件の時間枠',408,159,190,32,20,'#668099');
 box(48,203,544,2,'#DCE6EF');
 const list=snapshot.rows.slice(0,8);
 if(!list.length){
  text('時刻を確認できる予定はありません',60,300,550,55,26,'#203955',true);
  text('DAYSTREAMの同期を確認してください',60,360,550,44,20,'#668099');
 }else{
  box(110,245,2,Math.max(0,list.length-1)*92,'#DDE7F0');
  list.forEach((r,i)=>{
   const y=225+i*92,accent=r.source==='calendar'?'#4586C8':r.source==='task'?'#9A78CC':'#2BA98B';
   text(clock(r.minute),45,y+25,67,31,18,'#36536C',true);
   box(105,y+29,14,14,accent);box(134,y,456,77,'#F6F9FC');box(134,y,5,77,accent);
   text(r.title,156,y+12,409,39,24,'#203955',true);
   text((r.source==='calendar'?'予定':r.source==='task'?'YOS Tasks':'習慣')+(r.done?'・完了':''),156,y+51,330,23,16,'#668099');
  });
 }
 if(snapshot.rows.length>list.length)text('ほか '+(snapshot.rows.length-list.length)+'件',48,938,240,28,18,'#668099');
 box(48,975,544,2,'#DCE6EF');
 const d=new Date(snapshot.checkedAt),hm=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
 text('取得 '+hm+' · YOS Tasks取得済 · Apple予定'+(snapshot.calendarConfirmed?'取得済':'未取得'),48,989,540,28,15,'#668099');
 return c.getImage();
}
function yosXlExport(templates,calendar){
 if(typeof DrawContext==='undefined'||typeof FileManager==='undefined')return {ok:false,reason:'画像API未対応'};
 const snapshot=yosXlRows(templates,calendar),img=yosXlImage(snapshot);
 const fm=FileManager.iCloud(),dir=fm.joinPath(fm.documentsDirectory(),'YOS_Widgets');
 if(!fm.fileExists(dir))fm.createDirectory(dir,false);
 const dest=fm.joinPath(dir,'YOS_DAYSTREAM_XL.png');
 // Only this new generated filename is replaced. Existing data is untouched.
 fm.writeImage(dest,img);
 if(!fm.fileExists(dest))throw Error('画像の保存確認ができません');
 return {ok:true,path:dest,count:snapshot.rows.length};
}

const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
function buildHTML(html,adapters,native,wizard,snapshot,directRows=[],deviceCalendar=null,calendarStatus='Apple予定：未確認'){
 if(!html.includes('// WEB_PORT_BOOT')||!html.includes('</script><script>\nconst tl=')||!html.includes('<script src="./task-wizard.js"></script>'))throw Error('DAYSTREAMの形式が一致しません');
 const json=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const directJSON=JSON.stringify(directRows).replace(/</g,'\\u003c');
 const deviceJSON=deviceCalendar?JSON.stringify(deviceCalendar).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'):null;
 let out=html.replace('<script src="./source-adapters.js"></script>','<script>'+safeScript(adapters)+'</script>')
 .replace('<script src="../../life/calendar/native-bridge.js"></script>','<script>'+safeScript(native)+'</script>')
 .replace('<script src="./yos-tasks-auth.js"></script>','')
 .replace('</script><script>\nconst tl=','</script><script>'+safeScript(BROWSER_BOOT.replace('__SNAPSHOT__',json).replace('__CALENDAR_STATUS__',JSON.stringify(clean(calendarStatus,100))))+'</script><script>'+safeScript(BROWSER_DIRECT_IMPORT.replace('__DIRECT_ROWS__',directJSON))+'</script><script>\nconst tl=')
 .replace('<script src="./task-wizard.js"></script>','<script>'+safeScript(wizard)+'</script>');
 const timelineAnchor='return [...calendarItems(day),...local,...clarity];';
 if(out.split(timelineAnchor).length!==2)throw Error('DAYSTREAMの時間割が変わりました');
 out=out.replace(timelineAnchor,'const calendar=calendarItems(day);const synced=window.YOS_ONE_TAP_FOR_DAY?.(day,[...calendar,...local,...clarity])||[];return [...calendar,...local,...clarity,...synced];');
 const badgeAnchor="badge.textContent='固定'";
 if(out.split(badgeAnchor).length!==2)throw Error('DAYSTREAMラベル形式が変わりました');
 out=out.replace(badgeAnchor,"badge.textContent=item.source==='YOS Tasks'?'同期':'固定'");
 const persistAnchor="x=>x.source!=='Apple Calendar'&&x.source!=='Clarity'";
 if(out.split(persistAnchor).length!==2)throw Error('DAYSTREAMのローカル保存対象が変わりました');
 out=out.replace(persistAnchor,"x=>x.source!=='Apple Calendar'&&x.source!=='Clarity'&&x.source!=='YOS Tasks'");
 const focusAnchor=' const reasons=latestCompatibility.get(item.id)?.reasons;';
 if(out.split(focusAnchor).length!==2)throw Error('DAYSTREAM詳細形式が変わりました');
 out=out.replace(focusAnchor," if(item.source==='YOS Tasks')fi.textContent=fmt(item.s)+'–'+fmt(item.s+item.d)+' · Notion YOS Tasksから同期。時刻はDAYSTREAM内で移動できます（この端末のみ・Notion原本は変更しません）。';\n"+focusAnchor);
 // Notion cards are moveable locally, but the source records remain immutable.
 // The standard gesture/move sheet is reused; no competing drag UI is installed.
 const nativePatches=[
  ["const fixed=!!item.f,canHide=fixed&&item.source==='Apple Calendar';",
   "const fixed=!!item.f||item.source==='YOS Tasks',canHide=!!item.f&&item.source==='Apple Calendar';"],
  ["document.getElementById('editSelected').hidden=!!fixed;",
   "document.getElementById('editSelected').hidden=!!item.f&&item.source!=='YOS Tasks';document.getElementById('editSelected').textContent=item.source==='YOS Tasks'?'時刻を移動':'編集';"],
  ["document.getElementById('editSelected').onclick=()=>beginLocalEdit(items.find(x=>x.id===selectedId));",
   "document.getElementById('editSelected').onclick=()=>{const item=items.find(x=>x.id===selectedId);if(item?.source==='YOS Tasks')openMoveDialog(item,item.s,null);else beginLocalEdit(item)};"],
  ["finish(true);beginLocalEdit(item);",
   "finish(true);if(item.source==='YOS Tasks')openMoveDialog(item,item.s,null);else beginLocalEdit(item);"],
  ["if(item.kind==='task'&&dx<0&&ax>ay*1.4&&event.cancelable)",
   "if(item.kind==='task'&&item.source!=='YOS Tasks'&&dx<0&&ax>ay*1.4&&event.cancelable)"],
  ["pendingMove={item,day:selectedDay,previousRect,plan:localStorage.getItem(yosPlanKey)};",
   "pendingMove={item,day:selectedDay,previousRect,plan:item.source==='YOS Tasks'?null:localStorage.getItem(yosPlanKey)};"],
  ["if(localStorage.getItem(yosPlanKey)!==plan){\n  moveDialog.close();",
   "if(item.source==='YOS Tasks'){const [hours,minutes]=moveTime.value.split(':').map(Number);const next=hours*60+minutes;if(!Number.isInteger(next)||next<0||next+item.d>1440||next===item.s)return;const saved=window.YOS_NOTION_LOCAL_MOVE?.(day,item.sourceRef,next,item.d)===true;if(saved)item.s=next;moveDialog.close();note.textContent=saved?'「'+item.t+'」を'+fmt(next)+'に移動しました（この端末だけ・Notion原本は不変）':'保存領域を利用できないため、移動を確定できません。元の予定は変更していません';smoothRender(item.id,saved?previousRect:null);updateReview();return;}\n if(localStorage.getItem(yosPlanKey)!==plan){\n   moveDialog.close();"],
  ["const theme=/就寝準備|読書|リラックス|会議/.test(item.t)?'violet':",
   "const theme=item.source==='YOS Tasks'&&item.flowTone?item.flowTone:/就寝準備|読書|リラックス|会議/.test(item.t)?'violet':"],
  ["if(item.t==='睡眠'||item.t==='就寝')el.classList.add('sleep');",
   "if(item.source==='YOS Tasks'){el.dataset.notion='1';const badge=document.createElement('span');badge.className='fixed-label';badge.textContent='同期';el.append(badge)}\n    if(item.t==='睡眠'||item.t==='就寝')el.classList.add('sleep');"]
 ];
 for(const [from,to] of nativePatches){
  if(out.split(from).length!==2)throw Error('DAYSTREAMの時刻移動・描画箇所が一致しません');
  out=out.replace(from,to);
 }
 if(deviceJSON){
  const marker=" const nativeCalendar=(()=>{try{return window.YOS_CALENDAR_NATIVE?.asDaystream(localStorage)||null}catch{return null}})();";
  if(!out.includes(marker))throw Error('DAYSTREAMのカレンダー接続箇所が一致しません');
  out=out.replace(marker," const nativeCalendar="+deviceJSON+";");
 }
 out=out.replace('<head>','<head><base href="https://yskn0008-bot.github.io/ProjectY/yos/daystream/">'+
  '<style>.timeline .card[data-notion="1"]{cursor:grab}.timeline .card[data-notion="1"] .task-drag-grip{touch-action:none;display:grid;place-items:center;min-width:34px;color:var(--flow-ink);background:#ffffff70;border-radius:9px}.timeline .card[data-notion="1"] .fixed-label{font-size:10px;opacity:.72}.timeline .card[data-notion="1"] .task-copy{min-width:0}.timeline .card[data-notion="1"].yos-backdrop{background-color:var(--flow-light)!important;border-color:var(--flow-edge)}</style>')
 .replace('<body class="yos-daystream-web">','<body class="yos-daystream-web"><div id="yosNativeBoot" role="status" style="position:fixed;inset:0;z-index:99999;background:#f4f8fd;color:#1d2d44;padding:80px 20px;font-family:-apple-system,sans-serif">DAYSTREAMを読み込んでいます…</div>');
 // Never start a service worker from the native HTML presentation.
 out=out.replace("if('serviceWorker' in navigator)","if(false)");
 if(/<script[^>]+src=/.test(out))throw Error('未解決の画面部品があります');
 return out;
}
async function asset(path,marker){
 const req=new Request(ROOT+path);req.timeoutInterval=20;const text=await req.loadString();
 if(req.response?.statusCode!==200||typeof text!=='string'||text.length>350000||!text.includes(marker))throw Error('画面部品を取得できません：'+path);
 return text;
}
// In Siri/Shortcuts, use shortcut output for errors instead of unsupported Alert.
async function showAlert(title,message){
 const output=title+'：'+message;
 if(typeof config!=='undefined'&&config.runsWithSiri){
  if(typeof Script!=='undefined'&&typeof Script.setShortcutOutput==='function')Script.setShortcutOutput(output);
  else console.warn(output);
  return;
 }
 try{
  const a=new Alert();a.title=title;a.message=message;a.addAction('閉じる');await a.presentAlert();
 }catch(error){
  // Never hide the original failure behind "Alerts are not supported in Siri".
  if(typeof Script!=='undefined'&&typeof Script.setShortcutOutput==='function')Script.setShortcutOutput(output);
  else console.warn(output);
 }
}
let stage='起動';
async function main(){
 stage='実行環境';
 // WebView.loadHTML is supported in Siri; only Alert is unsupported.
 stage='Notion認証';
 let token='';try{if(Keychain.contains(NOTION_KEY))token=Keychain.get(NOTION_KEY)||''}catch{}
 if(!token){await showAlert('Notion未接続','既存YOSのNotion接続情報がiPhone内に見つかりません。既存の接続設定を確認してください。');return}
 stage='Notion取得';
 const data=await readTasks(token);
 stage='画面部品の取得';
 const [html,adapters,native,wizard]=await Promise.all([
  asset('yos/daystream/index.html','// WEB_PORT_BOOT'),
  asset('yos/daystream/source-adapters.js','YOS_DAYSTREAM_SOURCES'),
  asset('life/calendar/native-bridge.js','YOS_CALENDAR_NATIVE'),
  asset('yos/daystream/task-wizard.js','YOS_TASK_WIZARD')
 ]);
 stage='データ変換';
 const scope={};new Function('window',adapters)(scope);
 const snapshot=scope.YOS_DAYSTREAM_SOURCES.fromYosTaskDashboardCache({savedAt:Date.now(),data});
 if(!snapshot)throw Error('Notionの取得結果を検証できません');
 // This payload contains only task projections; credentials never enter the WebView.
 const directRows=nativeDirectRows(data.tasks);
 const deviceCalendar=await readDeviceCalendar(native,data.tasks);
 // Export is best-effort: it cannot modify Notion or block the existing screen.
 try{yosXlExport(directRows,deviceCalendar)}
 catch(err){console.warn('DAYSTREAM XL画像作成未確認：'+clean(err?.message||err,100))}
 const output=buildHTML(html,adapters,native,wizard,snapshot,directRows,deviceCalendar,deviceCalendarStatus);
 stage='画面表示';
 await WebView.loadHTML(output,UI_BASE_URL,null,true);
}
// SCRIPTABLE_ENTRY
try{await main()}catch(error){
 const detail=clean(error?.message||error,180);
 await showAlert('DAYSTREAM 接続エラー','［'+stage+'］'+detail);
}
Script.complete();
