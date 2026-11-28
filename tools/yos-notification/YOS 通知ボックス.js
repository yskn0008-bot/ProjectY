// YOS 通知ボックス v0.1 | manual, READ-ONLY Scriptable view.
// Reads the existing YOS Inbox Notion page. No new DB, no writes, no notifications.
// Running this manually does NOT rely on locked-screen Scriptable background execution.
const PAGE='3d35ca88289581ef9dc8d5f11ff8e213', TOKEN='YOS_NOTION_INTEGRATION_TOKEN';
const MAX_PAGES=25,MAX_ITEMS=140;
const clean=x=>String(x??'');
function escapeHTML(s){return clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function plain(block){
  const rich=block?.paragraph?.rich_text;
  return Array.isArray(rich)?rich.map(x=>x.plain_text??x.text?.content??'').join(''):'';
}
function parse(text){
  const s=clean(text).trim();
  const m=s.match(/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s*·\s*Clarity Notification\s*·\s*notification:([0-9a-f]{8})\s*·\s*([a-z-]+)/);
  if(!m)return null;
  const after=s.slice(m[0].length).replace(/^\s+/,'').replace(/\s*---\s*$/,'').trim();
  if(!after)return null;
  return {time:m[1],id:m[2],category:m[3],body:after.slice(0,2000)};
}
async function getPage(cursor){
  const url='https://api.notion.com/v1/blocks/'+PAGE+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):'');
  const r=new Request(url);
  r.method='GET';r.timeoutInterval=12;
  r.headers={'Authorization':'Bearer '+Keychain.get(TOKEN),'Notion-Version':'2022-06-28'};
  const json=await r.loadJSON();
  if(r.response?.statusCode!==200||!Array.isArray(json.results))throw Error('Inbox読取失敗：Notion HTTP '+String(r.response?.statusCode));
  return json;
}
async function load(){
  if(!Keychain.contains(TOKEN)||!Keychain.get(TOKEN))throw Error('Notion連携情報がありません。既存のYOS認証設定を確認してください');
  const items=[];let cursor=null,complete=false;
  for(let i=0;i<MAX_PAGES;i++){
    const res=await getPage(cursor);
    for(const block of res.results){const event=parse(plain(block));if(event)items.push(event)}
    if(!res.has_more){complete=true;break}
    if(!res.next_cursor)throw Error('Notionページ送り情報が取得できません');
    cursor=res.next_cursor;
  }
  if(!complete)throw Error('Inbox件数が表示上限を超えました。未取得分があるため表示を中断しました');
  const unique=new Map();
  for(const e of items)unique.set(e.time+'#'+e.id,e);
  return [...unique.values()].sort((a,b)=>b.time.localeCompare(a.time)).slice(0,MAX_ITEMS);
}
function dateLabel(t){const d=new Date(t);if(!Number.isFinite(d.getTime()))return t;return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
function label(cat){return({'missed-call':'不在着信','money-review':'お金','legal':'法律・督促',security:'セキュリティ',information:'その他'})[cat]??'通知'}
function render(items){
 const cards=items.map((e,i)=>'<article class="item" data-cat="'+escapeHTML(e.category)+'" data-text="'+escapeHTML((e.body+' '+label(e.category)).toLowerCase())+'"><div class="top"><span class="cat">'+escapeHTML(label(e.category))+'</span><span class="when">'+escapeHTML(dateLabel(e.time))+'</span></div><div class="body">'+escapeHTML(e.body)+'</div>'+(e.category==='missed-call'?'<div class="hint">折り返し状況は未確認。必要なら電話アプリで確認してください。</div>':'')+'</article>').join('');
 return '<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><style>'+
 ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0d1420;color:#f8fafc;font:16px -apple-system,system-ui,sans-serif}header{position:sticky;top:0;background:#0d1420f2;padding:16px 16px 10px;z-index:1;border-bottom:1px solid #35455b}h1{font-size:22px;margin:0 0 5px}.sub{color:#bcc8d5;font-size:12px;line-height:1.4;margin-bottom:12px}input{width:100%;padding:13px;border:1px solid #35455b;border-radius:12px;background:#182638;color:#fff;font-size:16px}.tabs{display:flex;gap:7px;overflow-x:auto;padding-top:10px}.tab{border:1px solid #35455b;border-radius:20px;padding:8px 12px;color:#dbe4ed;background:#182638;white-space:nowrap;font-size:13px}.tab.active{color:#0d1420;background:#25b8a0;border-color:#25b8a0}main{padding:12px 16px 28px}.item{margin:0 0 10px;border:1px solid #35455b;border-radius:15px;background:#182638;padding:14px}.top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.cat{color:#a8ddce;font-size:13px;font-weight:600}.when{color:#bcc8d5;font-size:12px;white-space:nowrap}.body{line-height:1.45;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}.hint{color:#bcc8d5;font-size:12px;margin-top:9px}.empty{color:#bcc8d5;text-align:center;padding:28px;font-size:14px}.footer{color:#bcc8d5;font-size:12px;padding:12px 4px;line-height:1.5}</style></head><body>'+
 '<header><h1>通知ボックス</h1><div class="sub">YOS Inboxの保存履歴 · 最大'+MAX_ITEMS+'件 · 読取専用<br>通知の未読・解決状態はまだ連携されていません。</div>'+
 '<input id="q" type="search" placeholder="通知を検索（内容・送信元）"><div class="tabs"><button class="tab active" data-filter="all">すべて</button><button class="tab" data-filter="missed-call">不在着信</button><button class="tab" data-filter="money-review">お金</button><button class="tab" data-filter="legal">法律</button><button class="tab" data-filter="security">安全</button></div></header><main><div id="items">'+cards+'</div><div id="empty" class="empty" hidden>該当する通知はありません</div><div class="footer">元の通知・Notion原文を削除しません。通知取得に失敗したイベントや古い履歴が全て表示される保証はありません。</div></main>'+
 '<script>let active="all";const q=document.querySelector("#q"),cards=[...document.querySelectorAll(".item")],empty=document.querySelector("#empty");function update(){let count=0;const text=q.value.trim().toLowerCase();for(const card of cards){const show=(active==="all"||card.dataset.cat===active)&&card.dataset.text.includes(text);card.hidden=!show;if(show)count++}empty.hidden=count!==0}q.addEventListener("input",update);document.querySelectorAll(".tab").forEach(button=>button.addEventListener("click",()=>{active=button.dataset.filter;document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t===button));update()}));update();</script></body></html>';
}
if(typeof Script!=='undefined'){
  try{const rows=await load(),w=new WebView();await w.loadHTML(render(rows));await w.present()}
  catch(e){const a=new Alert();a.title='YOS 通知ボックス';a.message=String(e.message??e);a.addAction('閉じる');await a.present()}
  Script.complete();
}
if(typeof module!=='undefined'&&module.exports)module.exports={escapeHTML,plain,parse,render,label};
