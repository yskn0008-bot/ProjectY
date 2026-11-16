/* Area pages for YOS Calendar: private tasks are read only from authorized local snapshots. */
(function(root){
'use strict';
const NAMES=['Money','Work','Health','Self','Life'],LOCAL='YOS_CALENDAR_AREA_LOCAL_V1',SNAP='YOS_DAYSTREAM_WEB_TASK_SNAPSHOT_V1';
const VALID=new Set(['次にやる','実行中','本人操作','待ち','保留','完了']);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const validDate=x=>typeof x==='string'&&DATE.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const clean=(x,n=100)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):'';
function classify(t,a){
 const s=clean(t),old=clean(a,30);
 if(/^(Self|90day|眉毛育成|イケメン計画|肌タイプ|美容|皮膚科|AGA)/i.test(s)||/スキンケア|眉毛|医療脱毛|歯科検診/.test(s))return 'Self';
 if(/^(Health|起床後ストレッチ|運動習慣)/i.test(s)||/柔軟|ストレッチ|ウォーキング/.test(s))return 'Health';
 if(/^(Money|返済|家計|法的手続|家賃収入)/i.test(s)||/引き落とし|支払期限/.test(s))return 'Money';
 if(/^(Work|タクシー|乗務|運行|履歴書)/i.test(s)||/面接|研修/.test(s))return 'Work';
 if(old==='ProjectY'||old==='Work')return 'Work';
 if(old==='Money'||old==='Health'||old==='Self')return old;
 return 'Life';
}
function readNotion(store,now){
 let s,raw;try{raw=store.getItem(SNAP);if(!raw)return {status:'missing',tasks:[]};if(raw.length>1000000)throw Error('size');s=JSON.parse(raw)}catch{return {status:'invalid',tasks:[]}}
 const at=Date.parse(s?.checkedAt),age=now-at;
 if(s?.schema!=='yos-daystream-source-snapshot-v1'||s.kind!=='tasks'||!['yos-auth-cache','user-file'].includes(s.source)||s.origin!=='notion'||s.complete!==true||!['ok','partial'].includes(s.status)||!Array.isArray(s.items)||s.items.length>400||!Number.isFinite(age))return {status:'invalid',tasks:[]};
 if(age< -300000||age>(s.source==='user-file'?604800000:21600000))return {status:'stale',tasks:[]};
 const tasks=[],seen=new Set();
 for(const t of s.items){
  if(!t||!/^notion-[a-f0-9]{32}$/.test(t.id)||seen.has(t.id)||!clean(t.title)||!VALID.has(t.status)||t.due&&!validDate(t.due))return {status:'invalid',tasks:[]};
  seen.add(t.id);
  if(['calendar','money'].includes(t.sourceFamily))continue;
  if(t.sourceFamily==='reminder'){const stamp=t.lastSynced;if(typeof stamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(stamp)||now-Date.parse(stamp)>86400000||now-Date.parse(stamp)<-300000)continue}
  tasks.push({id:t.id,title:clean(t.title),area:classify(t.title,t.area),due:t.due||'',status:t.status,habit:!!t.habitCycle,url:'https://www.notion.so/'+t.id.slice(7)});
 }
 return {status:'ready',tasks,at:s.checkedAt};
}
function readLocal(store){
 try{const raw=store.getItem(LOCAL);if(!raw)return {ok:true,rows:[],checks:{}};
  if(raw.length>150000)throw Error('length');
  const o=JSON.parse(raw),ids=new Set();
  if(o?.version!==1||!Array.isArray(o.rows)||o.rows.length>180||!o.checks||typeof o.checks!=='object'||Object.keys(o.checks).length>1200)throw Error('shape');
  for(const t of o.rows){if(!t||!/^[a-f0-9-]{36}$/.test(t.id)||ids.has(t.id)||!NAMES.includes(t.area)||!['task','habit'].includes(t.kind)||!clean(t.title)||t.title!==clean(t.title)||t.due&&!validDate(t.due)||typeof t.done!=='boolean')throw Error('entry');ids.add(t.id)}
  if(!Object.values(o.checks).every(v=>v===true))throw Error('check');
  return {ok:true,rows:o.rows,checks:o.checks}
 }catch{return {ok:false,rows:[],checks:{}}}
}
function saveLocal(store,o){
 if(!o.ok)return false;
 const old=store.getItem(LOCAL),next=JSON.stringify({version:1,rows:o.rows,checks:o.checks});
 if(next.length>150000)return false;
 try{
  if(old!==null){store.setItem(LOCAL+'_BACKUP',old);if(store.getItem(LOCAL+'_BACKUP')!==old)return false}
  store.setItem(LOCAL,next);if(store.getItem(LOCAL)!==next)throw Error('verify');return true
 }catch{try{if(old===null)store.removeItem(LOCAL);else store.setItem(LOCAL,old)}catch{}return false}
}
function itemsForDay(day){
 if(!validDate(day))return [];
 const o=readLocal(root.localStorage);
 if(!o.ok)return [];
 return o.rows.filter(t=>t.kind==='habit'||t.due===day).map(t=>({
  id:'area-local:'+t.id,sourceId:t.id,date:day,title:t.title,type:t.kind,area:t.area,
  subtitle:t.kind==='habit'?'毎日の習慣 · 分野別ページで記録':'端末内タスク · 分野別ページで記録',
  done:t.kind==='habit'?o.checks[t.id+'|'+day]===true:t.done,
  source:'この端末のみ（Notion未同期）',sourceKind:'local'
 }));
}
root.YOS_CALENDAR_AREAS={classify,readNotion,readLocal,saveLocal,itemsForDay};
if(!root.document||!root.YOS_APPROVED_CALENDAR)return;
const d=root.document,host=d.getElementById('approvedCalendar'),nav=host?.querySelector('.cal-nav'),api=root.YOS_APPROVED_CALENDAR;
if(!host||!nav)return;
const node=(tag,cls,value)=>{const e=d.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e};
const btn=(value,fn,cls)=>{const e=node('button',cls,value);e.type='button';e.addEventListener('click',fn);return e};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let active=false,chosen='Self',day=today(),source=null;
const panel=node('section','cal-area-page');panel.id='calAreasPanel';panel.hidden=true;
host.insertBefore(panel,d.getElementById('calNotice'));
const tab=btn('タスク・習慣',()=>open(chosen),'cal-areas-nav');nav.append(tab);
for(const b of [...nav.querySelectorAll('button')].slice(0,2))b.addEventListener('click',()=>{active=false;visible()},true);
function visible(){
 host.classList.toggle('cal-area-mode',active);panel.hidden=!active;
 tab.setAttribute('aria-current',active?'page':'false');
 for(const sel of ['.cal-period','.cal-month','.cal-summary','.cal-daily','.cal-filters']){const e=host.querySelector(sel);if(e)e.hidden=active||(sel==='.cal-filters'&&host.dataset.view!=='month')||(sel==='.cal-month'&&host.dataset.view!=='month')||(sel==='.cal-summary'&&host.dataset.view!=='month')||(sel==='.cal-daily'&&host.dataset.view!=='day')}
 if(active){host.querySelector('.cal-heading h1').textContent='Tasks & Habits';render()}
}
function open(a){chosen=NAMES.includes(a)?a:'Self';active=true;visible()}
const original=api.update.bind(api);
api.update=function(value){source=value;original(value);if(active)visible()};
function commit(o){if(saveLocal(root.localStorage,o)){if(source)api.update(source);else render()}else root.alert('端末内の保存に失敗しました')}
function create(title,kind,due){
 const o=readLocal(root.localStorage);if(!o.ok){root.alert('保存済みデータの形式を確認できません。上書きせず保護しました');return}
 if(o.rows.length>=180)return;
 if(o.rows.some(x=>x.area===chosen&&x.title===title&&x.kind===kind&&x.due===due))return;
 if(!root.crypto?.randomUUID)return;
 o.rows.push({id:root.crypto.randomUUID(),area:chosen,title,kind,due,done:false});commit(o)
}
function render(){
 panel.replaceChildren();
 panel.append(node('h2',null,'分野別タスク・習慣'));
 const navs=node('div','cal-area-tabs');
 for(const a of NAMES){const b=btn(a,()=>open(a));b.setAttribute('aria-selected',String(a===chosen));navs.append(b)}
 panel.append(navs);
 const header=node('div','cal-area-subhead');header.append(node('h3',null,chosen));
 const date=node('input');date.type='date';date.value=day;date.setAttribute('aria-label','表示日');date.addEventListener('change',()=>{if(validDate(date.value)){day=date.value;render()}});header.append(date);panel.append(header);
 const notion=readNotion(root.localStorage,Date.now()),local=readLocal(root.localStorage);
 const map={missing:'未接続（このブラウザには取得済みのNotionデータなし）',stale:'保存済みNotionデータの期限切れ',invalid:'取得記録が不正（安全のため非表示）',ready:'Notion取得済みの写し（自動更新ではありません）'};
 panel.append(node('p','cal-area-status',map[notion.status]||'未確認'));
 const mine=local.ok?local.rows.filter(x=>x.area===chosen&&(x.kind==='habit'||!x.due||x.due===day)):[];
 panel.append(node('h4',null,'この端末のタスク・習慣'));
 if(!local.ok)panel.append(node('p','cal-area-error','保存済みの端末内データを検証できません。変更せず保持しています。'));
 if(!mine.length)panel.append(node('p','cal-area-empty','この日に表示する端末内の記録はありません'));
 for(const t of mine){
  const done=t.kind==='habit'?local.checks[t.id+'|'+day]===true:t.done;
  const row=node('div','cal-area-task'),copy=node('div','cal-area-task-copy');
  copy.append(node('strong',done?'cal-area-done':'',t.title),node('small',null,(t.kind==='habit'?'毎日':t.due||'期限なし')+' · 端末内のみ（Notion未同期）'));
  row.append(btn(done?'✓':'○',()=>{const o=readLocal(root.localStorage);if(!o.ok)return;if(t.kind==='habit'){const k=t.id+'|'+day;if(o.checks[k])delete o.checks[k];else o.checks[k]=true}else{const r=o.rows.find(x=>x.id===t.id);if(r)r.done=!r.done}commit(o)},'cal-area-check'),copy,btn('削除',()=>{if(!root.confirm('この端末の項目を削除しますか？'))return;const o=readLocal(root.localStorage);if(!o.ok)return;o.rows=o.rows.filter(x=>x.id!==t.id);for(const k of Object.keys(o.checks))if(k.startsWith(t.id+'|'))delete o.checks[k];commit(o)},'cal-area-delete'));panel.append(row)
 }
 const form=node('form','cal-area-add'),input=node('input'),kind=node('select'),due=node('input');
 input.required=true;input.maxLength=100;input.placeholder='タスク・習慣を追加';input.setAttribute('aria-label','タスク名');
 for(const [val,title] of [['task','タスク'],['habit','毎日の習慣']]){const op=node('option',null,title);op.value=val;kind.append(op)}
 due.type='date';due.value=day;due.setAttribute('aria-label','期限');
 kind.addEventListener('change',()=>{due.hidden=kind.value==='habit'});
 const add=node('button',null,'追加');add.type='submit';form.append(input,kind,due,add);
 form.addEventListener('submit',e=>{e.preventDefault();if(clean(input.value))create(clean(input.value),kind.value,kind.value==='habit'?'':due.value)});panel.append(form);
 const tips={Money:['支払予定を週1回確認'],Work:['勤務前の安全確認','乗務後の売上記録'],Health:['食後に短く歩く','起床後に軽く体を動かす'],Self:['朝の身だしなみ','夜のスキンケア','歯磨き','眉毛育成を確認'],Life:['帰宅後に3分片付け','翌週の準備']};
 const suggestions=node('div','cal-area-suggestions');suggestions.append(node('p',null,'必要なら習慣として追加'));
 for(const t of tips[chosen])suggestions.append(btn('＋ '+t,()=>create(t,'habit','')));
 panel.append(suggestions);
 const seen=new Set(notion.tasks.map(t=>t.id));
 const fromSources=source?.demo===false?(source?.items||[]).filter(t=>
   t&&['task','habit'].includes(t.type)&&t.date===day&&!String(t.id||'').startsWith('area-local:')&&
   (t.sourceId?.startsWith('notion-')?(!seen.has(t.sourceId)):(t.source!=='デザイン比較用の架空データ'))&&
   classify(t.title,t.area)===chosen):[];
 panel.append(node('h4',null,'この日の取得済みタスク '+fromSources.length+'件'));
 for(const t of fromSources.slice(0,50)){
  const row=node('div','cal-area-task'),detail=node('div','cal-area-task-copy');
  detail.append(node('strong',null,clean(t.title)),node('small',null,(t.done?'完了記録あり':'未完了・要確認')+' · '+clean(t.source||'取得元未確認',40)));
  row.append(node('span','cal-area-n','•'),detail);panel.append(row)
 }
 const tasks=notion.tasks.filter(t=>t.area===chosen&&t.status!=='完了').sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
 panel.append(node('h4',null,'Notionの未完了タスク '+tasks.length+'件'));
 if(!tasks.length)panel.append(node('p','cal-area-empty',notion.status==='ready'?'この分野の未完了は取得されていません':'Notionを安全に取り込むと、ここへ期限あり・期限なしのタスクを表示します'));
 for(const t of tasks){
  const row=node('div','cal-area-task'),detail=node('div','cal-area-task-copy');
  detail.append(node('strong',null,t.title),node('small',null,(t.due?(t.due<day?'期限経過・確認が必要 · ':'期限 ')+t.due:'期限未設定')+' · '+t.status));
  const link=node('a','cal-area-link','原本');link.href=t.url;link.target='_blank';link.rel='noopener noreferrer';
  row.append(node('span','cal-area-n','N'),detail,link);panel.append(row)
 }
 panel.append(node('p','cal-area-foot','非公開Notionタスクはサイトの公開コードに含めていません。Notionの最新データを取得するには既存の安全な取込が必要です。端末内のチェックはNotionへ同期しません。'))
}
root.YOS_CALENDAR_AREAS.open=open;
})(window);
