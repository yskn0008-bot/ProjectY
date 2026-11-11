// Variables used by Scriptable.
// icon-color: gray; icon-glyph: calendar;
// YOS_SCRIPT_NAME: YOS Timeline Charcoal 確認 20261111
// Standalone charcoal timeline candidate, sourced from approved Draft PR #667.
// Isolated local backup-safe plan file. Never modifies original Timeline, Glass, or Notion data.
'use strict';
const STORE_NAME='YOS_TIMELINE_CHARCOAL_VERIFY_20261111_v1.json';
const fm=FileManager.local(),path=fm.joinPath(fm.documentsDirectory(),STORE_NAME);
function validPlan(value){
 if(!value||value.version!==1||!value.days||typeof value.days!=='object'||Array.isArray(value.days))return false;
 const entries=Object.entries(value.days);if(entries.length>120)return false;
 return entries.every(([day,rows])=>/^\d{4}-\d\d-\d\d$/.test(day)&&Array.isArray(rows)&&rows.length<=150&&rows.every(e=>e&&Number.isInteger(Number(e.id))&&typeof e.t==='string'&&e.t.length>=1&&e.t.length<=120&&Number.isInteger(e.s)&&e.s>=0&&e.s<1440&&Number.isInteger(e.d)&&e.d>0&&e.d<=1440&&e.s+e.d<=1440&&['habit','task','schedule'].includes(e.kind)&&(!e.f||e.f===1)));
}
function key(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

const YOS_TASK_SOURCE='965c6086-32c1-463d-93b4-87a9cb69b3ad';
const YOS_NOTION_KEY='YOS_NOTION_INTEGRATION_TOKEN'; // Native Keychain only
const yosText=(x,n=120)=>String(x??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const yosRich=(p,type)=>Array.isArray(p?.[type])?yosText(p[type].map(v=>v.plain_text||v.text?.content||'').join('')):'';
const yosSelect=p=>yosText(p?.select?.name,32);
function yosParseTask(row){
 const p=row?.properties;if(!p||typeof row.id!=='string'||!/^[0-9a-f-]{32,36}$/i.test(row.id))return null;
 const title=yosRich(p['やること'],'title'),status=yosSelect(p['状態']);
 if(!title||['完了','中止','取消','キャンセル'].includes(status))return null;
 const area=yosSelect(p['領域'])||'未分類',priority=yosSelect(p['優先度']);
 const raw=p['期限']?.date?.start||'',due=/^\d{4}-\d\d-\d\d/.test(raw)?raw.slice(0,10):'';
 // Notion Task date is a deadline, never a committed fixed appointment slot.
 return {id:row.id.toLowerCase(),title,area,priority:['P0','P1','P2','P3'].includes(priority)?priority:'',status:status||'未確認',due,
 action:yosRich(p['次の一手'],'rich_text').slice(0,140)};
}
async function yosReadTaskSource(){
 let token='';try{if(Keychain.contains(YOS_NOTION_KEY))token=Keychain.get(YOS_NOTION_KEY)||''}catch{}
 if(!token)return {status:'unavailable',items:[],checkedAt:new Date().toISOString()};
 const rows=[],seen=new Set();let cursor=null,complete=false;
 try{
  for(let page=0;page<4;page++){
   const req=new Request('https://api.notion.com/v1/data_sources/'+YOS_TASK_SOURCE+'/query');
   req.method='POST';req.headers={Authorization:'Bearer '+token,'Content-Type':'application/json','Notion-Version':'2026-03-11',Accept:'application/json'};
   req.timeoutInterval=12;req.body=JSON.stringify({page_size:100,...(cursor?{start_cursor:cursor}:{})});
   const res=await req.loadJSON();
   if(req.response?.statusCode!==200||!Array.isArray(res?.results))throw Error('Notion read unavailable');
   for(const row of res.results){const x=yosParseTask(row);if(x&&!seen.has(x.id)){rows.push(x);seen.add(x.id)}}
   if(!res.has_more){complete=true;break}
   if(typeof res.next_cursor!=='string'||!res.next_cursor)throw Error('Notion cursor missing');
   cursor=res.next_cursor;
  }
  return {status:complete?'ok':'partial',items:rows.slice(0,400),checkedAt:new Date().toISOString()};
 }catch{return {status:'error',items:[],checkedAt:new Date().toISOString()};}
}
function yosReadHabits(){
 const empty={status:'unavailable',items:[]};
 try{
  const f=FileManager.local(),p=f.joinPath(f.documentsDirectory(),'YOS_HABIT_FLOW_v1.json');
  if(!f.fileExists(p))return empty;
  const raw=f.readString(p);if(typeof raw!=='string'||raw.length>65000)return {status:'error',items:[]};
  const parsed=JSON.parse(raw);
  if(parsed.schema!=='yos-habit-flow-v1'||parsed.version!==1||!parsed.lists)return {status:'error',items:[]};
  const items=[],seen=new Set();
  for(const period of ['daily','weekly','monthly','yearly']){
   const rows=parsed.lists[period];if(!Array.isArray(rows)||rows.length>40)return {status:'error',items:[]};
   for(const h of rows){
    if(!h||!/^[a-zA-Z0-9_-]{1,60}$/.test(h.id)||seen.has(h.id)||!['habit','anchor'].includes(h.kind)||typeof h.title!=='string'||!h.title||h.title.length>65)return {status:'error',items:[]};
    seen.add(h.id);
    if(period==='weekly'&&(!Array.isArray(h.weekdays)||h.weekdays.some(x=>!Number.isInteger(x)||x<0||x>6)))return {status:'error',items:[]};
    items.push({id:h.id,title:yosText(h.title,65),period,kind:h.kind,weekdays:period==='weekly'?h.weekdays:[],dayOfMonth:period==='monthly'?Number(h.dayOfMonth):null,monthDay:period==='yearly'?yosText(h.monthDay,5):'',trigger:yosText(h.timing||h.pair||'',45)});
   }
  }
  return {status:'ok',items};
 }catch{return {status:'error',items:[]}}
}

async function main(){
 const prior=fm.fileExists(path)?fm.readString(path):null;
 let state={version:1,days:{}};
 if(prior!==null){try{const parsed=JSON.parse(prior);if(!validPlan(parsed))throw Error('invalid plan');state=parsed}catch{throw Error('保存済みの検証データに問題があります。変更せず中止しました');}}
 let expected=prior;
 const calendarDays={};
 try{
   const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(start);end.setDate(start.getDate()+7);
   const records=await CalendarEvent.between(start,end);
   for(const event of records){if(event.isAllDay||!event.startDate||!event.endDate)continue;
     for(let n=0;n<7;n++){const a=new Date(start);a.setDate(start.getDate()+n);const b=new Date(a);b.setDate(a.getDate()+1);
       const first=Math.max(a.getTime(),event.startDate.getTime()),last=Math.min(b.getTime(),event.endDate.getTime());
       if(last<=first)continue;const d=key(a);(calendarDays[d]??=[]).push({title:String(event.title||'予定').slice(0,100),start:Math.floor((first-a.getTime())/60000),duration:Math.max(1,Math.round((last-first)/60000))});
     }
   }
 }catch(e){console.warn('Appleカレンダーは読み取り不可: '+String(e.message||e));}
 const [taskSource,habitSource]=await Promise.all([yosReadTaskSource(),Promise.resolve(yosReadHabits())]);
 const view=new WebView();
const html=`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>
:root{--bg:#353a44;--bg2:#3c414b;--text:#f5f7fb;--muted:#ccd3dd;--line:#a4aeba;--blue:#2b7db9;--green:#24966d;--violet:#833baf}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:radial-gradient(ellipse at 66% 6%,#464b56 0%,#353a44 50%,#30353f 100%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;font-size:14px;-webkit-font-smoothing:antialiased}
button,input,select{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #85ccff;outline-offset:2px}
.app{padding-top:env(safe-area-inset-top);padding-bottom:calc(89px + env(safe-area-inset-bottom));max-width:640px;margin:auto;min-height:100vh}
.top{padding:11px 18px 0}.headrow{display:flex;align-items:center;justify-content:space-between;gap:8px}.datehead{font-size:27px;letter-spacing:-.7px;font-weight:680;line-height:1.13;font-variant-numeric:tabular-nums}.subtitle{font-size:12px;color:#e0e4eb;margin-top:2px;font-weight:450}
.actions{display:flex;gap:12px;align-items:center}.iconbtn{width:31px;height:36px;display:grid;place-items:center;background:none;color:#f5f7fb;border:none;padding:0}.iconbtn svg{width:23px;height:23px;stroke-width:1.9}
.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin:11px 0 7px}.day{border:0;border-radius:10px;padding:5px 0 6px;color:#ebedf2;background:transparent;min-height:48px;display:grid;place-content:center;gap:2px}.day small{font-size:11px;font-weight:600}.day strong{font-size:21px;font-weight:590;line-height:1;font-variant-numeric:tabular-nums}.day.active{background:#2077b7;color:white}.day.today:not(.active) strong{text-decoration:underline;text-underline-offset:4px}
.summary{margin:0 13px 0;background:#ffffff12;border:1px solid #ffffff15;border-radius:14px;padding:9px 10px;display:grid;grid-template-columns:1.16fr .78fr .86fr 1.06fr;min-height:62px;box-shadow:0 5px 18px #11151b18}
.metric{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;border-right:1px solid #ffffff35;min-width:0}.metric:last-child{border:0}.metric label{font-size:10px;font-weight:560;white-space:nowrap;color:#e7eaf0;display:flex;align-items:center;justify-content:center;gap:4px}.metric label svg{width:13px;height:13px;stroke-width:1.7;flex:none}.metric strong{font-size:13px;font-weight:630;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;font-variant-numeric:tabular-nums}.metric:first-child{flex-direction:row;gap:7px}.metric:first-child strong{font-size:19px}.ring{width:37px;height:37px;flex:none;border-radius:50%;background:conic-gradient(#35bbf4 0 var(--pct),#7d8793 var(--pct) 100%);position:relative}.ring:after{content:"";position:absolute;inset:8px;background:#434852;border-radius:50%}.metric .stack{display:grid;gap:3px}
.notice{margin:0;padding:3px 0;color:#d7dce4;font-size:10px;line-height:1.25;flex:1;min-width:0}.microtools{display:flex;align-items:center;gap:8px;margin:3px 15px 0;min-height:23px}.zoomBtn{border:1px solid #ffffff40;background:#ffffff0d;color:#edf1f6;border-radius:7px;padding:4px 7px;font-size:10px;font-weight:600;white-space:nowrap}.notice[hidden]{display:none}.searchrow{margin:9px 16px 0}.searchrow[hidden]{display:none}.searchrow input{width:100%;border:1px solid #7b8799;border-radius:10px;background:#252b35;color:white;padding:10px 12px;font-size:14px}
.editor{display:none;margin:9px 14px;padding:13px;background:#484e59;border:1px solid #6b7583;border-radius:13px;box-shadow:0 10px 25px #15191e55}.editor.show{display:block}.editor b{font-size:15px}.editor .fields{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.editor input,.editor select{padding:9px;background:#303742;color:white;border:1px solid #7b8594;border-radius:8px;min-width:0}.editor input[type=time]{max-width:130px}.editor button,.focus button,.review button,.mutedbutton{padding:10px 13px;background:#277dbb;color:#fff;border:0;border-radius:9px;font-weight:670}.editor .danger{background:#754751;margin-left:6px}.editor .light{background:#647184}
.timeline-wrap{position:relative;margin:8px 13px 20px 11px;overflow:visible}.timeline{position:relative;touch-action:pan-y}.hour{position:absolute;left:0;right:0;border-top:1px solid #ffffff0f;height:1px;pointer-events:none}.hour span{position:absolute;top:-9px;left:6px;color:#dce2eb;font-size:12px;font-weight:480;font-variant-numeric:tabular-nums}.axis{position:absolute;left:58px;top:0;bottom:0;width:1.5px;background:#c2cad2b8;pointer-events:none}.tick{position:absolute;left:54.5px;width:9px;height:9px;border-radius:50%;background:#dce2ec;z-index:2;border:2px solid #56616e;box-shadow:0 0 0 2px #d7dee755;pointer-events:none}
.card{position:absolute;left:73px;right:0;min-height:16px;border:0;border-radius:9px;padding:1px 9px;display:flex;align-items:center;gap:8px;touch-action:none;user-select:none;-webkit-user-select:none;color:#f8faff;background:#307ec2;box-shadow:0 2px 8px #101b2927;transition:filter .18s ease,box-shadow .18s ease;will-change:transform;overflow:hidden}
.card:before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:#46b9fb;opacity:.9;pointer-events:none}.card.habit{background:#24976e}.card.habit:before{background:#4bd9a1}.card.task{background:#823db0}.card.task:before{background:#d079f8}.card.schedule{background:#2e77b3}
.card.neutral{background:#636b76}.card.neutral:before{background:#97a6b9}.card.sleep{background:#325477}.card.sleep:before{background:#48bdf5}.card.sleep:not(.tiny) b,.card.sleep:not(.tiny) svg{transform:translateY(-9px)}.card.sleep:not(.tiny) small{position:absolute;top:calc(50% + 4px);left:38px;margin:0;font-size:11px;transform:translateY(0)}
.card.done{opacity:.62;filter:saturate(.55)}.card.selected{outline:1.5px solid #e5efff}.card.warning{outline:2px solid #e6a35a}.card.moving{z-index:6;filter:brightness(1.14);box-shadow:0 10px 26px #10131a6c}
.card svg{width:16px;height:16px;flex:none;stroke:#f7f9fc;fill:none;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round;position:relative}.card b{font-size:12.5px;line-height:1.1;font-weight:630;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.08px;position:relative}.card small{margin-left:auto;font-size:10px;line-height:1.1;font-weight:500;white-space:nowrap;font-variant-numeric:tabular-nums;flex-shrink:0;position:relative}
.card.compact{border-radius:7px}.card.compact b{font-size:12px}.card.compact small{font-size:9px}.card.lane{gap:5px;padding-right:5px}.card.lane small{display:none}.card.lane b{font-size:12px}.card.tiny svg{width:13px;height:13px}.card.tiny{gap:5px;padding-left:7px}.card.tiny b{font-size:11px}.card.tiny small{font-size:9px}
.nowline{position:absolute;left:5px;right:0;height:1.5px;background:#48baff;z-index:8;pointer-events:none;box-shadow:0 0 8px #38b6fa66}.nowline:before{content:"";position:absolute;left:48px;top:-5px;width:10px;height:10px;background:#43b9fc;border:2px solid #eff9ff;border-radius:50%}.nowbadge{position:absolute;right:calc(100% - 55px);top:-11px;background:#218fcf;border-radius:12px;font-size:11px;padding:3px 7px;font-weight:650;font-variant-numeric:tabular-nums}
.review,.tabbox{display:none;margin:12px 14px;padding:17px;border:1px solid #ffffff22;border-radius:13px;background:#484e58}.review.show,.tabbox.show{display:block}.review h3,.tabbox h3{font-size:16px;margin:0 0 10px}.review p,.tabbox p{line-height:1.6;color:#eff2f6;margin:10px 0}.review .muted,.tabbox .muted{font-size:12px;color:#c5cbd5}.listitem{padding:12px 0;border-bottom:1px solid #ffffff25;display:flex;justify-content:space-between;gap:14px}.listitem:last-child{border-bottom:0}.listitem button{border:0;background:#2d7eb9;color:white;padding:5px 10px;border-radius:8px}.focus{position:fixed;bottom:calc(87px + env(safe-area-inset-bottom));left:14px;right:14px;max-width:600px;margin:auto;padding:12px 14px;border-radius:14px;background:#505864;border:1px solid #a6b8cd;box-shadow:0 10px 35px #0008;z-index:20;display:none}.focus.show{display:block}.focus b{font-size:16px}.focus p{font-size:12px;margin:6px 0 9px}.focus .secondary{background:#6c7785}.focus .danger{background:#794852}
.dock{position:fixed;bottom:0;left:0;right:0;padding:9px 7px calc(11px + env(safe-area-inset-bottom));background:#30353eea;border-top:1px solid #ffffff28;backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);z-index:15}.dock-inner{max-width:610px;margin:auto;display:grid;grid-template-columns:repeat(5,1fr)}.tab{display:grid;justify-items:center;align-content:center;gap:5px;background:none;border:0;color:#eef1f6;font-size:10px;padding:3px 0;min-height:52px}.tab svg{height:24px;width:24px;stroke-width:1.8}.tab.active{color:#30baff}
button:active{opacity:.8}@media(min-width:640px){.dock{left:calc((100vw - 640px)/2);right:calc((100vw - 640px)/2);border-radius:14px 14px 0 0}.focus{left:calc((100vw - 610px)/2);right:calc((100vw - 610px)/2)}}
@media(max-width:350px){.metric label{font-size:9px}.metric strong{font-size:11px}.metric:first-child strong{font-size:17px}.card{left:69px;padding-right:6px}.card small{font-size:9px}.axis{left:55px}.tick{left:51.5px}.nowline:before{left:45px}}
.yos-source-row{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #ffffff22;padding:9px 0}.yos-source-row b{display:block;font-size:13px;line-height:1.45}.yos-source-row small{display:block;font-size:11px;color:#ccd5df;line-height:1.5}.yos-source-row button,#yosPlanBox button,#yosPlanAll{border:1px solid #83b8e4;border-radius:9px;background:#367ea9;color:white;padding:8px 9px;font-size:12px;flex-shrink:0}.tabbox h3:not(:first-child){margin-top:18px}.tabbox input[type=time]{background:#303843;color:white;border:1px solid #94a2b4;border-radius:8px;padding:7px;margin:7px 0}#yosPlanBox:not(:empty){padding:8px 10px;margin:7px 0;border-radius:9px;background:#323f4d}
</style></head><body>
<div class="app">
  <div class="top">
    <div class="headrow"><div><div class="datehead" id="dateTitle">今日</div><div class="subtitle" id="dayCaption">Today</div></div>
      <div class="actions">
        <button class="iconbtn" id="dateBtn" aria-label="日付を選択"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg></button>
        <button class="iconbtn" id="searchBtn" aria-label="検索"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg></button>
        <button class="iconbtn" id="addBtn" aria-label="予定を追加"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M4 12h16"/></svg></button>
        <button class="iconbtn" id="moreBtn" aria-label="メニュー"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></button>
      </div>
    </div>
    <div class="week" id="weekStrip" aria-label="日付切り替え"></div>
    <input type="date" id="datePicker" hidden aria-label="表示日付">
  </div>
  <section class="summary" aria-label="今日の概要">
    <div class="metric"><span class="ring" id="progressRing" style="--pct:0%"></span><span class="stack"><label>今日の進捗</label><strong id="todayProgress">—</strong></span></div>
    <div class="metric"><label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="m8 11 2 2 5-5m-7 8h8"/></svg>タスク</label><strong id="taskCount">—</strong></div>
    <div class="metric"><label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-6 4 12 3-6h6"/></svg>体調</label><strong id="healthInfo">未記録</strong></div>
    <div class="metric"><label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16A8 8 0 0 1 8 4 8 8 0 1 0 20 16Z"/></svg>睡眠予定</label><strong id="sleepInfo">—</strong></div>
  </section>
  <div class="searchrow" id="searchRow" hidden><input id="searchInput" type="search" placeholder="予定・タスクを検索" aria-label="検索"></div>
  <div class="microtools"><div class="notice" id="notice" aria-live="polite">端末内の予定を表示します</div><button class="zoomBtn" id="zoomBtn" type="button" aria-label="タイムラインの表示倍率を切り替え">詳細に拡大</button></div>
  <div class="editor" id="editor"><b id="editorTitle">予定を追加</b><div class="fields"><input id="newTitle" placeholder="名前" style="flex:1 1 160px" aria-label="名前"><input id="newTime" type="time" value="10:00" aria-label="開始時刻"><input id="newDuration" type="number" min="5" max="1440" step="5" value="30" style="width:76px" aria-label="所要時間（分）"><select id="newKind" aria-label="種類"><option value="task">タスク</option><option value="habit">習慣</option><option value="schedule">予定</option></select></div><button id="saveBtn">追加する</button><button id="cancelEditor" class="light" type="button">閉じる</button></div>
  <div class="timeline-wrap" id="timelinePanel"><div class="timeline" id="tl"><div class="axis"></div><div class="nowline" id="nowLine" hidden><span class="nowbadge" id="nowBadge"></span></div></div></div>
  <section class="tabbox" id="taskPanel"><h3>タスク・未配置</h3><p class="muted">専門タスクの期限と、実行する時間は別。配置しても元データの期限・完了は変わりません。</p>
 <div id="taskList"></div><h3>各専門ページから集約</h3><p class="muted" id="yosTaskSourceStatus">Notion Tasks：確認中</p>
 <label for="yosStartFrom">配置提案の開始時刻</label><input id="yosStartFrom" type="time" value="09:00" aria-label="配置提案の開始時刻">
 <button id="yosPlanAll" type="button">上位3件をまとめて配置提案</button><div id="yosPlanBox" aria-live="polite"></div><div id="yosSourceTasks"></div>
 <h3>繰り返し習慣</h3><p class="muted" id="yosHabitSourceStatus">習慣：確認中</p><div id="yosHabitTasks"></div></section>
  <section class="review" id="review"><h3>一日の振り返り</h3><p id="reviewText">端末内の完了記録を集計します。</p><p id="reviewTip"></p><p class="muted">予定時間と実績時間は異なります。Notionの完了状態には反映しません。</p><button id="reviewBtn">再集計</button></section>
  <section class="tabbox" id="recordsPanel"><h3>記録</h3><p>このタイムライン内で完了にした項目のみを表示します。</p><div id="recordsList"></div></section>
  <section class="tabbox" id="aiPanel"><h3>AIプラン</h3><p>AIとの連携は未実装です。実行状況を確認せずに予定の自動変更はしません。</p><p class="muted">追加や時間変更はタイムラインで手動操作できます。</p></section>
  <div class="focus" id="focus"><b id="focusTitle"></b><p id="focusInfo"></p><button id="doneBtn">完了にする</button><button id="editSelected" class="secondary">編集</button><button id="deleteSelected" class="danger">削除</button><button id="closeFocus" class="secondary">閉じる</button></div>
</div>
<nav class="dock" aria-label="画面切り替え"><div class="dock-inner">
  <button class="tab active" data-tab="timeline"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg><span>タイムライン</span></button>
  <button class="tab" data-tab="task"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg><span>タスク</span></button>
  <button class="tab" data-tab="analysis"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20v-7h4v7m4 0V4h4v16m4-9v9"/></svg><span>分析</span></button>
  <button class="tab" data-tab="records"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg><span>記録</span></button>
  <button class="tab" data-tab="ai"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/></svg><span>AIプラン</span></button>
</div></nav><script>
const tl=document.getElementById('tl'),note=document.getElementById('notice'),focus=document.getElementById('focus'),ft=document.getElementById('focusTitle'),fi=document.getElementById('focusInfo');
const demoItems=[{id:1,t:'睡眠',s:0,d:390,f:1,kind:'habit'},{id:2,t:'朝の準備',s:390,d:30,kind:'habit'},{id:3,t:'朝食',s:420,d:30,kind:'habit'},{id:4,t:'ウォーキング',s:510,d:30,kind:'habit'},{id:5,t:'集中作業',s:600,d:90,kind:'task'},{id:6,t:'昼食',s:720,d:45,kind:'habit'},{id:7,t:'会議',s:840,d:60,f:1,kind:'schedule'},{id:8,t:'仕事',s:930,d:90,kind:'schedule'},{id:9,t:'運動',s:1050,d:60,kind:'habit'},{id:10,t:'夕食',s:1140,d:45,kind:'habit'},{id:11,t:'入浴',s:1200,d:45,kind:'habit'},{id:12,t:'読書',s:1260,d:45,kind:'task'},{id:13,t:'就寝準備',s:1320,d:60,kind:'habit'}];
const localISO=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
// Isolated native Scriptable file bridge; legacy WebView localStorage is never read or modified.
const boot=window.YOS_CHARCOAL_BOOT||{},savedDays=boot.days&&typeof boot.days==='object'?boot.days:{};
const todayISO=localISO(new Date()),calendarByDay=boot.calendarDays||{};
const calendarItems=day=>(Array.isArray(calendarByDay[day])?calendarByDay[day]:[]).map((x,i)=>({id:200000000+i,t:String(x.title||'予定'),s:Number(x.start),d:Number(x.duration),f:1,kind:'schedule',source:'Apple Calendar'})).filter(x=>Number.isFinite(x.s)&&Number.isFinite(x.d)&&x.s>=0&&x.d>0&&x.s+x.d<=1440);
const calendarRows=Array.isArray(calendarByDay[todayISO])?calendarByDay[todayISO]:[];
const initialItems=calendarItems(todayISO);
let stored=Object.prototype.hasOwnProperty.call(savedDays,todayISO)?savedDays[todayISO]:null;
const dayItems=day=>[...calendarItems(day),...(Array.isArray(savedDays[day])?savedDays[day]:[]).filter(x=>x.source!=='Apple Calendar').map(x=>({...x}))];
let selectedDay=todayISO,isSample=false,items=dayItems(todayISO);
const pendingSaves=[];let saveCallback=null;
window.YOS_CHARCOAL_ATTACH_SAVE=callback=>{if(pendingSaves.length)callback(pendingSaves.shift());else saveCallback=callback;};
window.YOS_CHARCOAL_SAVE_ACK=ok=>{note.textContent=ok?'端末内ファイルへ保存しました':'保存できませんでした。再起動後は前の状態に戻ります。';};
const persist=()=>{try{savedDays[selectedDay]=items.filter(x=>x.source!=='Apple Calendar').map(x=>({...x}));pendingSaves.push(JSON.stringify({version:1,days:savedDays}));if(saveCallback){const callback=saveCallback;saveCallback=null;callback(pendingSaves.shift());}isSample=false;return true}catch(e){note.textContent='保存処理に失敗しました';return false}};
const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');

const taskSource=boot.taskSource||{status:'unavailable',items:[]},habitSource=boot.habitSource||{status:'unavailable',items:[]};
const sourceTasks=Array.isArray(taskSource.items)?taskSource.items.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'):[];
const sourceHabits=Array.isArray(habitSource.items)?habitSource.items.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'):[];
const planBox=document.getElementById('yosPlanBox'),taskFeed=document.getElementById('yosSourceTasks'),habitFeed=document.getElementById('yosHabitTasks');
const yosStatusWord=x=>x==='ok'?'取得済み':x==='partial'?'一部のみ取得':x==='unavailable'?'未接続':'取得エラー';
const yosTaskRank=x=>({P0:0,P1:10,P2:20,P3:30}[x.priority]??40);
function yosEligibleHabits(day){
 const d=parseDay(day);return sourceHabits.filter(x=>x.kind==='habit'&&(x.period==='daily'||x.period==='weekly'&&x.weekdays.includes(d.getDay())||x.period==='monthly'&&x.dayOfMonth===d.getDate()||x.period==='yearly'&&x.monthDay===day.slice(5)));
}
const yosIsPlanned=ref=>items.some(x=>x.sourceRef===ref);
// YOS_UNIFIED_SLOT_START
function yosFindSlot(occupied,start,duration){
 if(!Number.isInteger(start)||!Number.isInteger(duration)||duration<5||duration>240)return null;
 const candidate=Math.max(0,Math.ceil(start/15)*15);
 for(let minute=candidate;minute+duration<=1440;minute+=15){
  // Keep at least a 15-minute buffer around previously scheduled time blocks.
  if(!occupied.some(x=>Number.isFinite(x.s)&&Number.isFinite(x.d)&&minute<x.s+x.d+15&&x.s-15<minute+duration))return minute;
 }
 return null;
}
// YOS_UNIFIED_SLOT_END
function yosAddRow(container,title,description,onClick){
 const row=document.createElement('div');row.className='yos-source-row';
 const body=document.createElement('div'),name=document.createElement('b'),meta=document.createElement('small');
 name.textContent=title;meta.textContent=description;body.append(name,meta);row.append(body);
 const button=document.createElement('button');button.textContent='時間を提案';button.onclick=onClick;row.append(button);container.append(row);
}
function yosRenderSources(){
 taskFeed.textContent='';habitFeed.textContent='';
 const status=document.getElementById('yosTaskSourceStatus');
 status.textContent='Notion Tasks：'+yosStatusWord(taskSource.status)+(taskSource.status==='ok'||taskSource.status==='partial'?'（取得 '+sourceTasks.length+'件・先頭80件を表示）':'')+(taskSource.checkedAt?' · '+new Date(taskSource.checkedAt).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'');
 const live=sourceTasks.filter(x=>!['待ち','保留'].includes(x.status));
 live.sort((a,b)=>yosTaskRank(a)-yosTaskRank(b)||String(a.due||'9999').localeCompare(String(b.due||'9999'))||a.title.localeCompare(b.title,'ja'));
 const pending=live.filter(x=>!yosIsPlanned('notion:'+x.id)).slice(0,80);
 if(!pending.length){const p=document.createElement('p');p.className='muted';p.textContent=taskSource.status==='ok'?'未配置の対象タスクはありません':'タスクは未取得・要確認';taskFeed.append(p)}
 for(const x of pending){
  const expired=x.due&&x.due<selectedDay;
  const info=x.area+' · '+(x.priority||'優先度未設定')+' · '+(x.due?(expired?'期限経過・要確認 ':'期限 ')+x.due:'期限未設定')+(x.status==='本人操作'?' · 本人操作':'');
  yosAddRow(taskFeed,x.title,info,()=>yosPropose(x,'task'));
 }
 const habitStatus=document.getElementById('yosHabitSourceStatus');habitStatus.textContent='習慣：'+yosStatusWord(habitSource.status);
 const habits=yosEligibleHabits(selectedDay).filter(x=>!yosIsPlanned('habit:'+x.id)).slice(0,40);
 if(!habits.length){const p=document.createElement('p');p.className='muted';p.textContent=habitSource.status==='ok'?'未配置の反復習慣はありません':'習慣データは未取得';habitFeed.append(p)}
 for(const x of habits)yosAddRow(habitFeed,x.title,(x.trigger||'実施するきっかけ未設定')+' · '+x.period,()=>yosPropose(x,'habit'));
}

// YOS_UNIFIED_BATCH_START
function yosBatchPlan(tasks,occupied,start,day){
 if(!Number.isInteger(start)||start<0||start>1439||!/^\d{4}-\d\d-\d\d$/.test(day))return [];
 const dayCount=x=>Math.round(Date.UTC(...x.split('-').map(Number).map((n,i)=>i===1?n-1:n))-Date.UTC(...day.split('-').map(Number).map((n,i)=>i===1?n-1:n)))/86400000;
 const score=x=>{
  const delta=x.due?dayCount(x.due):null;
  const urgent=delta===null?45:delta<0?0:delta===0?2:delta===1?12:delta<=3?22:delta<=7?32:50;
  return urgent+({P0:0,P1:10,P2:20,P3:30}[x.priority]??40);
 };
 const active=tasks.filter(x=>x&&x.id&&x.title&&!['待ち','保留'].includes(x.status)&&(!x.due||dayCount(x.due)>=-7));
 active.sort((a,b)=>score(a)-score(b)||String(a.due||'9999').localeCompare(String(b.due||'9999'))||a.title.localeCompare(b.title,'ja'));
 const slots=Math.ceil((1440-start)/15);
 let free=0;
 for(let i=0;i<slots;i++){const m=start+i*15;if(m>=1440)break;if(!occupied.some(x=>Number.isFinite(x.s)&&Number.isFinite(x.d)&&m<x.s+x.d&&x.s<m+15))free+=15}
 // At least 30% of free time is not allocated by the automatic batch proposal.
 const maxCommit=Math.floor(free*.7);
 const working=occupied.map(x=>({s:x.s,d:x.d,f:x.f})),result=[];
 let used=0;
 for(const task of active){
  if(result.length===3||used+45>maxCommit)break;
  const at=yosFindSlot(working,start,30);if(at===null)break;
  result.push({task,at,d:30});working.push({s:at,d:30});used+=45;
 }
 return result;
}
// YOS_UNIFIED_BATCH_END
function yosProposeBatch(){
 planBox.textContent='';
 const value=document.getElementById('yosStartFrom').value.split(':').map(Number);
 if(value.length!==2||value.some(x=>!Number.isInteger(x))||value[0]<0||value[0]>23||value[1]<0||value[1]>59){planBox.textContent='開始時刻を確認してください';return}
 const day=selectedDay,from=value[0]*60+value[1],candidates=sourceTasks.filter(x=>!yosIsPlanned('notion:'+x.id));
 const proposals=yosBatchPlan(candidates,items,from,day);
 if(!proposals.length){planBox.textContent='提案できる候補がありません。時間・未配置タスク・取得状態を確認してください。';return}
 const title=document.createElement('p');title.textContent='期限と優先度を参考にした仮配置（上位'+proposals.length+'件）。所要時間は各30分の仮設定、空き時間の30%以上を保留します。';planBox.append(title);
 for(const v of proposals){const p=document.createElement('p');p.textContent=v.task.area+'：'+v.task.title+'　'+fmt(v.at)+'–'+fmt(v.at+v.d)+(v.task.due?' · 期限 '+v.task.due:'');planBox.append(p)}
 const button=document.createElement('button');button.textContent='まとめてこの配置を採用';button.onclick=()=>{
  if(selectedDay!==day){planBox.textContent='表示日が変わりました。再提案してください';return}
  const proposed=yosBatchPlan(sourceTasks.filter(x=>!yosIsPlanned('notion:'+x.id)),items,from,day);
  if(JSON.stringify(proposed.map(x=>[x.task.id,x.at,x.d]))!==JSON.stringify(proposals.map(x=>[x.task.id,x.at,x.d]))){planBox.textContent='予定が変わりました。再提案してください';return}
  const occupied=[...items];
  for(const p of proposals){
   if(yosIsPlanned('notion:'+p.task.id)||yosFindSlot(occupied,p.at,p.d)!==p.at){planBox.textContent='空き枠が変わりました。再提案してください';return}
   occupied.push({s:p.at,d:p.d});
  }
  let nextId=Math.max(300000000,...items.map(x=>Number(x.id)||0));
  for(const p of proposals){const t=p.task;items.push({id:++nextId,t:t.title,s:p.at,d:p.d,kind:'task',source:'Notion Tasks',sourceRef:'notion:'+t.id,area:t.area,due:t.due||'',done:false})}
  const saved=persist();planBox.textContent=saved?'提案枠を端末内にまとめて保存しました。元の期限や状態は変更していません。':'保存準備に失敗しました';
  smoothRender();updateReview();yosRenderSources();
 };
 planBox.append(button);
}
document.getElementById('yosPlanAll').onclick=yosProposeBatch;

function yosPropose(item,kind){
 planBox.textContent='';
 const startParts=document.getElementById('yosStartFrom').value.split(':').map(Number);
 if(startParts.length!==2||!Number.isInteger(startParts[0])||!Number.isInteger(startParts[1])||startParts[0]>23||startParts[1]>59){planBox.textContent='提案開始時刻を確認してください';return}
 const start=startParts[0]*60+startParts[1],duration=kind==='habit'?15:30,at=yosFindSlot(items,start,duration);
 if(at===null){planBox.textContent='空き枠がありません。開始時刻や既存配置を確認してください。';return}
 const proposedDay=selectedDay,due=kind==='task'?item.due:'',expired=due&&due<selectedDay,ref=(kind==='task'?'notion:':'habit:')+item.id;
 const summary=document.createElement('p');summary.textContent='配置案：'+item.title+' · '+fmt(at)+'–'+fmt(at+duration)+'（所要時間'+duration+'分は仮設定）'+(expired?' · 期限経過を要確認':'')+'。元の期限と予定は変更しません。';planBox.append(summary);
 const confirm=document.createElement('button');confirm.textContent='この配置を採用';confirm.onclick=()=>{
  if(selectedDay!==proposedDay){planBox.textContent='表示日が変わりました。提案し直してください';return}
  if(yosIsPlanned(ref)){planBox.textContent='すでに配置済みです';return}
  // Recompute at acceptance to avoid colliding with an intervening manual edit.
  const fresh=yosFindSlot(items,at,duration);if(fresh!==at){planBox.textContent='指定した時間に空きがありません。提案し直してください';return}
  const rec={id:Math.max(300000000,...items.map(x=>Number(x.id)||0))+1,t:item.title,s:fresh,d:duration,kind,source:kind==='task'?'Notion Tasks':'YOS習慣',sourceRef:ref,area:kind==='task'?item.area:'習慣',due:due||'',done:false};
  items.push(rec);const saved=persist();
  planBox.textContent=saved?'端末の時間割へ配置しました。元データは変更していません。':'保存準備に失敗しました';
  smoothRender();updateReview();yosRenderSources();
 };
 planBox.append(confirm);
}
function yosDefaultStart(){
 const n=new Date(),from=selectedDay===localISO(n)?Math.min(23*60,Math.ceil((n.getHours()*60+n.getMinutes()+15)/15)*15):9*60;
 document.getElementById('yosStartFrom').value=fmt(from);
}

let searchText='';
const glyphs={
 sleep:'<path d="M3 19V6m0 10h18m-16 0V8h11a4 4 0 0 1 4 4v4"/>',
 walk:'<circle cx="13" cy="4" r="2"/><path d="m7 21 4-6-2-3-4 2m4-2 3-5 4 2 2 3m-6 3 5 6"/>',
 meal:'<path d="M4 3v7m3-7v7m3-7v7M7 10v11M17 3v18m0-18c-4 2-4 9 0 10"/>',
 work:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
 laptop:'<rect x="5" y="4" width="14" height="12" rx="1"/><path d="M2 20h20l-2-4H4z"/>',
 meeting:'<circle cx="12" cy="6" r="3"/><path d="M6 20v-3a6 6 0 0 1 12 0v3M4 9H2m20 0h-2"/>',
 fitness:'<path d="M3 9v6m3-9v12m12-12v12m3-9v6M6 12h12"/>',
 bath:'<path d="M3 13h18l-2 7H5zM7 10c-3-3 3-4 0-7m6 7c-3-3 3-4 0-7m6 7c-3-3 3-4 0-7"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>'};
function eventIcon(item){const t=item.t||'';const type=/睡眠|就寝/.test(t)?'sleep':/歩|ウォーキング/.test(t)?'walk':/朝食|昼食|夕食|ご飯/.test(t)?'meal':/入浴|お風呂/.test(t)?'bath':/運動|筋トレ/.test(t)?'fitness':/会議/.test(t)?'meeting':/集中|作業/.test(t)?'laptop':/仕事/.test(t)?'work':'clock';return '<svg viewBox="0 0 24 24" aria-hidden="true">'+glyphs[type]+'</svg>'}
let density='overview',scale=27;
let zoom=null,selectedId=null;
const yFor=m=>m/60*scale;
const editor=document.getElementById('editor');let editingId=null;
document.getElementById('addBtn').onclick=()=>{editingId=null;document.getElementById('editorTitle').textContent='予定を追加';document.getElementById('saveBtn').textContent='追加する';editor.classList.add('show');document.getElementById('newTitle').focus();};
document.getElementById('cancelEditor').onclick=()=>editor.classList.remove('show');
document.getElementById('saveBtn').onclick=()=>{const title=document.getElementById('newTitle').value.trim(),parts=document.getElementById('newTime').value.split(':').map(Number),duration=Number(document.getElementById('newDuration').value),kind=document.getElementById('newKind').value;if(!title||parts.length!==2||!Number.isFinite(duration)||duration<5||duration>1440){note.textContent='名前・時刻・所要時間を確認してください';return}const start=parts[0]*60+parts[1];if(start+duration>1440){note.textContent='終了時刻は24:00以内にしてください';return}if(editingId!==null){const item=items.find(x=>x.id===editingId);if(item){if(item.f){note.textContent='固定予定は編集できません';return;}Object.assign(item,{t:title,s:start,d:duration,kind});}}else{if(isSample){items=[];isSample=false;}items.push({id:Math.max(300000000,...items.map(x=>Number(x.id)||0))+1,t:title,s:start,d:duration,kind});}editingId=null;editor.classList.remove('show');document.getElementById('newTitle').value='';note.textContent=fmt(start)+' に「'+title+'」を'+(editingId===null?'保存':'更新')+(persist()?'（保存処理中）':'（保存処理失敗）');smoothRender();updateReview()};
function updateReview(){const done=items.filter(x=>x.done),pending=items.filter(x=>!x.done),movable=items.filter(x=>!x.f),completed=movable.filter(x=>x.done);const pct=movable.length?Math.round(completed.length/movable.length*100):0;const used=done.reduce((n,x)=>n+x.d,0);let summary=done.length?'完了記録は'+done.length+'件（合計'+Math.round(used/60*10)/10+'時間）。可動タスクの達成率は'+pct+'%。':'完了記録がまだありません。予定の配置だけでは実行できたか判断できません。';const overlaps=[];const sorted=[...items].sort((a,b)=>a.s-b.s);for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length&&sorted[j].s<sorted[i].s+sorted[i].d;j++)if(sorted[i].kind===sorted[j].kind&&sorted[i].kind!=='schedule')overlaps.push([sorted[i],sorted[j]]);const pair=overlaps[0];const tip=pair?'改善候補：「'+pair[0].t+'」と「'+pair[1].t+'」は時間が重なっています。同じ種類の作業としてまとめられるか確認すると、切り替えの手間を減らせる可能性があります。':'改善候補：タスクの統合を提案する根拠がまだ不足しています。完了状況と実際の所要時間を記録すると、翌日の改善案を具体化できます。';document.getElementById('reviewText').textContent=summary+' '+(pending.length?'未完了・未確認は'+pending.length+'件。予定の変更と完了は区別して評価します。':'全項目に完了記録があります。');document.getElementById('reviewTip').textContent=tip;updateOverview();renderLists();}document.getElementById('reviewBtn').onclick=updateReview;document.getElementById('doneBtn').onclick=()=>{const x=items.find(x=>x.id===selectedId);if(!x)return;if(x.f){note.textContent='固定予定は元カレンダーで管理してください';return}x.done=!x.done;document.getElementById('doneBtn').textContent=x.done?'未完了に戻す':'完了にする';note.textContent=x.t+(x.done?'を端末内で仮完了':'の端末内の完了を解除')+(persist()?'（保存処理中）':'（保存処理失敗）');smoothRender();updateReview()};

function updateOverview(){
 const movable=items.filter(x=>!x.f),done=movable.filter(x=>x.done),pct=movable.length?Math.round(done.length/movable.length*100):0;
 document.getElementById('progressRing').style.setProperty('--pct',pct+'%');
 document.getElementById('todayProgress').textContent=pct+'%';
 const ts=items.filter(x=>x.kind==='task');document.getElementById('taskCount').textContent=ts.filter(x=>x.done).length+'/'+ts.length;
 const sleep=items.find(x=>/睡眠|就寝/.test(x.t));document.getElementById('sleepInfo').textContent=sleep?Math.floor(sleep.d/60)+'時間'+(sleep.d%60?String(sleep.d%60)+'分':''):'—';
 document.getElementById('healthInfo').textContent='未記録';
}
function parseDay(iso){const p=iso.split('-').map(Number);return new Date(p[0],p[1]-1,p[2],12);}
function showDay(iso){
 if(!/^\d{4}-\d\d-\d\d$/.test(iso)||Number.isNaN(parseDay(iso).getTime()))return;
 if(iso===selectedDay)return;
 selectedDay=iso;const data=Object.prototype.hasOwnProperty.call(savedDays,iso)?savedDays[iso]:null;
 items=dayItems(iso);
 isSample=false;
 selectedId=null;zoom=null;focus.classList.remove('show');editor.classList.remove('show');
 yosDefaultStart();planBox.textContent='';yosRenderSources();
 note.textContent='端末の時間割 · Notion Tasks '+yosStatusWord(taskSource.status)+' · 習慣 '+yosStatusWord(habitSource.status);
 renderWeek();render();updateReview();window.scrollTo({top:0,behavior:'smooth'});
}
function renderWeek(){
 const d=parseDay(selectedDay), label=['日','月','火','水','木','金','土'];
 document.getElementById('dateTitle').textContent=(d.getMonth()+1)+'/'+d.getDate()+'（'+label[d.getDay()]+'）';
 document.getElementById('dayCaption').textContent=selectedDay===todayISO?'Today':'';
 const strip=document.getElementById('weekStrip');strip.textContent='';
 const monday=new Date(d);monday.setDate(d.getDate()-((d.getDay()+6)%7));
 for(let offset=0;offset<7;offset++){
  const x=new Date(monday);x.setDate(monday.getDate()+offset);const iso=localISO(x);
  const b=document.createElement('button');b.type='button';b.className='day'+(iso===selectedDay?' active':'')+(iso===todayISO?' today':'');
  const s=document.createElement('small'),n=document.createElement('strong');s.textContent=label[x.getDay()];n.textContent=String(x.getDate());
  b.append(s,n);b.setAttribute('aria-label',iso);b.onclick=()=>showDay(iso);strip.append(b);
 }
 document.getElementById('datePicker').value=selectedDay;
}
function updateNow(){
 const el=document.getElementById('nowLine');if(selectedDay!==localISO(new Date())){el.hidden=true;return;}
 const d=new Date(),m=d.getHours()*60+d.getMinutes();el.hidden=false;el.style.top=yFor(m)+'px';document.getElementById('nowBadge').textContent=fmt(m);
}
function setTab(name){
 for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===name);b.setAttribute('aria-current',b.dataset.tab===name?'page':'false');}
 document.getElementById('timelinePanel').style.display=name==='timeline'?'block':'none';
 for(const [tab,id] of [['task','taskPanel'],['analysis','review'],['records','recordsPanel'],['ai','aiPanel']])document.getElementById(id).classList.toggle('show',name===tab);
 renderLists();if(name==='task')yosRenderSources();if(name!=='timeline')window.scrollTo({top:0,behavior:'smooth'});
}
function renderLists(){
 for(const [id,subset] of [['taskList',items.filter(x=>x.kind==='task')],['recordsList',items.filter(x=>x.done)]]){
  const container=document.getElementById(id);container.textContent='';if(!subset.length){const p=document.createElement('p');p.className='muted';p.textContent=id==='taskList'?'登録されたタスクはありません':'完了記録はありません';container.append(p);continue;}
  for(const item of subset){const row=document.createElement('div'),span=document.createElement('span'),button=document.createElement('button');row.className='listitem';span.textContent=(item.done?'✓ ':'')+item.t+'　'+fmt(item.s)+'–'+fmt(item.s+item.d);button.textContent='表示';button.onclick=()=>{setTab('timeline');const node=[...tl.querySelectorAll('.card')].find(n=>n.dataset.id===String(item.id));if(node){node.scrollIntoView({behavior:'smooth',block:'center'});node.classList.add('selected');setTimeout(()=>node.classList.remove('selected'),1500)}};row.append(span,button);container.append(row);}
 }
}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>setTab(b.dataset.tab);
document.getElementById('dateBtn').onclick=()=>{const picker=document.getElementById('datePicker');if(typeof picker.showPicker==='function')picker.showPicker();else picker.click()};
document.getElementById('datePicker').onchange=e=>showDay(e.target.value);
document.getElementById('zoomBtn').onclick=()=>{density=density==='overview'?'detail':'overview';scale=density==='overview'?27:56;document.getElementById('zoomBtn').textContent=density==='overview'?'詳細に拡大':'全体表示';render();};
document.getElementById('searchBtn').onclick=()=>{const row=document.getElementById('searchRow');row.hidden=!row.hidden;if(!row.hidden){setTab('timeline');document.getElementById('searchInput').focus()}else{searchText='';document.getElementById('searchInput').value='';render()}};
document.getElementById('searchInput').oninput=e=>{searchText=e.target.value.trim().toLocaleLowerCase();render()};
document.getElementById('moreBtn').onclick=()=>{if(!isSample){note.textContent='この日の端末内データは保持しています · 同期先は未接続';return;}if(confirm('見本の予定だけを消しますか？')){items=[];persist();note.textContent='見本を消去しました · 新規追加できます';smoothRender();updateReview();}};
document.getElementById('editSelected').onclick=()=>{const item=items.find(x=>x.id===selectedId);if(!item)return;if(item.f){note.textContent='固定予定は編集できません';return;}editingId=item.id;document.getElementById('editorTitle').textContent='予定を編集';document.getElementById('saveBtn').textContent='変更を保存';document.getElementById('newTitle').value=item.t;document.getElementById('newTime').value=fmt(item.s);document.getElementById('newDuration').value=item.d;document.getElementById('newKind').value=item.kind;editor.classList.add('show');focus.classList.remove('show');setTab('timeline');editor.scrollIntoView({behavior:'smooth',block:'start'})};
document.getElementById('deleteSelected').onclick=()=>{const item=items.find(x=>x.id===selectedId);if(!item||item.f){note.textContent='固定予定は削除できません';return;}if(!confirm('「'+item.t+'」をこの端末の表示から削除しますか？'))return;items=items.filter(x=>x.id!==selectedId);selectedId=null;focus.classList.remove('show');const saved=persist();note.textContent=saved?'端末内の予定を削除しました':'保存に失敗しました';smoothRender();updateReview()};

const vibrate=()=>{try{navigator.vibrate?.(8)}catch(e){}};
function smoothRender(activeId,oldActiveRect){
 const before=new Map([...tl.querySelectorAll('.card')].map(n=>[n.dataset.id,n.getBoundingClientRect()]));
 if(activeId&&oldActiveRect)before.set(String(activeId),oldActiveRect);
 render();
 [...tl.querySelectorAll('.card')].forEach(n=>{const old=before.get(n.dataset.id);if(!old)return;const now=n.getBoundingClientRect();const dy=old.top-now.top;if(Math.abs(dy)>.5){n.animate([{transform:'translate3d(0,'+dy+'px,0)'},{transform:'translate3d(0,0,0)'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'})}});
}
function render(){
 tl.querySelectorAll('.hour,.card,.tick').forEach(n=>n.remove());
 const bottom=yFor(1440);
 for(let h=0;h<=24;h++){const el=document.createElement('div');el.className='hour';el.style.top=yFor(h*60)+'px';el.innerHTML='<span>'+fmt(h*60)+'</span>';tl.append(el)}
 const sorted=[...items].filter(x=>Number.isFinite(x.s)&&Number.isFinite(x.d)&&x.d>0&&x.s>=0&&x.s+x.d<=1440).sort((a,b)=>a.s-b.s||a.id-b.id);
 const lanes=new Map();let group=[],groupEnd=-1;const groups=[];
 for(const item of sorted){if(group.length&&item.s>=groupEnd){groups.push(group);group=[]}group.push(item);groupEnd=Math.max(groupEnd,item.s+item.d)}
 if(group.length)groups.push(group);
 for(const g of groups){const ends=[];for(const item of g){let lane=ends.findIndex(end=>end<=item.s);if(lane<0){lane=ends.length;ends.push(0)}ends[lane]=item.s+item.d;lanes.set(item,{lane,count:0})}for(const item of g)lanes.get(item).count=ends.length}
 let lastBottom=-2;let pushed=0;
 let priorVisualBottom=-2;
 for(const group of groups){
   const start=yFor(group[0].s);
   const offset=density==='overview'?Math.max(0,priorVisualBottom+3-start):0;
   for(const item of group)lanes.get(item).offset=offset;
   priorVisualBottom=Math.max(priorVisualBottom,...group.map(item=>yFor(item.s)+offset+Math.max(density==='overview'?17:22,yFor(item.s+item.d)-yFor(item.s)-2)));
 }
 sorted.forEach(item=>{
   const natural=yFor(item.s);const height=Math.max(density==='overview'?17:22,yFor(item.s+item.d)-natural-2);const top=natural+(lanes.get(item)?.offset||0);
   if(top>natural+2)pushed++;
   lastBottom=top+height;
   const el=document.createElement('div');el.className='card '+(item.kind==='habit'?'habit':item.kind==='task'?'task':'schedule');
   el.style.top=top+'px';el.style.height=height+'px';
   const lane=lanes.get(item);if(lane&&lane.count>1){el.style.left='calc(73px + (100% - 73px) * '+(lane.lane/lane.count)+')';el.style.width='calc((100% - 73px) / '+lane.count+' - 3px)';el.style.right='auto';el.classList.add('lane')}
   const iconEl=document.createElement('span');iconEl.innerHTML=eventIcon(item);el.append(iconEl.firstChild);
   const titleEl=document.createElement('b');titleEl.textContent=item.t;el.append(titleEl);
   const timeEl=document.createElement('small');timeEl.textContent=fmt(item.s)+'–'+fmt(item.s+item.d);el.append(timeEl);
   if(item.t==='睡眠'||item.t==='就寝')el.classList.add('sleep');
   if(['朝の準備','朝食','昼食','夕食','入浴'].includes(item.t))el.classList.add('neutral');
   if(height<30)el.classList.add('tiny');
   if(density==='overview')el.classList.add('compact');
   if(searchText&&!item.t.toLocaleLowerCase().includes(searchText))el.style.display='none';
   el.dataset.id=String(item.id);if(item.done)el.classList.add('done');tl.append(el);
   const tick=document.createElement('div');tick.className='tick';tick.style.top=(top-4)+'px';tl.append(tick);
   let downY=0,downS=0,moved=false,holding=false,activePointer=null,frame=0,latestY=0,previewS=item.s,lastHaptic=0,startedAt=0;
   const timeLabel=el.querySelector('small');
   const paint=()=>{frame=0;if(!holding)return;const offset=latestY-downY;el.style.transform='translate3d(0,'+offset+'px,0) scale(1.015)';const next=Math.max(0,Math.min(1440-item.d,Math.round((downS+offset/scale*60)/5)*5));if(next!==previewS){previewS=next;timeLabel.textContent=fmt(next)+'–'+fmt(next+item.d);const now=performance.now();if(now-lastHaptic>75){lastHaptic=now;vibrate()}}};
   const startDrag=(y,id)=>{downY=latestY=y;downS=previewS=item.s;startedAt=performance.now();moved=false;holding=false;activePointer=id};
   const moveDrag=y=>{if(activePointer===null)return;latestY=y;const distance=Math.abs(latestY-downY);if(distance>3&&!item.f){holding=true;moved=true;el.classList.add('moving');if(!frame)frame=requestAnimationFrame(paint)}};
   const endDrag=cancelled=>{if(activePointer===null)return;activePointer=null;if(frame){cancelAnimationFrame(frame);frame=0}const releasedRect=el.getBoundingClientRect();el.classList.remove('moving');el.style.transform='';if(holding&&moved&&!cancelled){const offset=latestY-downY;previewS=Math.max(0,Math.min(1440-item.d,Math.round((downS+offset/scale*60)/5)*5));item.s=previewS;const clashes=items.filter(x=>x!==item&&item.s<x.s+x.d&&x.s<item.s+item.d);note.textContent=(clashes.length?'時間が重複：'+clashes.map(x=>x.t).join('、'):'移動しました')+(persist()?'（保存処理中）':'（保存処理失敗）');smoothRender(item.id,releasedRect)}else if(!moved&&!cancelled){zoom=item.s;selectedId=item.id;document.getElementById('doneBtn').textContent=item.done?'未完了に戻す':'完了にする';ft.textContent=item.t;fi.textContent=fmt(item.s)+'–'+fmt(item.s+item.d)+(item.f?'　固定予定':'　ドラッグで移動');focus.classList.toggle('show',zoom!==null);smoothRender()}holding=false};
   // Touch events are used on iOS WebView to avoid pointer capture cancelling a vertical drag.
   el.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;startDrag(e.touches[0].clientY,'touch')},{passive:true});
   el.addEventListener('touchmove',e=>{if(activePointer!=='touch'||!e.touches.length)return;if(!item.f){e.preventDefault();moveDrag(e.touches[0].clientY)}},{passive:false});
   el.addEventListener('touchend',()=>{if(activePointer==='touch')endDrag(false)});
   el.addEventListener('touchcancel',()=>{if(activePointer==='touch')endDrag(true)});
   el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0)return;startDrag(e.clientY,e.pointerId);el.setPointerCapture(e.pointerId)});
   el.addEventListener('pointermove',e=>{if(activePointer===e.pointerId)moveDrag(e.clientY)});
   el.addEventListener('pointerup',e=>{if(activePointer===e.pointerId)endDrag(false)});
   el.addEventListener('pointercancel',e=>{if(activePointer===e.pointerId)endDrag(true)});
 });
 tl.style.height=(Math.max(bottom,lastBottom)+12)+'px';updateNow();
 if(pushed&&note.textContent.includes('仮データ'))note.textContent='枠の高さは所要時間に対応。重複時は縦にずらして表示（未保存）';
}
document.getElementById('closeFocus').onclick=()=>{zoom=null;focus.classList.remove('show');smoothRender()};
if(Array.isArray(stored)){note.textContent='保存済み時間割を表示 · Notion Tasks '+yosStatusWord(taskSource.status);}
else if(calendarRows.length){note.textContent='Appleカレンダー '+items.length+'件を読み取り · 端末内編集';}
else{note.textContent='端末内の予定はありません · 右上の追加から登録';}
yosDefaultStart();renderWeek();render();updateReview();yosRenderSources();setInterval(updateNow,60000);
<\/script></body></html>`;

 const payload=JSON.stringify({days:state.days,calendarDays,taskSource,habitSource,generatedAt:new Date().toISOString()}).replace(/</g,'\\u003c');
 const ready=html.replace('<script>','<script>window.YOS_CHARCOAL_BOOT='+payload+';<\/script><script>');
 await view.loadHTML(ready);
 let closedFlag=false;
 const capture=()=>view.evaluateJavaScript("(function(){window.YOS_CHARCOAL_ATTACH_SAVE(function(value){completion(value);});})()",true).then(value=>({kind:'save',value}),()=>({kind:'error'}));
 let pending=capture();
 const closed=view.present(true).then(()=>{closedFlag=true;return {kind:'closed'}});
 while(!closedFlag){
   const next=await Promise.race([pending,closed]);if(next.kind!=='save')break;
   let ok=false;
   try{
     const changed=JSON.parse(next.value);
     const current=fm.fileExists(path)?fm.readString(path):null;
     if(!validPlan(changed)||current!==expected)throw Error('invalid or concurrent update');
     const after=JSON.stringify(changed);
     // A prior-version backup must be readable before touching the canonical plan.
     if(current!==null){const backup=path+'.previous';fm.writeString(backup,current);if(fm.readString(backup)!==current)throw Error('backup verification failed');}
     try{
       fm.writeString(path,after);if(fm.readString(path)!==after)throw Error('readback failed');
     }catch(writeError){
       if(current!==null){try{fm.writeString(path,current);if(fm.readString(path)!==current)throw Error('restore verification failed');}catch(restoreError){console.warn('Original plan restore requires attention: '+String(restoreError.message||restoreError));}}
       throw writeError;
     }
     expected=after;ok=true;
   }catch(e){console.warn('Charcoal save did not complete: '+String(e.message||e));}
   if(!closedFlag)await view.evaluateJavaScript('window.YOS_CHARCOAL_SAVE_ACK('+JSON.stringify(ok)+')',false);
   if(!closedFlag)pending=capture();
 }
 await closed;
}
try{await main()}catch(e){const a=new Alert();a.title='タイムライン確認版は未完了';a.message=String(e.message||e)+'\n旧ファイルは変更していません。';a.addAction('閉じる');await a.presentAlert()}finally{Script.complete()}
