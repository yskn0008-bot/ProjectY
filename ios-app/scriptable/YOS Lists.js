// Variables used by Scriptable.
// icon-color: blue; icon-glyph: check-square;
// YOS_SCRIPT_NAME: YOS Lists
// Unified, read-back verified Notion Tasks + Shopping dashboard.
// Existing YOS Shopping, databases and Keychain are not modified.
'use strict';

const APP='YOS Lists';
const NOTION_KEY='YOS_NOTION_INTEGRATION_TOKEN'; // Same existing Keychain key as YOS Shopping.
const VERSION='2026-03-11';
const SOURCES={
 task:'965c6086-32c1-463d-93b4-87a9cb69b3ad',
 shopping:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc'
};
const tidy=(x,n=220)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):'';
const id32=x=>tidy(x,45).replace(/-/g,'').toLowerCase();
const validId=x=>/^[0-9a-f]{32}$/.test(id32(x));
const select=x=>tidy(x?.select?.name||'',60);
const rich=(p,type)=>Array.isArray(p?.[type])?tidy(p[type].map(x=>x?.plain_text||x?.text?.content||'').join(''),180):'';
const date=x=>tidy(x?.date?.start||'',40);
const token=(()=>{try{return Keychain.contains(NOTION_KEY)?Keychain.get(NOTION_KEY):''}catch{return ''}})();

function itemFromRow(row,kind){
 if(!row||row.archived||row.in_trash||!validId(row.id)||!row.properties)return null;
 const p=row.properties;
 const name=kind==='task'?rich(p['やること'],'title'):rich(p['商品名'],'title');
 if(!name)return null;
 return kind==='task'?{
  id:id32(row.id),kind,name,state:select(p['状態']),priority:select(p['優先度']),
  type:select(p['種類']),owner:select(p['担当']),due:date(p['期限']),
  next:rich(p['次の一手'],'rich_text'),updatedAt:tidy(row.last_edited_time,65)
 }:{
  id:id32(row.id),kind,name,type:select(p['区分']),state:select(p['買い物状態']),
  category:select(p['分類']),priority:select(p['優先度']),purchased:p['購入済']?.checkbox===true||select(p['買い物状態'])==='購入済',
  stock:Number.isFinite(p['在庫数']?.number)?p['在庫数'].number:null,
  reorder:Number.isFinite(p['補充基準']?.number)?p['補充基準'].number:null,
  updatedAt:tidy(row.last_edited_time,65)
 };
}

async function notion(path,method='GET',body=null){
 if(!token||token.length<10)throw Error('既存Notion接続情報がありません。YOS Shoppingの接続を確認してください');
 const req=new Request('https://api.notion.com/v1/'+path);
 req.method=method;req.timeoutInterval=25;
 req.headers={Authorization:'Bearer '+token,'Notion-Version':VERSION,'Content-Type':'application/json',Accept:'application/json'};
 if(body!==null)req.body=JSON.stringify(body);
 let reply;
 try{reply=await req.loadJSON()}catch{throw Error('Notionから応答を読み取れません。通信を確認してください')}
 const status=req.response?.statusCode;
 if(status<200||status>=300||!reply||typeof reply!=='object'){
  // Notion returns a JSON error with code/message. Show the bounded reason,
  // not only HTTP 400, without exposing the token or raw request body.
  const scope=path.startsWith('data_sources/'+SOURCES.task+'/')?'YOS Tasks':
    path.startsWith('data_sources/'+SOURCES.shopping+'/')?'YOS Shopping':'ページ更新';
  const code=tidy(reply?.code,50);
  const reason=tidy(reply?.message,200)
   .replace(/The start_cursor provided is invalid:.*$/i,'The start_cursor provided is invalid')
   .replace(/\b(?:secret|ntn)_[\w-]{8,}/gi,'[非表示]');
  throw Error(scope+'｜HTTP '+(status||'不明')+(code?' '+code:'')+
    (reason?'｜'+reason:'｜Notionの応答理由を取得できません'));
 }
 return reply;
}

