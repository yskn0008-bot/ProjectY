// YOS Notification Bridge v0.3 | Scriptable | uses existing Notion Inbox only
// This code NEVER sends a second notification. Retain original app notifications.
const PAGE='3d35ca88289581ef9dc8d5f11ff8e213';
const TK='YOS_NOTION_INTEGRATION_TOKEN', RK='YOS_NOTIFICATION_RECEIPTS_V1';
const fm=FileManager.local(), pending=fm.joinPath(fm.documentsDirectory(),'YOS_Notification_Pending.json');
function done(s){Script.setShortcutOutput(s);Script.complete()}
function asText(x){if(typeof x==='string')return x.trim();if(Array.isArray(x))return x.map(asText).filter(Boolean).join('\n');if(x&&typeof x==='object')return ['app','title','subtitle','message','body','text'].map(k=>x[k]?k+': '+x[k]:'').filter(Boolean).join('\n');return String(x??'').trim()}
function scrub(raw){
  if(/認証コード|確認コード|ワンタイム|二段階認証|ログインコード|パスワードリセット|verification\s*code|one.?time|\bOTP\b|\b2FA\b|security\s*code|reset\s*password/i.test(raw))return {category:'security',body:'認証・ログイン関連の通知を受信。秘密の本文は保存せず、元アプリで確認してください。'};
  const v=raw
    .replace(/(^|[^\d])((?:\d[\s-]?){12,27}\d)(?=[^\d]|$)/g,'$1[長い番号非表示]')
    .replace(/((?:口座番号|カード番号|取引番号|注文番号|customer\s*id|reference\s*id)\s*[:：=#]?\s*)[\w*\-]{4,}/gi,'$1[番号非表示]')
    .replace(/\b0\d{9,10}\b/g,'[電話番号非表示]')
    .replace(/((?:password|パスワード|secret|token|APIキー)\s*[:：=]\s*)\S+/gi,'$1[秘密非表示]')
    .replace(/https?:\/\/\S+/gi,'[リンク非表示]');
  const cat=/差押|差し押さえ|督促|裁判所|訴訟/.test(v)?'legal':/支払|決済|請求|返済|振込|入金|出金|残高|引落|PayPay/.test(v)?'money-review':/不正アクセス|ログイン/.test(v)?'security':'information';
  return {category:cat,body:v.slice(0,850)};
}
function idOf(v){let h=2166136261;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
function json(s,f){try{return JSON.parse(s)}catch(_){return f}}
function getQueue(){if(!fm.fileExists(pending))return [];const q=json(fm.readString(pending),null);if(!Array.isArray(q))throw Error('一時ファイル破損。変更せず中断');return q}
function save(q){fm.writeString(pending,JSON.stringify(q))}
function getReceipts(){return Keychain.contains(RK)?json(Keychain.get(RK),{}):{}}
async function send(rows){const r=new Request('https://api.notion.com/v1/blocks/'+PAGE+'/children');r.method='PATCH';r.timeoutInterval=15;r.headers={'Authorization':'Bearer '+Keychain.get(TK),'Notion-Version':'2022-06-28','Content-Type':'application/json'};r.body=JSON.stringify({children:rows.map(x=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:x.date+' · Clarity Notification · notification:'+x.id+' · '+x.category+'\n'+x.body+'\n---'}}]}}))});const v=await r.loadJSON();if(r.response?.statusCode!==200||v.results?.length!==rows.length)throw Error('Notion未確認')}
try{
  const raw=asText(args.shortcutParameter);if(!raw||/^(1|true|\[object Object\]|ショートカットの入力)$/i.test(raw)){done('YOS: 入力なし');}
  else{
    const safe=scrub(raw),k=idOf(raw),now=Date.now(),seen=getReceipts();let q=getQueue();
    if(!q.some(x=>x.id===k)&&!(seen[k]&&now-seen[k]<60000))q.push({id:k,date:new Date(now).toISOString(),category:safe.category,body:safe.body});
    save(q);
    if(q.length>100)done('YOS: 未送信100件超（原文は保全）');
    else if(!Keychain.contains(TK))done('YOS: Notion認証なし（一時保管）');
    else{
      let error='';while(q.length){const batch=q.slice(0,10);try{await send(batch);for(const x of batch)seen[x.id]=Date.now();Keychain.set(RK,JSON.stringify(Object.fromEntries(Object.entries(seen).slice(-150))));q=q.slice(batch.length);save(q)}catch(e){error=String(e);break}}
      done(error?'YOS: Notion未確認（再送待ち）':'YOS: Notion保存確認');
    }
  }
}catch(e){done('YOS: 保存前エラー（'+String(e.message??e).slice(0,60)+'）')}
