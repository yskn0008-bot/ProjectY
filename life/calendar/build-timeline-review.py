from pathlib import Path
import hashlib,json,re
out=Path(__file__).resolve().parent; original=out if (out/'daystream-native.html').exists() else out.parents[2]/'existing/life/calendar'
core=(out/'daystream-timeline-core.js').read_text(); ui=(out/'daystream-timeline-ui.js').read_text()
style=(out/'daystream-timeline-ui.css').read_text()
# Official MIT-licensed Phosphor assets are bundled offline; no runtime CDN.
icons=json.loads((out/'design/phosphor-icons.json').read_text())
ui=re.sub(r' const tlIcons=.*?;\n function tlIcon[^\n]*\n',lambda _: ' const tlIcons='+json.dumps(icons,ensure_ascii=False)+';\n function tlIcon(name){return tlIcons[name]||tlIcons.other}\n',ui,count=1,flags=re.S)
panel='<section id="tlPanel" data-theme="light" data-wallpaper="pearl" aria-label="YOS 24時間タイムライン">\n<div id="tlLegend" class="tlLegend"><span class="tlLegendFixed">固定予定</span><span class="tlLegendHabit">習慣</span><span id="tlLegendRecommended" class="tlLegendRecommended" hidden>おすすめ</span></div><nav class="tlPeriods" aria-label="表示期間"><button id="tlPeriodDay" aria-current="page">24時間</button><button id="tlPeriodWeek">週</button><button id="tlPeriodMonth">月</button><button id="tlPeriodYear">年</button></nav><div class="tlCanvasLabel"><span id="tlScaleLabel">実行順</span><span id="tlDayLabel"></span></div>\n<div id="tlViewport" tabindex="0" aria-label="選択日のタイムライン"><div id="tlAgenda" aria-label="実行順の一覧"></div><div id="tlGrid" hidden></div></div><div id="tlFeedback" role="status" aria-live="polite" hidden></div>\n<div class="tlTray"><button id="tlOpenTray">未配置 <span id="tlUnplacedCount">0</span> <span aria-hidden="true">↑</span></button><span id="tlState">仮配置／未保存</span></div>\n<div class="tlBottom"><button id="tlUndo" disabled>戻す</button><span>長押しして移動 · 1分＝2px</span></div><button id="tlAdd" aria-label="配置を追加"></button>\n<nav class="tlTabs" aria-label="メイン"><button id="tlTabTimeline" aria-current="page">タイムライン</button><button id="tlTabHabits">習慣</button><button id="tlTabReview">振り返り</button><button id="tlTabSettings">設定</button></nav></section>\n<dialog id="tlPeriodDialog" class="dialog"><div class="sheet-head"><h2 id="tlPeriodTitle">期間</h2><button id="tlClosePeriod" class="sheet-close" aria-label="閉じる">×</button></div><p>件数は端末内の配置と取得済みの時刻付き元予定です。元データの未取得は予定なしを意味しません。</p><div id="tlPeriodList"></div></dialog>\n<dialog id="tlHabitsDialog" class="dialog"><div class="sheet-head"><h2>習慣</h2><button id="tlCloseHabits" class="sheet-close" aria-label="閉じる">×</button></div><p>選択日の既存習慣を表示します。配置を押すと時刻を指定できます。</p><div id="tlHabitList"></div></dialog>\n<dialog id="tlReviewDialog" class="dialog"><div class="sheet-head"><h2>振り返り</h2><button id="tlCloseReview" class="sheet-close" aria-label="閉じる">×</button></div><p id="tlReviewSummary"></p><div id="tlReviewList"></div><p>実施チェックはこの端末内の記録です。Apple・Notionへは反映しません。保存ボタンで端末に保存します。</p></dialog>\n<dialog id="tlDrawer" class="dialog"><div class="sheet-head"><h2>未配置と配置の確認</h2><button id="tlCloseTray" class="sheet-close" aria-label="閉じる">×</button></div><p id="tlHabitStatus" class="tlHint"></p><div id="tlUnplaced"></div><details><summary>配置一覧・時刻編集</summary><div id="tlPlaced"></div></details><details><summary>配置の影響 <span class="green">＋</span> <span class="amber">−</span> <span class="red">!</span> <span class="neutral">?</span></summary><div id="tlNotes" aria-live="polite"></div></details></dialog>\n<dialog id="tlEditor" class="dialog"><form id="tlForm"><h2>配置を編集</h2><p>所要時間・移動時間は計画値。元の予定は変更しません。</p><input id="tlId" type="hidden"><input id="tlSourceRef" type="hidden"><label>名前 <input id="tlTitle" maxlength="120" required></label><label>日付 <input id="tlDate" type="date" required></label><label>開始 <input id="tlTime" type="time" required></label><label>所要時間（分・翌日へ継続可）<input id="tlDuration" type="number" min="1" max="1440" required></label><label>行動 <select id="tlKind"><option value="other">その他</option><option value="task">タスク</option><option value="habit">習慣</option><option value="sleep">睡眠</option><option value="meal">食事</option><option value="walk">歩行</option><option value="wash">洗顔・洗浄</option><option value="moisturizer">保湿</option><option value="travel">移動</option></select></label><label>この前に必要な移動時間（分）<input id="tlTransfer" type="number" min="0" max="240" required></label><label>繰り返し <select id="tlRepeat"><option value="none">この日だけ</option><option value="daily">毎日</option><option value="weekly">毎週</option><option value="monthly">毎月（月末で調整）</option><option value="yearly">毎年（月末で調整）</option></select></label><label>変更範囲 <select id="tlScope" hidden><option value="instance">この回の時刻・所要時間だけ</option><option value="series">全体を更新（例外時刻もリセット）</option></select></label><p id="tlError" role="alert"></p><div class="tlTools"><button type="button" id="tlComplete">この回を実施済みにする</button><button type="button" id="tlDelete">配置から外す</button></div><div class="tlTools"><button type="submit">仮配置へ反映</button><button type="button" id="tlCancel">キャンセル</button></div></form></dialog>\n'
ui=ui.replace("$('tlNotes').replaceChildren();", "$('tlPlaced').replaceChildren();for(const x of rows){const p=document.createElement('button');p.textContent=(x.fixed?'固定 · ':'')+x.title+' '+TL.clock(x.start)+' / '+(x.endAbs===null?'終了不明':x.duration?x.duration+'分':Math.round(x.endAbs-x.startAbs)+'分');p.addEventListener('click',()=>tlEdit(x));$('tlPlaced').append(p)}\n $('tlNotes').replaceChildren();")
# Habit file is read-only, imported only into separate unplaced section.
ui=ui.replace("const source=state.native?state.native.items:state.items;const seen=new Set();", "const source=[...(state.native?state.native.items:state.items),...tlHabitRows()];const seen=new Set();")
ui=ui.replace(" const TL=window.YOSTimeline;", " const TL=window.YOSTimeline;\n let habitSource=null;window.YOS_TIMELINE_HABITS=function(v){habitSource=v;renderTimeline();return true};\n function tlHabitRows(){if(!habitSource)return [];const d=new Date(state.selected+'T12:00:00Z'),dom=d.getUTCDate(),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();return ['daily','weekly','monthly','yearly'].flatMap(period=>(habitSource.lists[period]||[]).filter(x=>period==='daily'||period==='weekly'&&x.weekdays.includes(d.getUTCDay())||period==='monthly'&&Math.min(x.dayOfMonth,last)===dom||period==='yearly'&&Number(x.monthDay.slice(0,2))===d.getUTCMonth()+1&&Math.min(Number(x.monthDay.slice(3)),last)===dom).map(x=>({id:x.id,title:x.title,source:'YOS_HABIT_FLOW_v1',type:'habit',date:state.selected,repeat:period==='daily'?'daily':period==='weekly'?'weekly':period==='monthly'&&x.dayOfMonth===dom?'monthly':period==='yearly'&&Number(x.monthDay.slice(3))===dom?'yearly':'none'})));}\n")
# Existing optional textures stay offline and subdued behind the same canvas.
import base64
for k,n in [('A','mineral.webp'),('B','graphite.webp'),('C','matte.webp')]:
    asset=out/'design'/n
    if asset.exists():
        uri='data:image/webp;base64,'+base64.b64encode(asset.read_bytes()).decode()
        style+='\n#tlPanel[data-wallpaper='+k+']{background-image:url("'+uri+'");background-size:cover;box-shadow:inset 0 0 0 99999px var(--veil,#f7f6f2f5)}\n'
