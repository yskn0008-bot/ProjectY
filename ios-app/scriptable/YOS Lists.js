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
 if(status<200||status>=300||!reply||typeof reply!=='object')
  throw Error('Notion HTTP '+(status||'不明')+'。保存先の権限・通信を確認してください');
 return reply;
}

async function readSource(kind){
 const result=[],seen=new Set(),source=SOURCES[kind];
 let cursor=null;
 for(let page=0;page<7;page++){
  const value=await notion('data_sources/'+source+'/query','POST',{page_size:100,...(cursor?{start_cursor:cursor}:{})});
  if(!Array.isArray(value.results)||typeof value.has_more!=='boolean')throw Error('Notion一覧の形式が不正です');
  for(const row of value.results){
   const id=id32(row?.id);
   if(!validId(id)||seen.has(id))throw Error('NotionのIDが不正・重複しています');
   seen.add(id);
   const item=itemFromRow(row,kind);
   if(item)result.push(item);
  }
  if(!value.has_more)return result;
  const next=tidy(value.next_cursor,200);
  if(!next||next===cursor)throw Error('Notionの続きが取得できません');
  cursor=next;
 }
 throw Error('Notion一覧が700件を超えました。一部のみの表示を中止します');
}
async function readAll(){
 const [tasks,shopping]=await Promise.all([readSource('task'),readSource('shopping')]);
 return {tasks,shopping,readAt:new Date().toISOString()};
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
 if(!Object.hasOwn(SOURCES,kind)||!validId(id)||!expected)throw Error('更新する項目の識別情報が不正です');
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
:root{color-scheme:light;--bg:#f7f9fc;--ink:#1a2638;--muted:#69798b;--blue:#4d87cc;--line:#e1e7ef;--panel:#fff;--red:#be5054}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:-apple-system-body;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN",sans-serif;font-size:14px;padding-bottom:96px}
button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}
header{background:linear-gradient(130deg,#fff,#e9f3ff);padding:max(22px,env(safe-area-inset-top)) 18px 15px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:3}
.top{display:flex;justify-content:space-between;gap:10px;align-items:center}.eyebrow{font-size:10px;letter-spacing:.18em;color:var(--blue);font-weight:750}h1{font-size:27px;margin:2px 0 0;font-weight:800;letter-spacing:-.045em}
.refresh{border:1px solid #b6cde4;background:white;color:#376f9e;padding:9px 12px;border-radius:13px;font-weight:700}
.sub{color:var(--muted);margin:8px 0 0;font-size:11px;line-height:1.5}
.tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:12px 12px 8px}
.tab{background:white;color:#5d7085;border:1px solid var(--line);border-radius:14px;padding:11px 2px;font-weight:650;font-size:12px}
.tab[aria-selected=true]{background:#e6f1ff;color:#215c9b;border-color:#8fbae7}
main{padding:0 13px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 14px}
.stat{background:white;border:1px solid var(--line);border-radius:15px;padding:11px 10px}.stat b{display:block;font-size:23px;font-variant-numeric:tabular-nums}.stat small{color:var(--muted);font-size:10px}
.tools{display:flex;align-items:center;gap:8px;margin:0 0 10px}.tools input{width:100%;min-width:0;background:#fff;border:1px solid var(--line);border-radius:12px;padding:11px;outline:none}
.tools input:focus{border-color:#86b4e8}.section{color:#526478;font-size:13px;font-weight:760;margin:18px 3px 10px}
.list{display:flex;flex-direction:column;gap:8px}.item{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;gap:10px;align-items:flex-start}
.item.done{background:#f5f7f9}.item-body{min-width:0;flex:1}.item h3{margin:0 0 6px;font-size:14px;line-height:1.45;word-break:break-word}.item.done h3{color:#87939f}
.meta{display:flex;flex-wrap:wrap;gap:5px}.tag{display:inline-block;background:#eff4f8;color:#637184;padding:3px 6px;border-radius:6px;font-size:10px}
.tag.urgent{background:#fff0ed;color:#b34539}.item p{font-size:11px;color:#748295;margin:7px 0 0;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.action{flex-shrink:0;min-width:62px;border:1px solid #b6cde6;border-radius:11px;padding:8px 7px;font-size:11px;font-weight:800;background:#e9f3fe;color:#2d6ba7}
.action.done{color:#65816e;background:#e9f4e9;border-color:#c5dacb}
.notice{border:1px solid #ecd5a4;color:#755c30;background:#fff9eb;border-radius:12px;padding:10px;font-size:11px;line-height:1.55;margin:8px 0 12px}
.empty{text-align:center;color:#7d8c9d;padding:35px 8px;line-height:1.5}
#message{position:fixed;bottom:max(14px,env(safe-area-inset-bottom));left:13px;right:13px;border-radius:13px;padding:12px 14px;background:#203a54;color:white;box-shadow:0 7px 30px #172d4650;font-size:12px;z-index:9;min-height:20px}
#message[hidden]{display:none}.footer{text-align:center;color:#8c99a5;font-size:10px;padding:22px 4px}
</style>
</head>
<body>
<header><div class="top"><div><div class="eyebrow">YOS · LIFE CONTROL</div><h1>Lists</h1></div><button class="refresh" id="refresh">↻ 更新</button></div>
<p class="sub" id="stamp">Notionから取得中…</p></header>
<nav class="tabs" id="tabs" aria-label="リスト"><button class="tab" data-tab="tasks">タスク</button><button class="tab" data-tab="shopping">買い物</button><button class="tab" data-tab="attention">要対応</button><button class="tab" data-tab="projects">案件</button></nav>
<main>
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
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\'':'&#39;'}[c]));
const day=x=>{if(!x)return'';try{return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric'}).format(new Date(x.length===10?x+'T00:00:00+09:00':x))}catch{return x.slice(0,10)}};
const isOpen=x=>x.state!=='完了'&&x.type==='Task';
const isShopping=x=>!x.purchased&&x.type==='欲しいもの';
const needsAttention=x=>x.type==='Task'&&(x.state==='本人操作'||x.state==='待ち');
const overdue=x=>x.due&&x.due.slice(0,10)<new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const labels=t=>[t.priority||'',t.state||'',t.due?'期限 '+day(t.due):''].filter(Boolean);
const order=(a,b)=>Number(overdue(b))-Number(overdue(a))||(['P0','P1','P2','P3'].indexOf(a.priority)<0?4:['P0','P1','P2','P3'].indexOf(a.priority))-(['P0','P1','P2','P3'].indexOf(b.priority)<0?4:['P0','P1','P2','P3'].indexOf(b.priority))||String(a.due||'9999').localeCompare(String(b.due||'9999'));
function notice(message,hide=false){const n=$('message');if(hide){n.hidden=true;return;}n.textContent=message;n.hidden=false;}
function render(){
 $('nTasks').textContent=state.tasks.filter(isOpen).length;
 $('nShopping').textContent=state.shopping.filter(isShopping).length;
 $('nAttention').textContent=state.tasks.filter(needsAttention).length;
 const readAt=state.readAt?new Date(state.readAt):null;
 $('stamp').textContent='Notion取得 '+(readAt?readAt.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未確認')+' · タップでNotionへ保存';
 document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));
 const term=state.query.trim().toLocaleLowerCase('ja-JP');
 let items=[],title='';
 if(state.tab==='tasks'){items=state.tasks.filter(isOpen);title='未完了タスク · '+items.length+'件';}
 if(state.tab==='shopping'){items=state.shopping.filter(x=>!x.purchased);title='未購入・日用品 · '+items.length+'件';}
 if(state.tab==='attention'){items=state.tasks.filter(needsAttention);title='本人操作・待ち · '+items.length+'件';}
 if(state.tab==='projects'){items=state.tasks.filter(x=>x.type==='Project'&&x.state!=='完了');title='進行中・保留の案件 · '+items.length+'件';}
 if(term)items=items.filter(x=>(x.name+' '+(x.next||'')+' '+x.priority+' '+x.category).toLocaleLowerCase('ja-JP').includes(term));
 items.sort((a,b)=>a.kind==='task'&&b.kind==='task'?order(a,b):String(b.updatedAt).localeCompare(String(a.updatedAt)));
 $('section').textContent=title+(term?' · 検索結果 '+items.length+'件':'');
 $('list').innerHTML=items.length?items.map(item=>{
  const task=item.kind==='task',done=task?item.state==='完了':item.purchased;
  const detail=task?item.next:(item.type==='日用品'?'日用品・在庫 '+(item.stock??'未登録'):'');
  const tags=task?labels(item):[item.category,item.type,item.priority].filter(Boolean);
  const action=task&&item.type==='Task'?'<button class="action" data-action="complete" data-kind="task" data-id="'+safe(item.id)+'" '+(state.busy?'disabled':'')+'>完了</button>':
    !task&&!done?'<button class="action" data-action="purchase" data-kind="shopping" data-id="'+safe(item.id)+'" '+(state.busy?'disabled':'')+'>購入済</button>':'';
  return '<article class="item'+(done?' done':'')+'"><div class="item-body"><h3>'+safe(item.name)+'</h3><div class="meta">'+tags.map(t=>'<span class="tag'+(t==='P0'?' urgent':'')+'">'+safe(t)+'</span>').join('')+'</div>'+
   (detail?'<p>'+safe(detail)+'</p>':'')+'</div>'+action+'</article>';
 }).join(''):'<div class="empty">表示する項目がありません。</div>';
}
$('tabs').addEventListener('click',e=>{const tab=e.target.closest('[data-tab]');if(!tab)return;state.tab=tab.dataset.tab;render()});
$('search').addEventListener('input',e=>{state.query=e.target.value;render()});
$('refresh').addEventListener('click',()=>{if(state.busy)return;state.busy=true;notice('Notionの最新情報を取得中…');render();emit({action:'refresh'})});
$('list').addEventListener('click',e=>{
 const b=e.target.closest('button[data-action]');if(!b||state.busy)return;
 const kind=b.dataset.kind,action=b.dataset.action;
 const item=(kind==='task'?state.tasks:state.shopping).find(x=>x.id===b.dataset.id);
 if(!item)return;
 if(kind==='shopping'&&!window.confirm('「'+item.name+'」を購入済みとして記録しますか？\\n購入・決済は行いません。'))return;
 state.busy=true;notice('Notionに保存して確認中…');render();
 emit({action,kind,id:item.id,expected:item.updatedAt});
});
window.YOS_LISTS_REPLY=function(result){
 state.busy=false;
 if(result?.ok){
  if(result.action==='refresh'&&result.data){state.tasks=result.data.tasks;state.shopping=result.data.shopping;state.readAt=result.data.readAt;}
  else if(result.item&&result.kind){const key=result.kind==='task'?'tasks':'shopping';const idx=state[key].findIndex(x=>x.id===result.item.id);if(idx>=0)state[key][idx]=result.item;}
  notice('Notionを読み戻して更新を確認しました');
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