async function readSource(kind){
 const result=[],seen=new Set(),source=SOURCES[kind];
 const path='data_sources/'+source+'/query';
 async function queryPage(body){
  for(let attempt=0;attempt<3;attempt++){
   try{return await notion(path,'POST',body)}
   catch(err){
    if(!/HTTP 429\b/.test(String(err?.message))||attempt===2)throw err;
    // Only retry a rejected read query; never blindly resend PATCH mutations.
    await new Promise(resolve=>Timer.schedule(attempt+1,false,resolve));
   }
  }
  throw Error('Notion取得の再試行が上限に達しました');
 }
 function collect(rows){
  for(const row of rows){
   const id=id32(row?.id);
   if(!validId(id)||seen.has(id))throw Error('NotionのIDが不正・重複しています。タスク一覧は未取得として保護しました');
   seen.add(id);
   const item=itemFromRow(row,kind);
   if(item)result.push(item);
  }
  if(seen.size>700)throw Error('Notion一覧が700件を超えました。一部のみの表示を中止します');
 }
 function checkPage(value){
  if(!Array.isArray(value?.results)||typeof value.has_more!=='boolean')
   throw Error('Notion一覧の形式が不正です');
  return value;
 }
 // Keep the 1-request path for short lists (including current YOS Shopping).
 const first=checkPage(await queryPage({page_size:100}));
 if(!first.has_more){
  collect(first.results);
  return result;
 }
 // Notion's opaque start_cursor can become invalid between requests.
 // For large collections use disjoint created_time windows; never reuse a cursor,
 // and never display an incomplete subset as a successful full result.
 const earliest=Date.parse('2000-01-01T00:00:00.000Z');
 const latest=Date.parse('2100-01-01T00:00:00.000Z');
 let queries=0;
 async function windowRange(from,to,depth){
  if(++queries>64)throw Error('Notionの分割取得回数が上限を超えました。一部のみの表示はしません');
  const filter={and:[
   {timestamp:'created_time',created_time:{on_or_after:new Date(from).toISOString()}},
   {timestamp:'created_time',created_time:{before:new Date(to).toISOString()}}
  ]};
  // Pace Notion bulk reads to respect the ~3 requests/sec API limit.
  await new Promise(resolve=>Timer.schedule(0.4,false,resolve));
  const page=checkPage(await queryPage({page_size:100,filter}));
  if(!page.has_more){
   collect(page.results);
   return;
  }
  if(depth>=40||to-from<=1)throw Error('Notionの同時刻登録が多く、全件取得できません。一部のみの表示はしません');
  const mid=Math.floor((from+to)/2);
  if(mid<=from||mid>=to)throw Error('Notionの取得範囲を安全に分割できません');
  await windowRange(from,mid,depth+1);
  await windowRange(mid,to,depth+1);
 }
 // Query the recent 120-day window first. The older/future windows are still
 // queried, so older items are not silently omitted. This keeps daily use fast.
 const now=Date.now(),day=24*60*60*1000;
 const recentStart=Math.max(earliest,Math.min(latest-2,now-120*day));
 const recentEnd=Math.min(latest,Math.max(recentStart+1,now+3*day));
 await windowRange(recentStart,recentEnd,0);
 if(recentStart>earliest)await windowRange(earliest,recentStart,0);
 if(recentEnd<latest)await windowRange(recentEnd,latest,0);
 return result;
}
async function readAll(){
 // Never let a failed Tasks query hide a healthy Shopping query, or vice versa.
 const [task,shopping]=await Promise.all(['task','shopping'].map(async kind=>{
  try{return {ok:true,items:await readSource(kind),error:''}}
  catch(err){return {ok:false,items:[],error:tidy(err?.message||String(err),250)}}
 }));
 return {
  tasks:task.items,shopping:shopping.items,
  loaded:{task:task.ok,shopping:shopping.ok},
  errors:{task:task.error,shopping:shopping.error},
  readAt:new Date().toISOString()
 };
}