style+='\n#tlPanel[data-theme=dark]{--veil:#202323f5}@media(prefers-color-scheme:dark){#tlPanel[data-theme=auto]{--veil:#202323f5}}\n'
# Generated reference wallpaper remains a background only: no text, grid or controls.
pearl='data:image/webp;base64,'+base64.b64encode((out/'design/life-flow-wallpaper.webp').read_bytes()).decode()
style+='\n#tlFrame[data-wallpaper=pearl]{background-image:url("'+pearl+'");background-size:cover;background-position:center}\n#tlFrame[data-wallpaper=plain]{background-image:none;background-color:#f5f7fc}\n#tlFrame[data-theme=dark][data-wallpaper=plain]{background-color:#17283e}\n'
style+='@media(prefers-color-scheme:dark){#tlFrame[data-theme=auto][data-wallpaper=plain]{background-color:#17283e}}\n'
# Recompose baseline DOM, retaining every legacy record and control ID in a sheet.
html=(original/'daystream-native.html').read_text().replace('<title>YOS Calendar — DAYSTREAM concept</title>','<title>YOS / LIFE FLOW — DAYSTREAM</title>').replace('</style>',style+'\n</style>')
frame_start=html.index('<div class="frame">'); frame_end=html.index('\n<dialog class="dialog" id="monthDialog">',frame_start)
legacy=html[frame_start+len('<div class="frame">'):frame_end].rsplit('</div>',1)[0]
week='<nav class="week" aria-label="日付を選択" id="week"></nav>'
legacy=legacy.replace(week,'')
header='''<div class="frame tlFrame" id="tlFrame" data-theme="light" data-view="home" data-skin="glass" data-wallpaper="pearl"><header class="tlHeader"><div class="tlIdentity">YOS <span>LIFE FLOW</span></div><div class="tlHomeHeading"><h1 id="tlHomeTitle">今日のタイムライン</h1><button id="tlEnterEdit">編集</button></div><div class="tlDateRow"><button id="tlPrev" aria-label="前日"></button><button id="tlDateButton" aria-label="月カレンダーを開く"><span id="tlDateTitle">今日</span></button><button id="tlNext" aria-label="翌日"></button><button id="tlSettings" aria-label="記録・連携と表示設定"></button><button id="tlCalendar" aria-label="月カレンダーを開く"></button><span id="tlSourceDot" aria-label="元データ未接続"></span></div><div class="tlEditHeader" hidden id="tlEditHeader"><button id="tlExitEdit" aria-label="タイムラインへ戻る"></button><h2>タイムラインを編集</h2><button id="tlSave" disabled>保存</button></div></header>'''
settings='''<dialog id="tlSettingsDialog" class="dialog"><div class="sheet-head"><h2>記録・連携</h2><button id="tlCloseSettings" class="sheet-close" aria-label="閉じる">×</button></div><p id="tlStatus" role="status" aria-live="polite">Scriptableで端末へ保存できます。</p><details><summary>表示設定</summary><div class="tlTools"><label>デザイン <select id="tlSkin"><option value="glass" selected>ガラス</option><option value="compact">コンパクト</option></select></label><label>表示 <select id="tlTheme"><option value="light" selected>明るい</option><option value="dark">暗い</option><option value="auto">端末に合わせる</option></select></label><label>背景 <select id="tlWallpaper"><option value="pearl" selected>パール</option><option value="plain">無地</option><option value="A">Mineral</option><option value="B">Graphite</option><option value="C">Matte</option></select></label></div><p class="tlHint">表示設定はこの画面を閉じるまで有効です。</p></details><details><summary>日付を指定</summary><div class="tlTools"><input type="date" id="tlDay" aria-label="表示する日付"></div></details><details><summary>使い方・保存について</summary><p>カードをタップして時刻を編集。右端の↕を450ms長押しして上下へ移動できます。1分＝2px、移動は5分単位です。小さな予定は「未配置と配置の確認 → 配置一覧」から選べます。</p><p>＋ 習慣効率の候補 ／ − 配置の改善候補 ／ ! 重複・移動不足 ／ ? 未確認</p><p>元データと仮配置は別です。保存しても実施済みにはなりません。Apple・Notion・習慣正本は変更しません。</p></details><details class="tlLegacy"><summary>既存の記録・接続状況</summary>'''
# Legacy large hero and advice are retained only inside this closed sheet.
html=html[:frame_start]+header+week+panel+'</div>'+settings+legacy+'</details></dialog>'+html[frame_end:]
# Disable legacy native action in timeline candidate, keep originals untouched.
html=html.replace('保存して反映へ','旧リスト（この版では保存対象外）')
html=html.replace('タスクの完了反映は画面を閉じた後の本人確認が必要です。','この確認版ではNotionへの完了反映は実装していません。')
html=html.replace('画面を閉じた後、本人が承認したタスクだけNotionへ完了反映できます。','この確認版ではNotionへ完了反映しません。')
html=html.replace('function render(){renderHeader();','function render(){renderTimeline();renderHeader();')
html=html.replace(' load(undefined);',ui+'\n load(false);')
html=html.replace("if(seen.has(key)||(visualTaskKey&&seen.has('display:'+visualTaskKey)))continue;","if(seen.has(key))continue;")
html=html.replace('<script>','<script>\n'+core+'\n',1)
(out/'daystream-timeline.html').write_text(html)
bridge=(original/'YOS_DAYSTREAM_NativeBridge_Dev.js').read_text()
# offline integrity, never fetch UI at runtime
start=bridge.index('async function readPreview(){'); end=bridge.index('// Native-only',start)
bridge=bridge[:start]+"async function readPreview(){const html=HTML_BUNDLE;if(sha256Hex(html)!==HTML_SHA256)throw Error('Offline DAYSTREAM HTML integrity mismatch');return html;}\n"+bridge[end:]
bridge=re.sub(r"const PREVIEW_URL = .*?;\n",'',bridge)
bridge=re.sub(r"const HTML_SHA256 = '[a-f0-9]+';", lambda _: "const HTML_SHA256 = '"+hashlib.sha256(html.encode()).hexdigest()+"';\nconst HTML_BUNDLE="+json.dumps(html,ensure_ascii=False)+";",bridge,count=1)
bridge=bridge.replace("const PLAN_FILE='YOS_DAYSTREAM_PLAN_STATE_v1.json';","const PLAN_FILE='YOS_DAYSTREAM_TIMELINE_REVIEW_v1.json';")
# no Notion write path in candidate at all
start=bridge.index('async function notionPage(');end=bridge.index('async function main(){',start)
bridge=bridge[:start]+bridge[end:]
bridge=bridge.replace('const now=new Date(),start=dateKey(addDays(now,-14)),end=dateKey(addDays(now,46));',"const start='2026-10-16',end='2027-01-13';")
# Preserve timeline data inside backward-compatible existing plan envelope. No silent stripping.
bridge=bridge.replace("return {schema:'yos-daystream-plan-v1',days};", "if(value.timeline&&!YOSTimeline.valid(value.timeline))return null;\n  return {schema:'yos-daystream-plan-v1',days,...(value.timeline?{timeline:value.timeline}:{})};")
bridge=bridge.replace('calendarMirror,explicitAction,', 'calendarMirror,explicitAction,syncKey,')
bridge=bridge.replace('const taskEntries=uniqueTasks.map(({calendarMirror,explicitAction,...viewItem})=>viewItem);',"const taskEntries=uniqueTasks.map(({calendarMirror,explicitAction,syncKey,...viewItem})=>({...viewItem,potentialMirror:calendarMirror&&!explicitAction}));")
# strict IDs, preserve timestamps and all appointments without title dedup
s=bridge.index('    const seenAllDay=new Map();');e=bridge.index('    const rows=unique.slice',s)
bridge=bridge[:s]+"    const seen=new Set();const unique=eligible.filter(x=>{if(!x.identifier)return true;const id=String(x.identifier)+'|'+String(x.startDate);if(seen.has(id))return false;seen.add(id);return true});\n"+bridge[e:]
bridge=bridge.replace("if(date<start||date>end)return [];", "if(date>end)return [];\n      const endDate=x.endDate?new Date(x.endDate):null;\n      if(date<start&&(!endDate||dateKey(endDate)<start))return [];")
bridge=bridge.replace("id:clean(x.identifier||i,70)}", "id:clean(x.identifier||'missing-id:'+i,70),startISO:x.isAllDay?'':begin.toISOString(),endISO:!x.isAllDay&&endDate&&Number.isFinite(+endDate)?endDate.toISOString():'',allDay:!!x.isAllDay}")
bridge=bridge.replace("id:clean(row.id||title,70),calendarMirror", "id:clean(row.id||'',70),startISO:ts&&Number.isFinite(ts.getTime())?ts.toISOString():'',endISO:p['期限']?.date?.end&&Number.isFinite(Date.parse(p['期限'].date.end))?new Date(p['期限'].date.end).toISOString():'',calendarMirror")
s=bridge.index('  const seenAllDay=new Set();');e=bridge.index('  // Don\'t send mirror metadata',s)
bridge=bridge[:s]+"  const uniqueApple=apple.rows;\n  // Stable source IDs only: do not collapse independent same-title appointments or Tasks.\n  const uniqueTasks=tasks.rows.filter(t=>!(t.calendarMirror&&!t.explicitAction&&uniqueApple.some(a=>t.syncKey==='calendar:'+a.id)));\n"+bridge[e:]
bridge=bridge.replace("const store=planStore(),prior=readLocalPlan(store);","const store=planStore();let prior=readLocalPlan(store);if(!prior.value&&!prior.blocked&&store){const legacy={fm:store.fm,path:store.fm.joinPath(store.fm.documentsDirectory(),'YOS_DAYSTREAM_PLAN_STATE_v1.json')};prior=readLocalPlan(legacy);}")
# read-only habit contract import, exact old file untouched
s=bridge.index('  // Scriptable\'s completion callback');e=bridge.index('\n}\ntry {await main()',s)
bridge=bridge[:s]+'''  let expectedRaw=store&&store.fm.fileExists(store.path)?store.fm.readString(store.path):null;
  const habits=readHabitSource();
  await web.evaluateJavaScript('window.YOS_TIMELINE_HABITS('+JSON.stringify(habits)+')',false);
  let closedFlag=false;
  // Start callback capture before presentation. Every deliberate Save has its own callback.
  const capture=()=>web.evaluateJavaScript("(function(){window.YOS_DAYSTREAM_ATTACH_SAVE(function(value){completion(value);});})()",true).then(value=>({kind:'save',value}),()=>({kind:'error'}));
  let pending=capture();
  const closed=web.present(true).then(()=>{closedFlag=true;return {kind:'closed'}});
  while(!closedFlag){
    const next=await Promise.race([pending,closed]);if(next.kind!=='save')break;
    let currentRaw;try{currentRaw=store&&store.fm.fileExists(store.path)?store.fm.readString(store.path):null}catch{currentRaw=undefined}
    const ok=!prior.blocked&&currentRaw===expectedRaw&&saveLocalPlan(store,next.value);
    if(ok)expectedRaw=store.fm.readString(store.path);
    if(!closedFlag)await web.evaluateJavaScript('window.YOS_TIMELINE_SAVED('+JSON.stringify(ok)+')',false);
    if(!closedFlag)pending=capture();
  }
  await closed;''' +bridge[e:]
