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
let lastUndo=null; // Only the most recent completion in this Scriptable session can be reversed.
// Existing YOS Tasks property 実行順: preserve legacy (<2m) values; new compact-list ranks occupy a separate range.
const MANUAL_BASE=2000000,MANUAL_LIMIT=4000000,MANUAL_GAP=1024;
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
  next:rich(p['次の一手'],'rich_text'),manualRank:Number.isFinite(p['実行順']?.number)?p['実行順'].number:null,
  updatedAt:tidy(row.last_edited_time,65)
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
 if(request.action==='reorder-task'){
  const id=id32(request.id),expected=tidy(request.expected,65);
  const oldRank=request.oldRank===null?null:Number(request.oldRank),newRank=Number(request.rank);
  if(!validId(id)||!expected||!Number.isFinite(newRank)||newRank<MANUAL_BASE||newRank>MANUAL_LIMIT||
     !(oldRank===null||Number.isFinite(oldRank)))throw Error('並び順の指定が不正です。書込を中止しました');
  const path='pages/'+id;
  const first=assertPage(await notion(path),'task',id);
  if(first.type!=='Task'||first.state==='完了'||first.updatedAt!==expected||first.manualRank!==oldRank)
   throw Error('タスクが他の場所で変更されたため、並び替えを中止しました。更新してください');
  const neighbors=[request.before,request.after].filter(Boolean);
  const idsSeen=new Set([id]);
  for(const nb of neighbors){
   const neighborId=id32(nb.id),edited=tidy(nb.updatedAt,65);
   if(!validId(neighborId)||!edited||idsSeen.has(neighborId))throw Error('並び替え先が不正です');
   idsSeen.add(neighborId);
   const page=assertPage(await notion('pages/'+neighborId),'task',neighborId);
   if(page.type!=='Task'||page.state==='完了'||page.updatedAt!==edited)
    throw Error('並び替え先が変更されました。更新してください');
  }
  const fresh=assertPage(await notion(path),'task',id);
  if(fresh.updatedAt!==expected||fresh.manualRank!==oldRank||fresh.state==='完了')
   throw Error('保存直前に変更を検知しました。並び替えを中止しました');
  await notion(path,'PATCH',{properties:{'実行順':{number:newRank}}});
  const verified=assertPage(await notion(path),'task',id);
  if(verified.manualRank!==newRank||verified.state==='完了')
   throw Error('並び順の保存確認に失敗しました。再送せず更新してください');
  return {action:'reorder-task',kind:'task',item:verified};
 }
 if(request.action==='undo-complete'){
  const id=id32(request.id),expected=tidy(request.expected,65),previous=lastUndo;
  if(!validId(id)||!previous||previous.id!==id||previous.updatedAt!==expected)
   throw Error('元に戻せる完了操作が見つかりません。Notionを確認してください');
  const path='pages/'+id;
  const before=assertPage(await notion(path),'task',id);
  if(before.type!=='Task'||before.state!=='完了'||before.updatedAt!==expected)
   throw Error('他の画面で変更されたため、元に戻せません。更新してください');
  const fresh=assertPage(await notion(path),'task',id);
  if(fresh.updatedAt!==expected||fresh.state!=='完了')
   throw Error('保存直前の変更を検知したため、元に戻す操作を中止しました');
  if(!['次にやる','実行中','待ち','本人操作','保留'].includes(previous.state))
   throw Error('元の状態を安全に復元できません');
  await notion(path,'PATCH',{properties:{'状態':{select:{name:previous.state}}}});
  const verified=assertPage(await notion(path),'task',id);
  if(verified.state!==previous.state)
   throw Error('復元結果が未確認です。再送せず、Notionを確認してください');
  lastUndo=null;
  return {action:'undo-complete',kind:'task',item:verified};
 }
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
 const previousState=kind==='task'?before.state:null;
 if(kind==='task')await notion(path,'PATCH',{properties:{'状態':{select:{name:'完了'}}}});
 else await notion(path,'PATCH',{properties:{
  '購入済':{checkbox:true},'買い物状態':{select:{name:'購入済'}},
  '購入日':{date:{start:dayInTokyo()}}
 }});
 const verified=assertPage(await notion(path),kind,id);
 if(kind==='task'&&verified.state!=='完了'||kind==='shopping'&&!verified.purchased)
  throw Error('Notion保存結果を読み戻せませんでした。再送せず、更新から確認してください');
 if(kind==='task'){
  lastUndo=['次にやる','実行中','待ち','本人操作','保留'].includes(previousState)?
   {id,updatedAt:verified.updatedAt,state:previousState}:null;
 }
 return {action:operation,kind,item:verified,canUndo:kind==='task'&&Boolean(lastUndo)};
}

