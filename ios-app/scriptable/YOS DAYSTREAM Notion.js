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
  const base={id:t.id,title:t.title,status:t.status,sourceFamily:t.sourceFamily,url:'https://www.notion.so/'+t.id.slice(7)};
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
const BROWSER_RENDER=String.raw`
(()=>{
 try{
  const projectDay=__PROJECT_DAY__;
  const originalRender=render,originalAllDay=renderDayAllDay,originalReview=updateReview;
  const source=()=>projectDay(boot.taskSource.items,selectedDay);
  const link=row=>{
   const el=document.createElement('a');el.href=row.url;el.rel='noopener';
   el.textContent=(row.status==='完了'?'✓ ':'')+row.title;el.style.color='inherit';
   return el;
  };
  render=function(){
   tl.querySelectorAll('.yos-notion-projection').forEach(x=>x.remove());
   originalRender();
   const rows=source().filter(x=>x.type!=='undated').sort((a,b)=>a.s-b.s);
   // Source blocks stay in their own right-hand column alongside local plans.
   let group=[],end=-1;const groups=[];
   for(const row of rows){const bottom=yFor(row.s+row.d),top=yFor(row.s),finish=Math.max(top+28,bottom);
    if(group.length&&top>=end){groups.push(group);group=[];end=-1}
    row.top=top;row.height=Math.max(28,bottom-top-2);group.push(row);end=Math.max(end,finish)}
   if(group.length)groups.push(group);
   for(const g of groups){
    const ends=[];
    for(const row of g){let lane=ends.findIndex(v=>v<=row.top);if(lane<0){lane=ends.length;ends.push(0)}ends[lane]=row.top+row.height;row.lane=lane}
    const hasLocal=g.some(row=>items.some(x=>row.s<x.s+x.d&&x.s<row.s+Math.max(1,row.d)));
    const left=hasLocal?'52%':'73px',width=hasLocal?'48%':'(100% - 73px)';
    for(const row of g){
     const el=link(row);el.className='yos-notion-projection';
     el.style.cssText='position:absolute;z-index:5;box-sizing:border-box;overflow:auto;border-left:3px solid #5fc2ff;border-radius:7px;background:#254c6a;padding:4px 6px;font-size:12px;text-decoration:none;top:'+row.top+'px;height:'+row.height+'px;left:calc('+left+' + '+width+' * '+row.lane/ends.length+');width:calc('+width+' / '+ends.length+' - 3px)';
     if(row.status==='完了')el.style.opacity='.55';
     const time=document.createElement('small');time.style.display='block';
     time.textContent=(row.type==='deadline'?'期限 ':'')+fmt(row.s)+(row.type==='range'?'–'+fmt(row.s+row.d):'')+(row.sourceFamily==='calendar'?' · 予定 · Notion':' · Notion');
     el.prepend(time);tl.append(el);
    }
   }
  };
  renderDayAllDay=function(){
   originalAllDay();
   if(calendarMode!=='day')return;
   const rows=source().filter(x=>x.type==='undated');
   if(!rows.length)return;
   const section=document.getElementById('dayAllDay');section.hidden=false;
   const title=document.createElement('b');title.textContent='時間未設定 · Notion';section.append(title);
   for(const row of rows){const span=document.createElement('span');span.append(link(row));section.append(span)}
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
})();
`;
const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
function buildHTML(html,adapters,native,wizard,snapshot){
 if(!html.includes('// WEB_PORT_BOOT')||!html.includes('</script><script>\nconst tl=')||!html.includes('<script src="./task-wizard.js"></script>'))throw Error('DAYSTREAMの形式が一致しません');
 const json=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 let out=html.replace('<script src="./source-adapters.js"></script>','<script>'+safeScript(adapters)+'</script>')
 .replace('<script src="../../life/calendar/native-bridge.js"></script>','<script>'+safeScript(native)+'</script>')
 .replace('<script src="./yos-tasks-auth.js"></script>','')
 .replace('</script><script>\nconst tl=','</script><script>'+safeScript(BROWSER_BOOT.replace('__SNAPSHOT__',json))+'</script><script>\nconst tl=')
 .replace('<script src="./task-wizard.js"></script>','<script>'+safeScript(wizard)+'</script><script>'+safeScript(BROWSER_RENDER.replace('__PROJECT_DAY__','('+dayProjection.toString()+')').replace('const projectDay=','const validDate='+validDate.toString()+';const projectDay='))+'</script>');
 out=out.replace('<head>','<head><base href="https://yskn0008-bot.github.io/ProjectY/yos/daystream/">')
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
// SCRIPTABLE_ENTRY
try{await main()}catch(error){
 const detail=clean(error?.message||error,180);
 await showAlert('DAYSTREAM 接続エラー','［'+stage+'］'+detail+'。Notionの内容は変更していません。');
}
Script.complete();
