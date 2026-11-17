// Variables used by Scriptable.
// icon-color: blue; icon-glyph: tasks;
// YOS_SCRIPT_NAME: YOS DAYSTREAM Notion
// Existing DAYSTREAM UI + native read-only Notion query. No Notion writes.
'use strict';
const NOTION_KEY='YOS_NOTION_INTEGRATION_TOKEN';
const UI_REF='732803c68546155f63fa99c11e9ad8eb8bdf4505';
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
 habitCycle:pick(p['習慣周期']),lastEditedAt:row.last_edited_time||null,
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
 window.YOS_CHARCOAL_BOOT.taskSource=snapshot;
 window.YOS_DAYSTREAM_TASK_AUTH={
  setup:()=>{location.href='scriptable:///run?scriptName=YOS%20DAYSTREAM%20Notion';return Promise.resolve(true)},
  complete:()=>Promise.resolve({ok:false,reason:'表示専用です。Notionの元ページで完了してください'})
 };
 window.addEventListener('DOMContentLoaded',()=>{
  const button=document.getElementById('yosWebTaskRefresh');
  const refresh=()=>{location.href='scriptable:///run?scriptName=YOS%20DAYSTREAM%20Notion'};
  button.textContent='↻ Notionを更新';button.onclick=refresh;
  const top=document.createElement('button');top.textContent='↻ Notionを更新';top.onclick=refresh;
  document.querySelector('.yos-web-port').insertBefore(top,document.getElementById('yosWebImport'));
  document.getElementById('yosWebSourceState').textContent='Notion '+snapshot.items.length+'件取得 · '+new Date(snapshot.checkedAt).toLocaleString('ja-JP')+' · 開き直し・更新で再取得 · Appleカレンダーは別接続';
 });
})();
`;
const BROWSER_RENDER=String.raw`(()=>{
 try{
  const projectDay=__PROJECT_DAY__;
  const originalRender=render,originalAllDay=renderDayAllDay,originalReview=updateReview;
  const source=()=>projectDay(boot.taskSource.items,selectedDay);
  let ignoreClickUntil=0;
  const tokyoDay=value=>{
   const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
   return p.year+'-'+p.month+'-'+p.day;
  };
  const canMove=row=>row.sourceFamily==='task'&&
   typeof row.originalStart==='string'&&row.originalStart.includes('T')&&
   Number.isFinite(Date.parse(row.originalStart))&&tokyoDay(row.originalStart)===selectedDay&&
   typeof row.editedAt==='string'&&Number.isFinite(Date.parse(row.editedAt))&&
   (!row.originalEnd||Number.isFinite(Date.parse(row.originalEnd))&&Date.parse(row.originalEnd)-Date.parse(row.originalStart)<=86400000);
  const sheet=document.createElement('div');sheet.id='yosNotionEditSheet';sheet.hidden=true;sheet.setAttribute('role','presentation');
  const dialog=document.createElement('section');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','yosNotionSheetTitle');
  dialog.innerHTML='<div class="yos-notion-sheet-head"><strong id="yosNotionSheetTitle"></strong><button type="button" id="yosNotionClose">閉じる</button></div><p id="yosNotionSheetInfo"></p><label for="yosNotionNewTime">移動先の開始時刻</label><input id="yosNotionNewTime" type="time" step="300"><p id="yosNotionSheetNote"></p><button id="yosNotionSave" type="button">変更内容を確認</button>';
  sheet.append(dialog);document.body.append(sheet);
  const title=dialog.querySelector('#yosNotionSheetTitle'),info=dialog.querySelector('#yosNotionSheetInfo');
  const timeInput=dialog.querySelector('#yosNotionNewTime'),save=dialog.querySelector('#yosNotionSave'),note=dialog.querySelector('#yosNotionSheetNote');
  const closeSheet=()=>{sheet.hidden=true};
  dialog.querySelector('#yosNotionClose').onclick=closeSheet;
  sheet.addEventListener('click',e=>{if(e.target===sheet)closeSheet()});
  const openSheet=(row,at)=>{
   const allowed=canMove(row),clock=fmt(at??row.s);
   title.textContent=row.title;
   info.textContent=(row.sourceFamily==='calendar'?'予定':'タスク')+' · '+selectedDay+' · '+fmt(row.s)+(row.type==='range'?'–'+fmt(row.s+row.d):'')+' · Notion';
   timeInput.value=clock==='24:00'?'23:55':clock;
   timeInput.disabled=!allowed;save.hidden=!allowed;
   note.textContent=allowed?'ドラッグした時刻を確認してください。Notionへの保存前にもう一度確認します。':
    row.sourceFamily==='calendar'?'連携された勤務・カレンダー予定は読み取り専用です。ここからは変更しません。':
    '日時が未設定、または日をまたぐ途中区間です。ここからは変更しません。';
   save.onclick=()=>{
    const value=timeInput.value;
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)){note.textContent='時刻を確認してください';return}
    const next=selectedDay+'T'+value+':00+09:00';
    if(Date.parse(next)===Date.parse(row.originalStart)){closeSheet();return}
    const q=new URLSearchParams();
    q.set('action','move');q.set('id',row.id.slice(7));q.set('old',row.originalStart);
    q.set('end',row.originalEnd||'');q.set('edited',row.editedAt);q.set('next',next);
    closeSheet();
    location.href='scriptable:///run?scriptName=YOS%20DAYSTREAM%20Notion&'+q.toString();
   };
   sheet.hidden=false;
  };
  const wire=(el,row)=>{
   el.addEventListener('contextmenu',e=>e.preventDefault());
   const permitted=canMove(row);
   let touch=null,timer=null,held=false,offset=0,preview=row.s;
   const stop=()=>{if(timer!==null){clearTimeout(timer);timer=null}};
   const reset=()=>{stop();el.classList.remove('yos-notion-dragging');el.style.transform='';el.querySelector('small').textContent=el.dataset.timeLabel;touch=null;held=false;offset=0};
   el.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    const p=e.touches[0];touch={x:p.clientX,y:p.clientY};preview=row.s;held=false;
    if(permitted)timer=setTimeout(()=>{if(touch){held=true;el.classList.add('yos-notion-dragging')}timer=null},360);
   },{passive:true});
   el.addEventListener('touchmove',e=>{
    if(!touch||e.touches.length!==1)return;
    const p=e.touches[0],dx=p.clientX-touch.x,dy=p.clientY-touch.y;
    if(!held){
     if(Math.abs(dx)>10||Math.abs(dy)>10){stop();touch=null}
     return;
    }
    e.preventDefault();
    offset=dy;preview=Math.max(0,Math.min(1435,Math.round(minuteAtY(yFor(row.s)+dy)/5)*5));
    el.style.transform='translate3d(0,'+offset+'px,0) scale(1.015)';
    el.querySelector('small').textContent=fmt(preview)+(row.type==='range'?'–'+fmt(preview+row.d):'')+' · 移動先';
   },{passive:false});
   el.addEventListener('touchend',()=>{
    if(!touch)return;
    const shouldMove=held&&Math.abs(offset)>8,at=preview;
    reset();ignoreClickUntil=performance.now()+600;
    if(shouldMove)openSheet(row,at);
    else if(!held)openSheet(row);
   });
   el.addEventListener('touchcancel',reset);
   el.addEventListener('click',e=>{
    e.preventDefault();e.stopPropagation();
    if(performance.now()<ignoreClickUntil)return;
    openSheet(row);
   });
   el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSheet(row)}});
  };
  const makeCard=row=>{
   const el=document.createElement('button');el.type='button';el.className='yos-notion-projection';
   el.dataset.timeLabel=(row.type==='deadline'?'期限 ':'')+fmt(row.s)+(row.type==='range'?'–'+fmt(row.s+row.d):'')+(row.sourceFamily==='calendar'?' · 予定':' · タスク');
   const meta=document.createElement('small');meta.className='yos-notion-meta';meta.textContent=el.dataset.timeLabel;
   const title=document.createElement('span');title.className='yos-notion-title';title.textContent=(row.status==='完了'&&row.sourceFamily!=='calendar'?'✓ ':'')+row.title;
   el.append(meta,title);
   el.setAttribute('aria-label',el.dataset.timeLabel+' '+title.textContent);
   el.dataset.kind=row.sourceFamily;
   if(row.status==='完了'&&row.sourceFamily!=='calendar')el.dataset.done='true';
   wire(el,row);return el;
  };
  render=function(){
   tl.querySelectorAll('.yos-notion-projection').forEach(x=>x.remove());
   originalRender();
   const rows=source().filter(x=>x.type!=='undated').sort((a,b)=>a.s-b.s);
   let group=[],end=-1;const groups=[];
   for(const row of rows){
    const top=yFor(row.s),bottom=yFor(row.s+row.d);
    row.top=top;row.height=Math.max(36,bottom-top-2);
    if(group.length&&top>=end){groups.push(group);group=[];end=-1}
    group.push(row);end=Math.max(end,top+row.height);
   }
   if(group.length)groups.push(group);
   for(const g of groups){
    const ends=[];
    for(const row of g){
     let lane=ends.findIndex(v=>v<=row.top);
     if(lane<0){lane=ends.length;ends.push(0)}
     ends[lane]=row.top+row.height;row.lane=lane;
    }
    for(const row of g){
     // Narrow columns only for an actual overlap. Do not halve a whole group
     // because an unrelated local task overlaps another source block.
     const localOverlap=items.some(x=>Number.isFinite(x.s)&&Number.isFinite(x.d)&&row.s<x.s+x.d&&x.s<row.s+Math.max(1,row.d));
     const left=localOverlap?'calc(52% + (48% - 8px) * '+row.lane+'/'+ends.length+')':
       'calc(73px + (100% - 85px) * '+row.lane+'/'+ends.length+')';
     const width=localOverlap?'calc((48% - 8px) / '+ends.length+' - 3px)':
       'calc((100% - 85px) / '+ends.length+' - 3px)';
     const el=makeCard(row);
     el.style.left=left;el.style.width=width;el.style.top=row.top+'px';el.style.height=row.height+'px';
     if(row.d>=180)el.dataset.long='true';
     tl.append(el);
    }
   }
  };
  renderDayAllDay=function(){
   originalAllDay();
   if(calendarMode!=='day')return;
   const rows=source().filter(x=>x.type==='undated');
   if(!rows.length)return;
   const section=document.getElementById('dayAllDay');section.hidden=false;
   const head=document.createElement('b');head.textContent='時間未設定 · Notion';section.append(head);
   for(const row of rows){const el=makeCard(row);el.classList.add('yos-notion-all-day');section.append(el)}
  };
  updateReview=function(){
   originalReview();
   const rows=source().filter(x=>x.sourceFamily!=='calendar'&&!['待ち','保留'].includes(x.status));
   const local=items.filter(x=>x.kind==='task'&&!rows.some(r=>'notion:'+r.id===x.sourceRef));
   const total=rows.length+local.length,done=rows.filter(x=>x.status==='完了').length+local.filter(x=>x.done).length;
   document.getElementById('taskCount').textContent=done+'/'+total;
   document.getElementById('todayProgress').textContent=(total?Math.round(done/total*100):0)+'%';
   document.getElementById('progressRing').style.setProperty('--pct',(total?Math.round(done/total*100):0)+'%');
  };
  render();renderDayAllDay();updateReview();
  document.getElementById('yosNativeBoot')?.remove();
 }catch(error){
  const message=document.getElementById('yosNativeBoot');
  if(message)message.textContent='DAYSTREAMの表示に失敗しました。閉じて再起動してください。';
 }
})();`;

const NATIVE_STYLE=String.raw`<style id="yosNotionNativeStyle">
.yos-notion-projection{position:absolute;z-index:6;display:flex;flex-direction:column;gap:3px;box-sizing:border-box;overflow:hidden;text-align:left;padding:7px 9px;appearance:none;-webkit-appearance:none;border:1px solid #45627c;border-left:4px solid #69c6ff;border-radius:9px;background:#263a50;color:#f5f8ff!important;font:500 13px/1.35 -apple-system,BlinkMacSystemFont,sans-serif;cursor:pointer;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;touch-action:pan-y;white-space:normal;overflow-wrap:anywhere;box-shadow:0 1px 3px #0002}
.yos-notion-projection[data-kind="calendar"]{background:#34414d;border-color:#697989;border-left-color:#d9b778}
.yos-notion-projection[data-long="true"]{background:rgba(39,54,72,.76)}
.yos-notion-projection[data-done="true"]{opacity:.62}
.yos-notion-projection:focus-visible{outline:2px solid #a0e4ff;outline-offset:1px}
.yos-notion-projection .yos-notion-meta{display:block!important;color:#bde6ff!important;font-size:11px!important;line-height:1.3;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yos-notion-projection[data-kind="calendar"] .yos-notion-meta{color:#f1d4a7!important}
.yos-notion-projection .yos-notion-title{display:block;color:#fff!important;font-size:13px!important;line-height:1.38;font-weight:650;letter-spacing:0;overflow-wrap:anywhere}
.yos-notion-projection.yos-notion-dragging{z-index:14;box-shadow:0 8px 22px #000a;outline:2px solid #9cdaff;touch-action:none}
.yos-notion-all-day{position:relative!important;top:auto!important;left:auto!important;width:100%!important;height:auto!important;min-height:44px!important;margin:7px 0}
#yosNotionEditSheet[hidden]{display:none!important}
#yosNotionEditSheet{position:fixed;z-index:100002;inset:0;display:flex;align-items:flex-end;justify-content:center;background:#07101bd9;backdrop-filter:blur(4px);padding:12px 12px calc(20px + env(safe-area-inset-bottom))}
#yosNotionEditSheet section{box-sizing:border-box;width:100%;max-width:600px;padding:18px;border-radius:20px;background:#1b2836;color:#f8fbff;border:1px solid #69819a;box-shadow:0 14px 36px #0008}
#yosNotionEditSheet .yos-notion-sheet-head{display:flex;justify-content:space-between;gap:10px;align-items:start}
#yosNotionEditSheet strong{font-size:18px;line-height:1.4}
#yosNotionEditSheet p{font-size:13px;color:#d1dfed;line-height:1.55}
#yosNotionEditSheet label{display:block;font-size:13px;margin:14px 0 6px}
#yosNotionEditSheet input{box-sizing:border-box;width:100%;min-height:48px;border-radius:10px;border:1px solid #90a7bd;background:#27394d;color:#fff;font-size:18px;padding:8px}
#yosNotionEditSheet button{background:#2276a7;color:#fff;font-weight:650;font-size:14px;border:1px solid #8dcbeb;border-radius:10px;min-height:44px;padding:10px 16px}
#yosNotionEditSheet button[hidden]{display:none}
#yosNotionEditSheet #yosNotionClose{background:#405367}
#yosNotionEditSheet #yosNotionSave{width:100%}
@media(max-width:350px){.yos-notion-projection .yos-notion-title{font-size:12px!important}.yos-notion-projection{padding:5px 6px}}
</style>`;
const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
function buildHTML(html,adapters,native,wizard,snapshot){
 if(!html.includes('// WEB_PORT_BOOT')||!html.includes('</script><script>\nconst tl=')||!html.includes('<script src="./task-wizard.js"></script>'))throw Error('DAYSTREAMの形式が一致しません');
 const json=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 let out=html.replace('<script src="./source-adapters.js"></script>','<script>'+safeScript(adapters)+'</script>')
 .replace('<script src="../../life/calendar/native-bridge.js"></script>','<script>'+safeScript(native)+'</script>')
 .replace('<script src="./yos-tasks-auth.js"></script>','')
 .replace('</script><script>\nconst tl=','</script><script>'+safeScript(BROWSER_BOOT.replace('__SNAPSHOT__',json))+'</script><script>\nconst tl=')
 .replace('<script src="./task-wizard.js"></script>','<script>'+safeScript(wizard)+'</script><script>'+safeScript(BROWSER_RENDER.replace('__PROJECT_DAY__','('+dayProjection.toString()+')').replace('const projectDay=','const validDate='+validDate.toString()+';const projectDay='))+'</script>');
 out=out.replace('<head>','<head>'+NATIVE_STYLE+'<base href="https://yskn0008-bot.github.io/ProjectY/yos/daystream/">')
 .replace('<body class="yos-daystream-web">','<body class="yos-daystream-web"><div id="yosNativeBoot" role="status" style="position:fixed;inset:0;z-index:99999;background:#343943;color:white;padding:80px 20px;font-family:-apple-system,sans-serif">DAYSTREAMを読み込んでいます…</div>');
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
 const output=buildHTML(html,adapters,native,wizard,snapshot);
 stage='画面表示';
 await WebView.loadHTML(output,null,null,true);
}
const YOS_TASK_DB='06e62efb9a3c45e2bec77a53332c925a';
const apiHeaders=token=>({
 Authorization:'Bearer '+token,'Notion-Version':'2025-09-03',
 'Content-Type':'application/json',Accept:'application/json'
});
const tokyoParts=value=>{
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))return null;
 const x=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return {day:x.year+'-'+x.month+'-'+x.day,time:x.hour+':'+x.minute};
};
const matchInstant=(a,b)=>a===null&&b===null||
 typeof a==='string'&&typeof b==='string'&&Number.isFinite(Date.parse(a))&&Date.parse(a)===Date.parse(b);
async function notionPage(token,id){
 const request=new Request('https://api.notion.com/v1/pages/'+id);
 request.method='GET';request.headers=apiHeaders(token);request.timeoutInterval=15;
 const page=await request.loadJSON();
 const status=request.response?.statusCode;
 if(status!==200)throw Error(status===401?'Notionの認証を確認してください':
  status===403?'Notionの閲覧権限を確認してください':
  status===404?'Notionの元タスクを取得できません':'Notionの再確認に失敗（HTTP '+(status||'不明')+'）');
 if(page?.object!=='page'||!page.properties||page.archived||page.in_trash)
  throw Error('Notionのタスク形式が一致しません');
 if(page.parent?.data_source_id!==SOURCE&&page.parent?.database_id!==YOS_TASK_DB)
  throw Error('YOS Tasks以外のデータは変更しません');
 return page;
}
function validateMoveInput(params){
 const id=String(params?.id||'').toLowerCase();
 const old=String(params?.old||''),end=String(params?.end||'')||null;
 const next=String(params?.next||''),edited=String(params?.edited||'');
 if(!/^[a-f0-9]{32}$/.test(id)||!validAt(old)||!old.includes('T')||
   end!==null&&(!validAt(end)||!end.includes('T'))||!validAt(next)||!next.includes('T')||
   !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(edited))
  throw Error('日時変更の入力形式を確認できません');
 const from=Date.parse(old),to=Date.parse(next),duration=end===null?0:Date.parse(end)-from;
 const originalDay=tokyoParts(old),newDay=tokyoParts(next);
 if(!originalDay||!newDay||originalDay.day!==newDay.day||duration<0||duration>86400000||from===to)
  throw Error('同じ日の開始時刻だけ変更できます。日跨ぎの終了時刻は維持します');
 return {id,old,end,next,edited,duration};
}
async function moveNotion(params){
 if(typeof config!=='undefined'&&config.runsWithSiri)
  throw Error('Notionの日時変更はScriptableアプリで確認してください');
 const move=validateMoveInput(params);
 let token='';
 try{if(Keychain.contains(NOTION_KEY))token=Keychain.get(NOTION_KEY)||''}catch{}
 if(!token)throw Error('既存のNotion接続情報がありません');
 const page=await notionPage(token,move.id);
 const p=page.properties,due=p['期限']?.date,sourceKey=rich(p['同期キー']),state=pick(p['状態']);
 if(!STATES.includes(state)||/^(?:yos-shift-|apple-calendar:|calendar:)/.test(sourceKey))
  throw Error('連携予定や状態未確認のタスクは変更しません');
 if(!due||!matchInstant(due.start,move.old)||!matchInstant(due.end||null,move.end)||
    page.last_edited_time!==move.edited)
  throw Error('Notion側が更新されました。先に画面を再読み込みしてください');
 if(due.time_zone&&due.time_zone!=='Asia/Tokyo')
  throw Error('別の時間帯のタスクは変更しません');
 const newEnd=move.end?new Date(Date.parse(move.next)+move.duration).toISOString():null;
 const before=tokyoParts(move.old),after=tokyoParts(move.next);
 const name=clean(rich(p['やること']),64);
 const confirm=new Alert();confirm.title='Notionの日時を変更';
 confirm.message='タスク：'+name+'\n'+before.day+' '+before.time+' → '+after.day+' '+after.time+
   '\n'+(newEnd?'所要時間・終了時刻は保持します':'期限の時刻だけ変更します')+
   '\nNotionの「期限」に反映します。';
 confirm.addAction('Notionに保存');confirm.addCancelAction('キャンセル');
 if(await confirm.presentAlert()!==0){await main();return}
 // Re-read immediately before write. A stale or replaced date cannot be updated.
 const latest=await notionPage(token,move.id),currentDue=latest.properties['期限']?.date;
 if(latest.last_edited_time!==move.edited||!currentDue||
   !matchInstant(currentDue.start,move.old)||!matchInstant(currentDue.end||null,move.end))
  throw Error('確認中にNotionが更新されました。変更しません');
 const request=new Request('https://api.notion.com/v1/pages/'+move.id);
 request.method='PATCH';request.headers=apiHeaders(token);request.timeoutInterval=20;
 request.body=JSON.stringify({properties:{'期限':{date:{start:move.next,end:newEnd}}}});
 const result=await request.loadJSON(),status=request.response?.statusCode;
 if(status!==200||result?.object!=='page'){
  throw Error(status===403?'Notion連携に日時の書込み権限がありません。元データは変更していません':
   'Notionへの保存結果を確認できません（HTTP '+(status||'不明')+'）。元のタスクを確認してください');
 }
 const check=await notionPage(token,move.id),saved=check.properties['期限']?.date;
 if(!saved||!matchInstant(saved.start,move.next)||!matchInstant(saved.end||null,newEnd))
  throw Error('Notionへの保存後照合が一致しません。再操作せず元タスクを確認してください');
 await main();
}
// SCRIPTABLE_ENTRY
try{
 if(typeof args!=='undefined'&&args.queryParameters?.action==='move'){
  stage='Notion日時変更';
  await moveNotion(args.queryParameters);
 }else await main();
}catch(error){
 const detail=clean(error?.message||error,180);
 await showAlert('DAYSTREAM '+(stage==='Notion日時変更'?'更新':'接続')+'エラー','［'+stage+'］'+detail);
}
Script.complete();