const HTML=String.raw`<!doctype html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>YOS Lists</title>
<style>
:root{
 color-scheme:light;
 --bg:#F3F4F2;--ink:#294054;--muted:#526779;
 --accent:#526F89;--line:#91A3B1;--panel:#FFFFFF;--focus:#C77824;
 --tab-bg:#E9ECEE;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",sans-serif;font-size:15px;font-weight:550;-webkit-font-smoothing:antialiased;padding-bottom:calc(80px + env(safe-area-inset-bottom))}
button,input{font:inherit}
button{cursor:pointer;touch-action:manipulation}
button:disabled{opacity:.58;cursor:default}
button:focus-visible,input:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
header{background:#E8EDF0;color:var(--ink);padding:9px 14px 8px;border-bottom:1px solid #C6D0D7;position:sticky;top:0;z-index:3;box-shadow:0 2px 6px rgba(35,54,67,.06)}
.top{display:flex;justify-content:space-between;gap:8px;align-items:center}
h1{font-size:23px;margin:0;font-weight:820;letter-spacing:-.05em;line-height:1.1;color:#294054}
.refresh{border:1px solid #A9BBC9;background:#FFFFFF;color:#365B79;padding:7px;min-height:44px;min-width:44px;border-radius:12px;font-weight:800;font-size:21px;box-shadow:0 1px 2px rgba(30,50,70,.04)}
.refresh:active{background:#EDF3F7}
.sub{color:#53697D;margin:3px 0 0;font-size:10.5px;font-weight:650;line-height:1.2}
.sub.is-ready:before{content:"";display:inline-block;height:7px;width:7px;border-radius:50%;background:#6FC69F;margin-right:9px;vertical-align:middle}
.tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;background:var(--tab-bg);border-radius:13px;padding:3px;margin:10px 12px 10px}
.tab{background:transparent;color:#445C70;border:0;border-radius:10px;padding:8px 1px;min-height:44px;font-size:12px;font-weight:760;white-space:nowrap}
.tab[aria-selected=true]{background:var(--accent);color:#FFFFFF;box-shadow:0 2px 7px rgba(25,55,83,.13)}
main{padding:0 12px}
.tab-count{font-size:10px;font-weight:850;margin-left:2px;opacity:.86;font-variant-numeric:tabular-nums}
.tools{position:relative;display:flex;align-items:center;margin:0 0 8px}
.tools svg{position:absolute;left:15px;top:50%;transform:translateY(-50%);width:19px;height:19px;stroke:#8296A4;pointer-events:none}
.tools input{width:100%;min-width:0;background:#FFFFFF;color:var(--ink);border:1.5px solid #BCCAD3;border-radius:11px;padding:9px 13px 9px 43px;min-height:44px;font-size:13px;font-weight:550;outline:none}
.tools input::placeholder{color:#526779;font-weight:550}
.tools input:focus{border-color:#7899B2;outline:3px solid #CFDEE8;outline-offset:1px}
.section{color:#294054;font-size:14px;font-weight:800;margin:6px 2px 9px;letter-spacing:-.015em}
.list-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.drag-help{font-size:10px;font-weight:700;color:#667C90;white-space:nowrap}
.drag-help[hidden]{display:none}
.list{display:flex;flex-direction:column;gap:6px}
.item{background:var(--panel);border:1.5px solid var(--line);border-radius:10px;padding:7px 10px;display:flex;gap:9px;align-items:center;box-shadow:0 1px 2px rgba(30,56,76,.08)}
.item--task{display:block;position:relative}
.item--task.is-dragging{z-index:2;background:#E5EEF3;border-color:#526F89;box-shadow:0 8px 17px rgba(36,69,95,.22);opacity:.97}
.item--task.drag-disabled{opacity:.72}
.item--task.is-sorting{border-color:#6689A4;background:#EDF5FA}
@media(prefers-reduced-motion:no-preference){.item--task:not(.is-dragging){transition:transform .13s ease,box-shadow .13s ease}}

.item-complete{display:block;width:100%;min-height:44px;text-align:left;appearance:none;-webkit-appearance:none;color:inherit;border:0;background:transparent;border-radius:6px;padding:0 55px 0 0;cursor:pointer}
.item-complete:active{background:#E8F0F3}
.item-complete:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.item--task .item-details summary{position:absolute;top:6px;right:2px;width:50px;min-height:44px;padding:0;display:flex;align-items:center;justify-content:center;z-index:1;cursor:pointer;user-select:none;-webkit-user-select:none;gap:2px}
.item--task.is-sortable .item-details summary{cursor:grab;touch-action:none}
.item--task.is-sortable .item-details summary::before{content:"⠿";font-size:18px;font-weight:650;color:#56738C}
.item--task .item-details summary::after{position:static;font-size:16px}
.item--task .item-details summary:active{cursor:grabbing;background:#E4EDF4;border-radius:8px}
.item--task .item-details p{margin:8px 0 0}
.item.done{background:#F0F3F3;box-shadow:none}
.item-body{min-width:0;flex:1}
.item-details{min-width:0}
.item-details summary{position:relative;display:block;list-style:none;cursor:pointer;padding-right:12px}
.item-details summary::-webkit-details-marker{display:none}
.item-details summary::after{content:"⌄";position:absolute;right:0;top:0;color:#778A99;font-size:14px;font-weight:700}
.item-details[open] summary::after{transform:rotate(180deg)}
.item-details[open] .item-name{-webkit-line-clamp:unset;overflow:visible}
.item-details summary:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:3px}
.item-name{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:14px;font-weight:780;line-height:1.3;letter-spacing:-.015em;overflow-wrap:anywhere;color:#294054}
.item.done .item-name{color:#607183}
.meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.tag{display:inline-block;background:#EEF1F3;color:#506579;border:0;padding:2px 5px;border-radius:6px;font-size:10px;line-height:1.2;font-weight:750}
.tag.urgent{background:#FFE8E4;color:#A63C34}
.tag.high{background:#FFF0D8;color:#91601C}
.item p{font-size:12px;font-weight:550;color:#5E7183;margin:8px 0 1px;padding-top:7px;border-top:1px solid #E5E9EB;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.action{flex-shrink:0;min-width:62px;min-height:44px;border:1px solid #B6CCD9;border-radius:10px;padding:7px 8px;font-size:12px;font-weight:800;background:#E7F0F4;color:#526F89;box-shadow:none}
.action:active{background:#D6E6F0}
.action.done{color:#37664E;background:#DFEEE6;border-color:#A8CDB8;box-shadow:none}
.notice{border:1px solid #D2A451;color:#654417;background:#FFF3D8;border-radius:13px;padding:12px;font-size:12px;font-weight:650;line-height:1.65;margin:10px 0 14px;white-space:pre-wrap;overflow-wrap:anywhere}
.notice[hidden]{display:none}
.empty{text-align:center;color:#526779;padding:36px 12px;line-height:1.65;font-weight:600}
#message{position:fixed;bottom:max(14px,env(safe-area-inset-bottom));left:13px;right:13px;border-radius:14px;padding:13px 15px;background:#294054;color:#FFFFFF;box-shadow:0 7px 24px rgba(14,43,75,.2);font-size:12px;font-weight:700;line-height:1.45;z-index:9;min-height:20px}
#message[hidden]{display:none}
#message{display:flex;align-items:center;justify-content:space-between;gap:12px}
#messageText{flex:1;min-width:0}
#undo{flex-shrink:0;border:1px solid #D9E5EE;background:#EDF4FA;color:#244865;border-radius:9px;min-height:44px;padding:8px 10px;font-weight:800;font-size:12px}
#undo[hidden]{display:none}
.footer{text-align:center;color:#526779;font-size:10px;font-weight:550;line-height:1.5;padding:16px 4px}
@media(max-width:360px){.tab{font-size:11px}.tab-count{font-size:9px}.item{padding:6px 8px}.item-name{font-size:13px}.action{min-width:59px}.drag-help{font-size:9px}}
@media(prefers-reduced-motion:no-preference){.tab,.refresh,.action{transition:background-color .15s,border-color .15s}}
</style>
</head>
<body>
<header><div class="top"><div><h1>Lists</h1><p class="sub" id="stamp">Notionを確認中…</p></div><button class="refresh" id="refresh" aria-label="Notionの最新情報を取得">↻</button></div></header>
<nav class="tabs" id="tabs" aria-label="リスト"><button class="tab" data-tab="tasks">タスク<span class="tab-count" id="nTasks">—</span></button><button class="tab" data-tab="shopping">買い物<span class="tab-count" id="nShopping">—</span></button><button class="tab" data-tab="attention">要対応<span class="tab-count" id="nAttention">—</span></button><button class="tab" data-tab="projects">案件<span class="tab-count" id="nProjects">—</span></button></nav>
<main>
<div class="notice" id="readErrors" role="alert" hidden></div>
<div class="tools"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><input id="search" type="search" aria-label="リスト内検索" placeholder="タスクを検索"></div>
<div class="list-heading"><div class="section" id="section"></div><div class="drag-help" id="dragHelp">⠿ 右端で移動</div></div><div class="list" id="list"></div>
<div class="footer">Notion保存は読戻し後に確定表示。Appleリマインダーとは別管理です。</div>
</main>
<div id="message" role="status" aria-live="polite" hidden><span id="messageText"></span><button id="undo" type="button" hidden>元に戻す</button></div>
<script>
'use strict';
const boot=__BOOT__;
const state={...boot,tab:'tasks',query:'',busy:false};
let lastCompletion=null;
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
// Manual ordering is stored in the existing YOS Tasks 実行順 number property.
// Legacy numbers below 2,000,000 remain untouched. Unranked tasks retain the previous
// overdue/priority/date sequence; moving one task only writes that task's property.
const RANK_BASE=2000000,RANK_LIMIT=4000000,RANK_GAP=1024;
function defaultRanks(){
 const rows=state.tasks.filter(isOpen).slice().sort((a,b)=>order(a,b)||a.id.localeCompare(b.id));
 return new Map(rows.map((t,i)=>[t.id,RANK_BASE+i*RANK_GAP]));
}
function effectiveRank(t,defaults){
 const n=t.manualRank;
 return Number.isFinite(n)&&n>=RANK_BASE&&n<=RANK_LIMIT?n:defaults.get(t.id);
}
function calcReorderRank(before,after,defaults){
 const a=before?effectiveRank(before,defaults):null;
 const b=after?effectiveRank(after,defaults):null;
 let value;
 if(a!==null&&b!==null){if(!(b-a>0.00001))throw Error('順番の数値に空きがありません。再配置を中止しました');value=(a+b)/2;}
 else if(a!==null)value=a+RANK_GAP/2;
 else if(b!==null)value=b-RANK_GAP/2;
 else throw Error('並び替え先が見つかりません');
 if(!Number.isFinite(value)||value<RANK_BASE||value>RANK_LIMIT)throw Error('並び順の範囲外です。元の位置を保持しました');
 return value;
}
function notice(message,hide=false,undo=false){
 const n=$('message');if(hide){n.hidden=true;return;}
 $('messageText').textContent=message;
 $('undo').hidden=!undo;
 $('undo').disabled=state.busy;
 n.hidden=false;
}
function render(){
 const ready=state.loaded||{task:true,shopping:true};
 const issues=['task','shopping'].filter(kind=>ready[kind]===false)
  .map(kind=>(kind==='task'?'タスク':'買い物')+'：'+String(state.errors?.[kind]||'取得に失敗しました'));
 const errorNode=$('readErrors');errorNode.hidden=issues.length===0;
 errorNode.textContent=issues.length?'Notionの取得に失敗しました。未取得の項目は更新できません。\n'+issues.join('\n')+'\n右上の「更新」で再試行できます。':'';
 $('nTasks').textContent=ready.task?state.tasks.filter(isOpen).length:'—';
 $('nShopping').textContent=ready.shopping?state.shopping.filter(isShopping).length:'—';
 $('nAttention').textContent=ready.task?state.tasks.filter(needsAttention).length:'—';
 $('nProjects').textContent=ready.task?state.tasks.filter(x=>x.type==='Project'&&x.state!=='完了').length:'—';
 const readAt=state.readAt?new Date(state.readAt):null;
 const stamp=readAt?readAt.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未確認';
 $('stamp').textContent=(issues.length?'Notion取得エラー · ':'同期 ')+stamp;
 $('stamp').classList.toggle('is-ready',issues.length===0&&Boolean(state.readAt));
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));
 $('search').placeholder=state.tab==='tasks'?'タスクを検索':state.tab==='shopping'?'買い物を検索':state.tab==='attention'?'要対応を検索':'案件を検索';
 const term=state.query.trim().toLocaleLowerCase('ja-JP');
 let items=[],title='';
 if(state.tab==='tasks'){items=state.tasks.filter(isOpen);title='未完了タスク · '+items.length+'件';}
 if(state.tab==='shopping'){items=state.shopping.filter(x=>!x.purchased);title='未購入・日用品 · '+items.length+'件';}
 if(state.tab==='attention'){items=state.tasks.filter(needsAttention);title='本人操作・待ち · '+items.length+'件';}
 if(state.tab==='projects'){items=state.tasks.filter(x=>x.type==='Project'&&x.state!=='完了');title='進行中・保留の案件 · '+items.length+'件';}
 const activeKind=state.tab==='shopping'?'shopping':'task';
 const failed=ready[activeKind]===false;
 if(term)items=items.filter(x=>(x.name+' '+(x.next||'')+' '+x.priority+' '+x.category).toLocaleLowerCase('ja-JP').includes(term));
 const defaults=defaultRanks();
 items.sort((a,b)=>a.kind==='task'&&b.kind==='task'&&a.type==='Task'&&b.type==='Task'?
  effectiveRank(a,defaults)-effectiveRank(b,defaults)||a.id.localeCompare(b.id):
  a.kind==='task'&&b.kind==='task'?order(a,b):String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const sortable=state.tab==='tasks'&&!term&&ready.task!==false&&!state.busy&&items.length>1;
 $('dragHelp').hidden=!sortable;
 $('section').textContent=(failed?'未取得 · ':'')+title+(term?' · 検索結果 '+items.length+'件':'');
 $('list').innerHTML=items.length?items.map(item=>{
  const task=item.kind==='task',done=task?item.state==='完了':item.purchased;
  const detail=task?item.next:(item.type==='日用品'?'日用品・在庫 '+(item.stock??'未登録'):'');
  const tags=task?labels(item):[item.category,item.type,item.priority].filter(Boolean);
  const meta='<span class="meta">'+tags.map(t=>'<span class="tag'+(t==='P0'?' urgent':t==='P1'?' high':'')+'">'+safe(t)+'</span>').join('')+'</span>';
  if(task&&item.type==='Task'){
   const disabled=state.busy||ready.task===false?'disabled':'';
   return '<article class="item item--task'+(done?' done':'')+(sortable?' is-sortable':'')+'" data-id="'+safe(item.id)+'"><div class="item-body">'+
    '<button type="button" class="item-complete" data-action="complete" data-kind="task" data-id="'+safe(item.id)+'" aria-label="「'+safe(item.name)+'」を完了にする" '+disabled+'>'+
    '<span class="item-name">'+safe(item.name)+'</span>'+meta+'</button></div>'+
    '<details class="item-details"><summary aria-label="'+(sortable?'タップで詳細、押さえて並び替え：':'詳細を表示：')+safe(item.name)+'"></summary>'+
    '<p><b>'+safe(item.name)+'</b>'+(detail?'\n'+safe(detail):'')+'</p></details></article>';
  }
  const action=!task&&!done?'<button class="action" data-action="purchase" data-kind="shopping" data-id="'+safe(item.id)+'" '+(state.busy?'disabled':'')+'>購入済</button>':'';
  return '<article class="item'+(done?' done':'')+'"><div class="item-body"><details class="item-details"><summary aria-label="詳細を開く・閉じる：'+safe(item.name)+'"><span class="item-name">'+safe(item.name)+'</span>'+meta+'</summary>'+
   (detail?'<p>'+safe(detail)+'</p>':'')+'</details></div>'+action+'</article>';
 }).join(''):'<div class="empty">'+(failed?'この項目はNotionから取得できませんでした。右上の更新で再試行してください。':'表示する項目がありません。')+'</div>';
}
// The right-side 50px summary is intentionally dual-purpose:
// tap opens details; drag on it reorders. The body still completes tasks on tap.
// Do not save a temporary DOM preview until Notion has verified the PATCH.
let activeDrag=null,suppressDetailClick=false;
document.addEventListener('click',e=>{
 if(!suppressDetailClick||!e.target.closest('.item--task .item-details summary'))return;
 e.preventDefault();e.stopImmediatePropagation();suppressDetailClick=false;
},true);
$('list').addEventListener('pointerdown',e=>{
 const handle=e.target.closest('.item--task.is-sortable .item-details summary');
 if(!handle||state.busy||(e.pointerType==='mouse'&&e.button!==0)||activeDrag)return;
 const row=handle.closest('.item--task');
 const ordered=Array.from($('list').querySelectorAll('.item--task.is-sortable'));
 activeDrag={id:e.pointerId,row,handle,startY:e.clientY,index:ordered.indexOf(row),moved:false};
 try{handle.setPointerCapture(e.pointerId)}catch{}
});
$('list').addEventListener('pointermove',e=>{
 const d=activeDrag;
 if(!d||d.id!==e.pointerId)return;
 if(!d.moved&&Math.abs(e.clientY-d.startY)<9)return;
 d.moved=true;e.preventDefault();
 d.row.classList.add('is-dragging');
 const hit=document.elementFromPoint(e.clientX,e.clientY);
 const other=hit?.closest('.item--task.is-sortable');
 if(other&&other!==d.row){
  const center=other.getBoundingClientRect().top+other.getBoundingClientRect().height/2;
  const el=e.clientY<center?other:other.nextElementSibling;
  const visible=Array.from($('list').querySelectorAll('.item--task.is-sortable')).filter(x=>{
   const r=x.getBoundingClientRect();return r.bottom>0&&r.top<window.innerHeight;
  });
  const before=new Map(visible.map(x=>[x,x.getBoundingClientRect().top]));
  $('list').insertBefore(d.row,el||null);
  if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   for(const node of visible){
    if(node===d.row)continue;
    const dy=(before.get(node)??0)-node.getBoundingClientRect().top;
    if(Math.abs(dy)>1&&typeof node.animate==='function'){
     node.getAnimations?.().forEach(a=>a.cancel());
     node.animate([{transform:'translateY('+dy+'px)'},{transform:'translateY(0)'}],
      {duration:145,easing:'ease-out'});
    }
   }
  }
 }
 // Edge scrolling permits moving an item through a longer list.
 const limit=window.innerHeight;
 if(e.clientY>limit-85)window.scrollBy(0,18);
 else if(e.clientY<95)window.scrollBy(0,-18);
},{passive:false});
function stopReorder(e,cancelled=false){
 const d=activeDrag;if(!d||d.id!==e.pointerId)return;
 activeDrag=null;
 try{d.handle.releasePointerCapture(e.pointerId)}catch{}
 d.row.classList.remove('is-dragging');
 if(!d.moved)return; // normal tap: native <details> remains functional
 suppressDetailClick=true;
 setTimeout(()=>{suppressDetailClick=false},350);
 if(cancelled){render();return;}
 const nodes=Array.from($('list').querySelectorAll('.item--task.is-sortable'));
 const dest=nodes.indexOf(d.row);
 if(dest===-1||dest===d.index){render();return;}
 const item=state.tasks.find(x=>x.id===d.row.dataset.id);
 const before=dest>0?state.tasks.find(x=>x.id===nodes[dest-1].dataset.id):null;
 const after=dest<nodes.length-1?state.tasks.find(x=>x.id===nodes[dest+1].dataset.id):null;
 if(!item||state.busy||state.loaded?.task===false){render();return;}
 let rank;
 try{rank=Number(calcReorderRank(before,after,defaultRanks()).toFixed(6))}
 catch(err){notice(String(err?.message||err));render();return;}
 if(item.manualRank===rank){render();return;}
 state.busy=true;lastCompletion=null;
 notice('Notionへ並び順を保存・確認中…');
 emit({action:'reorder-task',kind:'task',id:item.id,expected:item.updatedAt,
  oldRank:item.manualRank??null,rank,
  before:before?{id:before.id,updatedAt:before.updatedAt}:null,
  after:after?{id:after.id,updatedAt:after.updatedAt}:null});
}
window.addEventListener('pointerup',e=>stopReorder(e));
window.addEventListener('pointercancel',e=>stopReorder(e,true));
$('tabs').addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(!tab)return;state.tab=tab.dataset.tab;render()});
$('search').addEventListener('input',e=>{state.query=e.target.value;render()});
$('refresh').addEventListener('click',()=>{if(state.busy)return;state.busy=true;notice('Notionの最新情報を取得中…');render();emit({action:'refresh'})});
$('list').addEventListener('click',e=>{
 const card=e.target.closest('.item--task');
 const direct=e.target.closest('button[data-action]');
 // Include the card's padding in the completion tap target, but never the details chevron.
 const b=direct||(card&&!e.target.closest('.item-details')?card.querySelector('.item-complete'):null);
 if(!b||state.busy)return;
 const kind=b.dataset.kind,action=b.dataset.action;
 const item=(kind==='task'?state.tasks:state.shopping).find(x=>x.id===b.dataset.id);
 if(!item||state.loaded?.[kind]===false)return;
 if(kind==='shopping'&&!window.confirm('「'+item.name+'」を購入済みとして記録しますか？\\n購入・決済は行いません。'))return;
 state.busy=true;lastCompletion=null;notice('Notionに保存して確認中…');render();
 emit({action,kind,id:item.id,expected:item.updatedAt});
});
$('undo').addEventListener('click',()=>{
 if(state.busy||!lastCompletion)return;
 state.busy=true;
 $('undo').disabled=true;
 notice('Notionで完了を元に戻して確認中…');
 emit({action:'undo-complete',kind:'task',id:lastCompletion.id,expected:lastCompletion.expected});
});
window.YOS_LISTS_REPLY=function(result){
 state.busy=false;
 if(result?.ok){
  if(result.action==='refresh'&&result.data){
   const data=result.data,loaded=data.loaded||{task:true,shopping:true};
   if(loaded.task)state.tasks=data.tasks;
   if(loaded.shopping)state.shopping=data.shopping;
   state.loaded=loaded;state.errors=data.errors||{};state.readAt=data.readAt;
   lastCompletion=null;
  }
  else if(result.item&&result.kind){
   const key=result.kind==='task'?'tasks':'shopping';
   const idx=state[key].findIndex(x=>x.id===result.item.id);
   if(idx>=0)state[key][idx]=result.item;
   if(result.action==='complete'&&result.canUndo)
    lastCompletion={id:result.item.id,expected:result.item.updatedAt};
   else lastCompletion=null;
  }
  if(result.action==='reorder-task')
   notice('並び順をNotionに保存しました。');
  else if(result.action==='complete')
   notice('Notionに完了を保存しました。',false,Boolean(lastCompletion));
  else if(result.action==='undo-complete')
   notice('Notionで完了を元に戻しました。');
  else notice(result.action==='refresh'&&Object.values(state.loaded||{}).some(v=>v===false)?
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