habit='''
function readHabitSource(){
 try{const fm=FileManager.local(),p=fm.joinPath(fm.documentsDirectory(),'YOS_HABIT_FLOW_v1.json');if(!fm.fileExists(p))return {status:'unavailable',lists:{daily:[],weekly:[],monthly:[],yearly:[]}};const raw=fm.readString(p);if(typeof raw!=='string'||raw.length>=65000)return null;const v=JSON.parse(raw);if(v.schema!=='yos-habit-flow-v1'||v.version!==1||!v.lists)return null;const seen=new Set();let count=0;for(const period of ['daily','weekly','monthly','yearly']){const xs=v.lists[period];if(!Array.isArray(xs)||xs.length>40)return null;for(const x of xs){if(!x||! /^[a-zA-Z0-9_-]{1,60}$/.test(x.id)||seen.has(x.id)||typeof x.title!=='string'||!x.title||x.title.length>65||!['anchor','habit'].includes(x.kind))return null;seen.add(x.id);if(++count>100)return null;for(const k of ['anchor','benefit','timing','pair','caution'])if(typeof x[k]!=='string'||x[k].length>210)return null;if(period==='weekly'&&(!Array.isArray(x.weekdays)||!x.weekdays.length||x.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)))return null;if(period==='monthly'&&(!Number.isInteger(x.dayOfMonth)||x.dayOfMonth<1||x.dayOfMonth>31))return null;if(period==='yearly'&&(!/^\\d{2}-\\d{2}$/.test(x.monthDay)||!YOSTimeline.day('2024-'+x.monthDay)))return null;}}return {...v,status:'ok'};}catch{return {status:'error',lists:{daily:[],weekly:[],monthly:[],yearly:[]}}}
}
'''
habit=habit.replace('return null','return {status:"error",lists:{daily:[],weekly:[],monthly:[],yearly:[]}}')
bridge=bridge.replace('async function main(){',habit+'\nasync function main(){')
bridge=bridge.replace("  try{\n    store.fm.writeString(store.path,payload);\n    return store.fm.readString(store.path)===payload;\n  }catch{return false}","""  let before=null;
  try{before=store.fm.fileExists(store.path)?store.fm.readString(store.path):null;if(before!==null)store.fm.writeString(store.path+'.previous',before);store.fm.writeString(store.path,payload);if(store.fm.readString(store.path)===payload)return true;}catch{}
  try{if(before!==null){store.fm.writeString(store.path,before);if(store.fm.readString(store.path)!==before)return false;}else if(store.fm.fileExists(store.path)&&typeof store.fm.remove==='function')store.fm.remove(store.path);}catch{}
  return false;""")

bridge=bridge.replace("'use strict';", "'use strict';\n"+core,1)
(out/'YOS_DAYSTREAM_TimelineBridge_Dev.js').write_text(bridge)
pkg=json.loads((original/'YOS_DAYSTREAM_iPhone_Review_20261102.scriptable').read_text());pkg['name']='YOS DAYSTREAM Timeline 開発確認 20261105';pkg['script']=bridge
(out/'YOS_DAYSTREAM_Timeline_Review_20261105.scriptable').write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n')