function assertPage(row,kind,id){
 const source=id32(SOURCES[kind]);
 if(!row||id32(row.id)!==id||id32(row.parent?.data_source_id)!==source)
  throw Error('既存Notionの対象項目を確認できません。書込を中止しました');
 const item=itemFromRow(row,kind);
 if(!item||item.id!==id)throw Error('対象項目の名前が確認できません');
 return item;
}
function dayInTokyo(){
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
async function perform(request){
 if(!request||typeof request!=='object')throw Error('操作の形式が不正です');
 if(request.action==='refresh')return {action:'refresh',data:await readAll()};
 const kind=request.kind,operation=request.action,id=id32(request.id),expected=tidy(request.expected,65);
 if(!Object.prototype.hasOwnProperty.call(SOURCES,kind)||!validId(id)||!expected)throw Error('更新する項目の識別情報が不正です');
 if(kind==='task'&&operation!=='complete'||kind==='shopping'&&operation!=='purchase')
  throw Error('許可されていない更新操作です');
 const path='pages/'+id;
 const original=await notion(path);
 const item=assertPage(original,kind,id);
 if(item.updatedAt!==expected)throw Error('ほかの画面で更新されています。右上の更新を押してください');
 if(kind==='task'){
  if(item.type!=='Task')throw Error('ProjectやGoalはこの画面から完了にできません');
  if(item.state==='完了')return {action:operation,kind,item};
 }else if(item.purchased)return {action:operation,kind,item};
 // Freshness check before PATCH, separate from the initial snapshot.
 const current=await notion(path);
 const before=assertPage(current,kind,id);
 if(before.updatedAt!==expected)throw Error('保存直前に変更を検知したため、中止しました');
 if(kind==='task')await notion(path,'PATCH',{properties:{'状態':{select:{name:'完了'}}}});
 else await notion(path,'PATCH',{properties:{
  '購入済':{checkbox:true},'買い物状態':{select:{name:'購入済'}},
  '購入日':{date:{start:dayInTokyo()}}
 }});
 const verified=assertPage(await notion(path),kind,id);
 if(kind==='task'&&verified.state!=='完了'||kind==='shopping'&&!verified.purchased)
  throw Error('Notion保存結果を読み戻せませんでした。再送せず、更新から確認してください');
 return {action:operation,kind,item:verified};
}

const HTML=String.raw`<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>YOS Lists</title>
<style>
:root{
 color-scheme:light;
 --bg:#EFF1F1;--ink:#18293B;--muted:#45596A;
 --blue:#275C8D;--line:#CAD2D8;--panel:#FFFEFC;--red:#BC382F;
 --navy:#122D4E;--navy2:#214D78;--focus:#F0A82B;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",sans-serif;font-size:15px;font-weight:550;-webkit-font-smoothing:antialiased;padding-bottom:calc(90px + env(safe-area-inset-bottom))}
button,input{font:inherit}button{cursor:pointer;touch-action:manipulation}
button:disabled{opacity:.58;cursor:default}
button:focus-visible,input:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
header{
 background:linear-gradient(125deg,#1C293A 0%,#2B3B4D 68%,#3B4B5F 100%);
 padding:max(22px,env(safe-area-inset-top)) 18px 19px;
 border-bottom:1px solid #47566A;position:sticky;top:0;z-index:3;
 box-shadow:0 5px 18px rgba(20,45,77,.15)
}
.top{display:flex;justify-content:space-between;gap:10px;align-items:center}
.eyebrow{font-size:11px;letter-spacing:.18em;color:#B9D7FF;font-weight:800}
h1{font-size:32px;margin:3px 0 0;font-weight:850;letter-spacing:-.045em;color:#FFFFFF}
.refresh{border:1px solid #ACC9F1;background:#FFFFFF;color:#184679;padding:10px 15px;min-height:44px;border-radius:13px;font-weight:800;box-shadow:0 3px 9px rgba(5,24,49,.16)}
.refresh:active{background:#DDEBFF}
.sub{color:#E0EDFF;margin:12px 0 0;font-size:12px;font-weight:600;line-height:1.55}
.tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:14px 13px 10px}
.tab{background:#F8FBFF;color:#294967;border:1px solid #BACBDC;border-radius:14px;padding:10px 1px;min-height:46px;font-weight:800;font-size:13px;box-shadow:0 1px 4px rgba(17,46,79,.07)}
.tab[aria-selected=true]{background:#214B74;color:#FFFFFF;border-color:#214B74;box-shadow:0 4px 11px rgba(16,74,138,.2)}
main{padding:0 13px}
.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:7px 0 17px}
.stat{background:#254E79;color:#FFFFFF;border:1px solid #35618C;border-radius:16px;padding:13px 12px;min-height:87px;box-shadow:0 4px 12px rgba(25,54,85,.14)}
.stat:nth-child(2){background:#256C5B;border-color:#377C6C}
.stat:nth-child(3){background:#94532E;border-color:#AA6941}
.stat b{display:block;font-size:29px;font-weight:850;letter-spacing:-.04em;line-height:1.2;font-variant-numeric:tabular-nums}
.stat small{display:block;margin-top:6px;color:#FFFFFF;font-size:11px;font-weight:700;line-height:1.3}
.tools{display:flex;align-items:center;gap:8px;margin:0 0 12px}
.tools input{width:100%;min-width:0;background:#FFFFFF;color:var(--ink);border:1px solid #AFC1D5;border-radius:13px;padding:12px 14px;min-height:48px;font-size:15px;font-weight:600;outline:none;box-shadow:0 2px 6px rgba(19,49,80,.06)}
.tools input::placeholder{color:#637890;font-weight:550}
.tools input:focus{border-color:#1558A4;outline:3px solid #BCD9FF;outline-offset:1px}
.section{color:#203344;font-size:15px;font-weight:800;margin:19px 3px 12px;letter-spacing:-.01em}
.list{display:flex;flex-direction:column;gap:11px}
.item{background:var(--panel);border:1px solid #C2CDD4;border-radius:17px;padding:15px 13px;display:flex;gap:11px;align-items:flex-start;box-shadow:0 3px 11px rgba(23,50,78,.08)}
.item.done{background:#ECF1F5;box-shadow:none}
.item-body{min-width:0;flex:1}
.item h3{margin:0 0 9px;font-size:15.5px;font-weight:780;line-height:1.5;letter-spacing:-.02em;word-break:break-word;color:#172A3B}
.item.done h3{color:#516478}
.meta{display:flex;flex-wrap:wrap;gap:6px}
.tag{display:inline-block;background:#E2EBF5;color:#3C526C;border:1px solid #D4E1EE;padding:4px 7px;border-radius:7px;font-size:11px;line-height:1.25;font-weight:750}
.tag.urgent{background:#FCE7E3;color:#A72A22;border-color:#F0BAB3}
.tag.high{background:#FFF0D4;color:#845300;border-color:#E8C88A}
.item p{font-size:12.5px;font-weight:550;color:#475E77;margin:9px 0 0;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.action{flex-shrink:0;min-width:72px;min-height:44px;border:1px solid #1C4B73;border-radius:12px;padding:9px 10px;font-size:12.5px;font-weight:800;background:#215786;color:#FFFFFF;box-shadow:0 2px 6px rgba(22,75,135,.2)}
.action:active{background:#0D3F78}
.action.done{color:#1D5A39;background:#DCEFE1;border-color:#A1C6AC;box-shadow:none}
.notice{border:1px solid #D2A451;color:#654417;background:#FFF3D8;border-radius:13px;padding:12px;font-size:12px;font-weight:650;line-height:1.65;margin:10px 0 14px;white-space:pre-wrap;overflow-wrap:anywhere}
.notice[hidden]{display:none}
.empty{text-align:center;color:#4B627B;padding:36px 12px;line-height:1.65;font-weight:600}
#message{position:fixed;bottom:max(14px,env(safe-area-inset-bottom));left:13px;right:13px;border-radius:14px;padding:13px 15px;background:#193A5E;color:#FFFFFF;box-shadow:0 7px 24px rgba(14,43,75,.30);font-size:12px;font-weight:700;line-height:1.45;z-index:9;min-height:20px}
#message[hidden]{display:none}
.footer{text-align:center;color:#4A5F6F;font-size:11px;font-weight:550;line-height:1.6;padding:24px 4px}
@media(max-width:360px){.tab{font-size:12px}.stat{padding:12px 8px}.stat b{font-size:25px}.stat small{font-size:10px}.item{padding:12px 10px}.action{min-width:62px}}
@media(prefers-reduced-motion:no-preference){.tab,.refresh,.action{transition:background-color .15s,border-color .15s,box-shadow .15s}}
</style>
</head>
<body>
<header><div class="top"><div><div class="eyebrow">YOS · LIFE CONTROL</div><h1>Lists</h1></div><button class="refresh" id="refresh">↻ 更新</button></div>
<p class="sub" id="stamp">Notionから取得中…</p></header>
<nav class="tabs" id="tabs" aria-label="リスト"><button class="tab" data-tab="tasks">タスク</button><button class="tab" data-tab="shopping">買い物</button><button class="tab" data-tab="attention">要対応</button><button class="tab" data-tab="projects">案件</button></nav>
<main>
<div class="notice" id="readErrors" role="alert" hidden></div>
<div class="summary"><div class="stat"><b id="nTasks">—</b><small>未完了タスク</small></div><div class="stat"><b id="nShopping">—</b><small>未購入候補</small></div><div class="stat"><b id="nAttention">—</b><small>本人対応</small></div></div>
<div class="tools"><input id="search" type="search" aria-label="リスト内検索" placeholder="検索"></div>
<div class="section" id="section"></div><div class="list" id="list"></div>
<div class="footer">Notion保存は読戻し後に確定表示。Appleリマインダーとは別管理です。</div>
</main>
<div id="message" role="status" aria-live="polite" hidden></div>
<script>
'use strict';
const boot=__BOOT__;
const state={...boot,tab:'tasks',query:'',busy:false};
const $=id=>document.getElementById(id);
const q=[];
let pendingCallback=null;
function emit(x){q.push(x);if(pendingCallback){const cb=pendingCallback;pendingCallback=null;cb(q.shift());}}
window.YOS_LISTS_WAIT=function(cb){pendingCallback=cb;if(q.length){pendingCallback=null;cb(q.shift());}};
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||'&#39;'));
const day=x=>{if(!x)return'';try{return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'}).format(new Date(x.length===10?x+'T00:00:00+09:00':x))}catch{return x.slice(0,10)}};
const isOpen=x=>x.state!=='完了'&&x.type==='Task';
const isShopping=x=>!x.purchased&&x.type==='欲しいもの';
const needsAttention=x=>x.type==='Task'&&(x.state==='本人操作'||x.state==='待ち');
const overdue=x=>x.due&&x.due.slice(0,10)<new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const labels=t=>[t.priority||'',t.state||'',t.due?'期限 '+day(t.due):''].filter(Boolean);
const order=(a,b)=>Number(overdue(b))-Number(overdue(a))||(['P0','P1','P2','P3'].indexOf(a.priority)<0?4:['P0','P1','P2','P3'].indexOf(a.priority))-(['P0','P1','P2','P3'].indexOf(b.priority)<0?4:['P0','P1','P2','P3'].indexOf(b.priority))||String(a.due||'9999').localeCompare(String(b.due||'9999'));
function notice(message,hide=false){const n=$('message');if(hide){n.hidden=true;return;}n.textContent=message;n.hidden=false;}
function render(){
 const ready=state.loaded||{task:true,shopping:true};
 const issues=['task','shopping'].filter(kind=>ready[kind]===false)
  .map(kind=>(kind==='task'?'タスク':'買い物')+'：'+String(state.errors?.[kind]||'取得に失敗しました'));
 const errorNode=$('readErrors');errorNode.hidden=issues.length===0;
 errorNode.textContent=issues.length?'Notionの取得に失敗しました。未取得の項目は更新できません。\n'+issues.join('\n')+'\n右上の「更新」で再試行できます。':'';
 $('nTasks').textContent=ready.task?state.tasks.filter(isOpen).length:'—';
 $('nShopping').textContent=ready.shopping?state.shopping.filter(isShopping).length:'—';
 $('nAttention').textContent=ready.task?state.tasks.filter(needsAttention).length:'—';
 const readAt=state.readAt?new Date(state.readAt):null;
 const stamp=readAt?readAt.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未確認';
 $('stamp').textContent=(issues.length?'Notion未取得あり ':'Notion取得 ')+stamp+' · '+(issues.length?'失敗した項目は保存不可':'タップでNotionへ保存');
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));
 const term=state.query.trim().toLocaleLowerCase('ja-JP');
 let items=[],title='';
 if(state.tab==='tasks'){items=state.tasks.filter(isOpen);title='未完了タスク · '+items.length+'件';}
 if(state.tab==='shopping'){items=state.shopping.filter(x=>!x.purchased);title='未購入・日用品 · '+items.length+'件';}
 if(state.tab==='attention'){items=state.tasks.filter(needsAttention);title='本人操作・待ち · '+items.length+'件';}
 if(state.tab==='projects'){items=state.tasks.filter(x=>x.type==='Project'&&x.state!=='完了');title='進行中・保留の案件 · '+items.length+'件';}
 const activeKind=state.tab==='shopping'?'shopping':'task';
 const failed=ready[activeKind]===false;
 if(term)items=items.filter(x=>(x.name+' '+(x.next||'')+' '+x.priority+' '+x.category).toLocaleLowerCase('ja-JP').includes(term));
 items.sort((a,b)=>a.kind==='task'&&b.kind==='task'?order(a,b):String(b.updatedAt).localeCompare(String(a.updatedAt)));
 $('section').textContent=(failed?'未取得 · ':'')+title+(term?' · 検索結果 '+items.length+'件':'');
 $('list').innerHTML=items.length?items.map(item=>{
  const task=item.kind==='task',done=task?item.state==='完了':item.purchased;
  const detail=task?item.next:(item.type==='日用品'?'日用品・在庫 '+(item.stock??'未登録'):'');
  const tags=task?labels(item):[item.category,item.type,item.priority].filter(Boolean);
  const action=task&&item.type==='Task'?'<button class="action" data-action="complete" data-kind="task" data-id="'+safe(item.id)+'" '+(state.busy||ready[item.kind]===false?'disabled':'')+'>完了</button>':
    !task&&!done?'<button class="action" data-action="purchase" data-kind="shopping" data-id="'+safe(item.id)+'" '+(state.busy?'disabled':'')+'>購入済</button>':'';
  return '<article class="item'+(done?' done':'')+'"><div class="item-body"><h3>'+safe(item.name)+'</h3><div class="meta">'+tags.map(t=>'<span class="tag'+(t==='P0'?' urgent':t==='P1'?' high':'')+'">'+safe(t)+'</span>').join('')+'</div>'+
   (detail?'<p>'+safe(detail)+'</p>':'')+'</div>'+action+'</article>';
 }).join(''):'<div class="empty">'+(failed?'この項目はNotionから取得できませんでした。右上の更新で再試行してください。':'表示する項目がありません。')+'</div>';
}
$('tabs').addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(!tab)return;state.tab=tab.dataset.tab;render()});
$('search').addEventListener('input',e=>{state.query=e.target.value;render()});
$('refresh').addEventListener('click',()=>{if(state.busy)return;state.busy=true;notice('Notionの最新情報を取得中…');render();emit({action:'refresh'})});
$('list').addEventListener('click',e=>{
 const b=e.target.closest('button[data-action]');if(!b||state.busy)return;
 const kind=b.dataset.kind,action=b.dataset.action;
 const item=(kind==='task'?state.tasks:state.shopping).find(x=>x.id===b.dataset.id);
 if(!item||state.loaded?.[kind]===false)return;
 if(kind==='shopping'&&!window.confirm('「'+item.name+'」を購入済みとして記録しますか？\\n購入・決済は行いません。'))return;
 state.busy=true;notice('Notionに保存して確認中…');render();
 emit({action,kind,id:item.id,expected:item.updatedAt});
});
window.YOS_LISTS_REPLY=function(result){
 state.busy=false;
 if(result?.ok){
  if(result.action==='refresh'&&result.data){
   const data=result.data,loaded=data.loaded||{task:true,shopping:true};
   if(loaded.task)state.tasks=data.tasks;
   if(loaded.shopping)state.shopping=data.shopping;
   state.loaded=loaded;state.errors=data.errors||{};state.readAt=data.readAt;
  }
  else if(result.item&&result.kind){const key=result.kind==='task'?'tasks':'shopping';const idx=state[key].findIndex(x=>x.id===result.item.id);if(idx>=0)state[key][idx]=result.item;}
  notice(result.action==='refresh'&&Object.values(state.loaded||{}).some(v=>v===false)?
   '一部のNotion項目は未取得です。上部のエラーを確認してください。':'Notionを読み戻して更新を確認しました');
 }else notice('保存・更新は未確認：'+String(result?.error||'不明')+'。再操作前に更新してください');
 render();
};
render();
</script>
</body></html>`;
function htmlWithData(data){
 const safe=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return HTML.replace('__BOOT__',safe);
}
async function showError(error){
 const a=new Alert();a.title=APP+'｜未完了';a.message=tidy(error?.message||String(error),240);a.addAction('閉じる');await a.presentAlert();
}
async function main(){
 if(!token){await showError(Error('YOS Shoppingと同じKeychain接続が必要です。新しいトークンの入力はしません。'));return}
 const initial=await readAll();
 const w=new WebView();
 await w.loadHTML(htmlWithData(initial));
 let closed=false;
 const listen=()=>w.evaluateJavaScript('window.YOS_LISTS_WAIT(function(value){completion(JSON.stringify(value));})',true)
   .then(value=>({kind:'request',value}),err=>({kind:'error',err}));
 let pending=listen();
 const presented=w.present(false).then(()=>{closed=true;return {kind:'closed'}});
 while(!closed){
  const next=await Promise.race([pending,presented]);
  if(next.kind!=='request')break;
  let response;
  try{
   const request=JSON.parse(String(next.value));
   response={ok:true,...(await perform(request))};
  }catch(err){response={ok:false,error:tidy(err?.message||String(err),160)}}
  if(closed)break;
  try{await w.evaluateJavaScript('window.YOS_LISTS_REPLY('+JSON.stringify(response).replace(/</g,'\\u003c')+')',false)}
  catch{break}
  if(!closed)pending=listen();
 }
 await presented;
}
try{await main()}catch(e){await showError(e)}finally{Script.complete()}
