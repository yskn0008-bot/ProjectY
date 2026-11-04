from pathlib import Path
import hashlib,json,re
out=Path(__file__).resolve().parent; original=out if (out/'daystream-native.html').exists() else out.parents[2]/'existing/life/calendar'
core=(out/'daystream-timeline-core.js').read_text(); ui=(out/'daystream-timeline-ui.js').read_text()
style='''
:root{--schedule:#657069;--task:#657069;--habit:#657069;--money:#657069;--accent:#202222}
#tlPanel :focus-visible,#tlEditor :focus-visible{outline:3px solid var(--fg,#202222);outline-offset:3px}
/* Isolated timeline panel: 1 minute = 2 CSS pixels; never stretch event blocks to content. */
#tlPanel{--bg:#f3f3f0;--fg:#202222;--sub:#535959;--border:#707872;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:18px;padding:16px;margin-top:16px;font-size:16px;line-height:1.5}
#tlPanel[data-wallpaper]{background:var(--bg)}
#tlPanel[data-wallpaper]{background:var(--bg)}
#tlPanel[data-wallpaper]{background:var(--bg)}
#tlPanel[data-theme=dark]{--bg:#202323;--fg:#f3f5f0;--sub:#c4cbc6;--border:#7a847e;color-scheme:dark}
@media(prefers-color-scheme:dark){#tlPanel[data-theme=auto]{--bg:#202323;--fg:#f3f5f0;--sub:#c4cbc6;--border:#7a847e;color-scheme:dark}}
#tlPanel .tlDrag{position:absolute;right:2px;width:44px;height:44px;min-height:44px;padding:0;z-index:6;touch-action:none;font-size:24px}#tlPanel h2{font-size:25px;margin:0}#tlPanel h3{font-size:18px}#tlPanel button,#tlPanel input,#tlPanel select,#tlEditor button,#tlEditor input,#tlEditor select{font:inherit;font-size:16px;min-height:44px;max-width:100%;padding:8px;border:1px solid var(--border,#707872);border-radius:9px;background:var(--bg,#fff);color:var(--fg,#222)}
.tlTools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0}.tlTools label{display:flex;gap:6px;align-items:center}#tlPanel p{margin:10px 0}#tlState{font-weight:700}#tlStatus{min-height:24px;color:var(--sub)}
#tlViewport{height:60vh;min-height:340px;overflow:auto;border:1px solid var(--border);border-radius:10px;overscroll-behavior:contain;position:relative;background:var(--bg)}#tlGrid{height:2880px;position:relative;margin-top:16px;margin-bottom:30px}.tlHour{position:absolute;left:0;right:0;height:1px;border-top:1px solid var(--border);font-size:16px;line-height:20px;color:var(--sub);pointer-events:none}
#tlPanel .tlBlock{position:absolute;min-height:0;padding:0 6px;border-radius:4px;text-align:left;overflow:hidden;line-height:1.3;font-size:16px;background:var(--bg);box-shadow:inset 4px 0 #737d76;color:var(--fg);touch-action:pan-y;z-index:1}.tlBlock.fixed{border-style:dashed!important}.tlBlock.conflict{border:2px solid #bf3d37!important}.tlBlock.dragging{z-index:5;opacity:.8;outline:3px solid var(--fg)}
#tlPanel .tlNote{padding-left:10px;border-left:3px solid currentColor}.green{color:#167044}.amber{color:#955300}.red{color:#bf302e}.neutral{color:var(--sub)}#tlPanel[data-theme=dark] .green{color:#7fdeb0}#tlPanel[data-theme=dark] .amber{color:#ffc476}#tlPanel[data-theme=dark] .red{color:#ffa7a1}#tlUnplaced,#tlPlaced{display:grid;gap:8px}#tlPlaced button{text-align:left}#tlEditor{font-size:16px;background:#fafbf9}#tlEditor label{display:grid;gap:4px;margin:12px 0}#tlEditor select,#tlEditor input{width:100%}#tlEditor::backdrop{background:#0008}
'''
panel='''<section id="tlPanel" data-theme="auto" data-wallpaper="A" aria-label="YOS 24時間タイムライン 開発確認版">
<h2>24時間の流れ</h2><p id="tlState">仮配置／未保存</p><p>予定を守りながら、習慣とタスクを配置。起床・睡眠・所要時間は本人の設定値を使います。</p>
<div class="tlTools"><button id="tlPrev" aria-label="前日">‹</button><label>日付 <input type="date" id="tlDay"></label><button id="tlNext" aria-label="翌日">›</button></div>
<div class="tlTools"><label>背景 <select id="tlWallpaper"><option value="A">A Mineral</option><option value="B">B Graphite</option><option value="C">C Matte</option><option value="plain">無地</option></select></label><label>表示 <select id="tlTheme"><option value="auto">端末に合わせる</option><option value="light">明るい</option><option value="dark">暗い</option></select></label></div>
<div class="tlTools"><button id="tlAdd">＋ 配置を追加</button><button id="tlUndo" disabled>元に戻す</button><button id="tlSave" disabled>確認して端末へ保存</button></div><p id="tlStatus" role="status" aria-live="polite">ブラウザ単独では保存できません。Scriptable確認版では端末ファイルへ保存できます。</p>
<p id="tlDayLabel"></p><p>右端の↕を長押し450ms → 上下に移動。カード表面はスクロールできます。1分＝2px、移動は5分単位。タップ・下の配置一覧・矢印キーでも編集できます。</p><div id="tlViewport" tabindex="0" aria-label="0時から24時のタイムライン"><div id="tlGrid"></div></div>
<h3>配置一覧・時刻編集</h3><div id="tlPlaced"></div><h3>配置の影響</h3><p>＋ 習慣効率の候補 ／ − 配置の改善候補 ／ ! 重複・移動不足 ／ ? 未確認</p><div id="tlNotes" aria-live="polite"></div><h3>未配置：習慣・タスク／終日予定</h3><p id="tlHabitStatus"></p><div id="tlUnplaced"></div><p>元データと仮配置は別です。チェックや保存を実施済みとは扱いません。Apple・Notion・習慣正本は変更しません。</p></section>
<dialog id="tlEditor" class="dialog"><form id="tlForm"><h2>配置を編集</h2><p>所要時間・移動時間は計画値。元の予定は変更しません。</p><input id="tlId" type="hidden"><input id="tlSourceRef" type="hidden"><label>名前 <input id="tlTitle" maxlength="120" required></label><label>日付 <input id="tlDate" type="date" required></label><label>開始 <input id="tlTime" type="time" required></label><label>所要時間（分・翌日へ継続可）<input id="tlDuration" type="number" min="1" max="1440" required></label><label>行動 <select id="tlKind"><option value="other">その他</option><option value="task">タスク</option><option value="habit">習慣</option><option value="sleep">睡眠</option><option value="meal">食事</option><option value="walk">歩行</option><option value="wash">洗顔・洗浄</option><option value="moisturizer">保湿</option><option value="travel">移動</option></select></label><label>この前に必要な移動時間（分）<input id="tlTransfer" type="number" min="0" max="240" required></label><label>繰り返し <select id="tlRepeat"><option value="none">この日だけ</option><option value="daily">毎日</option><option value="weekly">毎週</option><option value="monthly">毎月（月末で調整）</option><option value="yearly">毎年（月末で調整）</option></select></label><label>変更範囲 <select id="tlScope" hidden><option value="instance">この回の時刻・所要時間だけ</option><option value="series">全体を更新（例外時刻もリセット）</option></select></label><p id="tlError" role="alert"></p><div class="tlTools"><button type="submit">仮配置へ反映</button><button type="button" id="tlCancel">キャンセル</button></div></form></dialog>
'''
ui=ui.replace("$('tlNotes').replaceChildren();", "$('tlPlaced').replaceChildren();for(const x of rows){const p=document.createElement('button');p.textContent=(x.fixed?'固定 · ':'')+x.title+' '+TL.clock(x.start)+' / '+(x.endAbs===null?'終了不明':x.duration?x.duration+'分':Math.round(x.endAbs-x.startAbs)+'分');p.addEventListener('click',()=>tlEdit(x));$('tlPlaced').append(p)}\n $('tlNotes').replaceChildren();")
# Habit file is read-only, imported only into separate unplaced section.
ui=ui.replace("const source=state.native?state.native.items:state.items;const seen=new Set();", "const source=[...(state.native?state.native.items:state.items),...tlHabitRows()];const seen=new Set();")
ui=ui.replace(" const TL=window.YOSTimeline;", " const TL=window.YOSTimeline;\n let habitSource=null;window.YOS_TIMELINE_HABITS=function(v){habitSource=v;renderTimeline();return true};\n function tlHabitRows(){if(!habitSource)return [];const d=new Date(state.selected+'T12:00:00Z'),dom=d.getUTCDate(),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();return ['daily','weekly','monthly','yearly'].flatMap(period=>(habitSource.lists[period]||[]).filter(x=>period==='daily'||period==='weekly'&&x.weekdays.includes(d.getUTCDay())||period==='monthly'&&Math.min(x.dayOfMonth,last)===dom||period==='yearly'&&Number(x.monthDay.slice(0,2))===d.getUTCMonth()+1&&Math.min(Number(x.monthDay.slice(3)),last)===dom).map(x=>({id:x.id,title:x.title,source:'YOS_HABIT_FLOW_v1',type:'habit',date:state.selected,repeat:period==='daily'?'daily':period==='weekly'?'weekly':period==='monthly'&&x.dayOfMonth===dom?'monthly':period==='yearly'&&Number(x.monthDay.slice(3))===dom?'yearly':'none'})));}\n")
# Embed reviewed Canva texture exports; no network requests.
import base64
for k,n in [('A','mineral.png'),('B','graphite.png'),('C','matte.png')]:
    asset=out/'design'/n
    if asset.exists():
        uri='data:image/png;base64,'+base64.b64encode(asset.read_bytes()).decode()
        style+='\n#tlPanel[data-wallpaper='+k+']{background:url(\"'+uri+'\") center/cover fixed;box-shadow:inset 0 0 0 99999px var(--veil,#f3f3f0e8)}\n'
style+='\n@media(prefers-color-scheme:dark){#tlPanel[data-theme=auto]{--veil:#202323e8}#tlPanel[data-theme=auto] .green{color:#7fdeb0}#tlPanel[data-theme=auto] .amber{color:#ffc476}#tlPanel[data-theme=auto] .red{color:#ffa7a1}}\n#tlPanel[data-theme=dark]{--veil:#202323e8}.tlBlock.linked{border-color:#24734c!important}.tlBlock.separated:not(.conflict){border-color:#a95b00!important}\n'
html=(original/'daystream-native.html').read_text().replace('</style>',style+'\n</style>')
html=html.replace('  <section class="dayplan"',panel+'\n<details><summary style="font-size:16px;padding:12px">既存DAYSTREAMの順番リスト</summary>\n  <section class="dayplan"',1).replace('</section>\n<details class="sourcelist">','</section></details>\n<details class="sourcelist">',1)
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
