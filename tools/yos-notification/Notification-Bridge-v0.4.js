// YOS Notification Bridge v0.4 | Scriptable | DRAFT, not automatically installed.
// Same existing Notion Inbox and local pending queue as v0.3.
// If a PATCH result is ambiguous, reconcile against stored notification IDs before any retry.
// Never creates a notification, Notion database, server, or shortcut.
const PAGE='3d35ca88289581ef9dc8d5f11ff8e213';
const TK='YOS_NOTION_INTEGRATION_TOKEN',RK='YOS_NOTIFICATION_RECEIPTS_V1';
const fm=FileManager.local(),pending=fm.joinPath(fm.documentsDirectory(),'YOS_Notification_Pending.json');
const MAX_QUEUE=100, BATCH_SIZE=5, MAX_SCAN_PAGES=25;
function done(v){Script.setShortcutOutput(v);Script.complete()}
function asText(x){
  if(typeof x==='string')return x.trim();
  if(Array.isArray(x))return x.map(asText).filter(Boolean).join('\n');
  if(x&&typeof x==='object')return ['app','title','subtitle','message','body','text'].map(k=>typeof x[k]==='string'&&x[k].trim()?k+': '+x[k].trim():'').filter(Boolean).join('\n');
  return '';
}
function scrub(raw){
  if(/認証コード|確認コード|ワンタイム|二段階認証|ログインコード|パスワードリセット|verification\s*code|one.?time|\bOTP\b|\b2FA\b|security\s*code|reset\s*password/i.test(raw))return {category:'security',body:'認証・ログイン関連の通知を受信。秘密の本文は保存せず、元アプリで確認してください。'};
  const v=raw.replace(/(^|[^\d])((?:\d[\s-]?){12,27}\d)(?=[^\d]|$)/g,'$1[長い番号非表示]')
    .replace(/((?:口座番号|カード番号|取引番号|注文番号|customer\s*id|reference\s*id)\s*[:：=#]?\s*)[\w*\-]{4,}/gi,'$1[番号非表示]')
    .replace(/\b0\d{9,10}\b/g,'[電話番号非表示]')
    .replace(/((?:password|パスワード|secret|token|APIキー)\s*[:：=]\s*)\S+/gi,'$1[秘密非表示]')
    .replace(/https?:\/\/\S+/gi,'[リンク非表示]');
  const category=/不在着信|応答なしの着信|missed[ -]?call/i.test(v)?'missed-call':/差押|差し押さえ|督促|裁判所|訴訟/.test(v)?'legal':/支払|決済|請求|返済|振込|入金|出金|残高|引落|PayPay/.test(v)?'money-review':/不正アクセス|ログイン/.test(v)?'security':'information';
  return {category,body:v.slice(0,850)};
}
function idOf(v){let h=2166136261;for(let i=0;i<v.length;i++){h^=v.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
function parse(s){try{return JSON.parse(s)}catch(_){return null}}
function queueRead(){
  if(!fm.fileExists(pending))return [];
  const data=parse(fm.readString(pending));
  if(!Array.isArray(data)||!data.every(x=>x&&/^[0-9a-f]{8}$/.test(x.id)&&typeof x.body==='string'&&typeof x.date==='string'&&typeof x.category==='string'))throw Error('保留キューが不正。変更せず停止');
  return data.map(x=>({...x,possiblySent:x.possiblySent!==false})); // v0.3 queue may already have reached Notion
}
function queueWrite(q){fm.writeString(pending,JSON.stringify(q))}
function receiptsRead(){const value=Keychain.contains(RK)?parse(Keychain.get(RK)):null;return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function receiptsWrite(value){Keychain.set(RK,JSON.stringify(Object.fromEntries(Object.entries(value).slice(-150))))}
function token(){return Keychain.contains(TK)?Keychain.get(TK):''}
async function request(method,path,body){
  const req=new Request('https://api.notion.com/v1/'+path);
  req.method=method;req.timeoutInterval=12;
  req.headers={'Authorization':'Bearer '+token(),'Notion-Version':'2022-06-28','Content-Type':'application/json'};
  if(body)req.body=JSON.stringify(body);
  const data=await req.loadJSON();
  if(req.response?.statusCode!==200)throw Error('Notion HTTP '+String(req.response?.statusCode));
  return data;
}
function entryText(x){return x.date+' · Clarity Notification · notification:'+x.id+' · '+x.category+'\n'+x.body+'\n---'}
async function remoteIDs(){
  const ids=new Set();let cursor=null;
  for(let page=0;page<MAX_SCAN_PAGES;page++){
    const url='blocks/'+PAGE+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):'');
    const result=await request('GET',url);
    if(!Array.isArray(result.results))throw Error('Notion照合形式不正');
    for(const block of result.results){
      const texts=block.paragraph?.rich_text??[];
      const joined=Array.isArray(texts)?texts.map(x=>x.plain_text??x.text?.content??'').join(''):'';
      const match=joined.match(/(?:^|\s)notification:([0-9a-f]{8})(?=\s|$)/);
      if(match)ids.add(match[1]);
    }
    if(!result.has_more)return ids;
    if(!result.next_cursor)throw Error('Notion照合カーソルなし');
    cursor=result.next_cursor;
  }
  throw Error('Notion照合が上限を超えた。重複防止のため再送しない');
}
async function append(batch){
  const rows=batch.map(x=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:entryText(x)}}]}}));
  const result=await request('PATCH','blocks/'+PAGE+'/children',{children:rows});
  if(!Array.isArray(result.results)||result.results.length!==batch.length)throw Error('Notion保存結果未確認');
}
try{
  const input=asText(args.shortcutParameter),now=Date.now(),receipts=receiptsRead();
  let q=queueRead();
  if(input&&!/^(1|true|\[object Object\]|ショートカットの入力)$/i.test(input)){
    const id=idOf(input);
    if(!q.some(x=>x.id===id)&&!(receipts[id]&&now-receipts[id]>=0&&now-receipts[id]<60000)){
      if(q.length>=MAX_QUEUE)throw Error('保留100件。追加の保存ができないため本人確認が必要');
      else{const safe=scrub(input);q.push({id,date:new Date(now).toISOString(),category:safe.category,body:safe.body,possiblySent:false});queueWrite(q)}
    }
  }
  if(!q.length){done(input?'YOS: 既存通知・保存済み':'YOS: 入力なし・保留なし')}
  else if(!token())done('YOS: Notion認証なし（保留中）');
  else{
    let error='';
    try{
      if(q.some(x=>x.possiblySent)){
        const existing=await remoteIDs();
        for(const x of q)if(existing.has(x.id))receipts[x.id]=now;
        receiptsWrite(receipts);
        q=q.filter(x=>!existing.has(x.id)).map(x=>({...x,possiblySent:false}));
        queueWrite(q);
      }
      while(q.length){
        const batch=q.slice(0,BATCH_SIZE);
        // Persist uncertain state BEFORE the network request. A crash cannot cause blind replay.
        q=q.map(x=>batch.includes(x)?{...x,possiblySent:true}:x);
        queueWrite(q);
        await append(batch);
        for(const x of batch)receipts[x.id]=Date.now();
        receiptsWrite(receipts);
        const doneIDs=new Set(batch.map(x=>x.id));
        q=q.filter(x=>!doneIDs.has(x.id));
        queueWrite(q);
      }
    }catch(e){error=String(e.message??e)}
    done(error?'YOS: Notion送信未確認・保留保持（'+error.slice(0,45)+'）':'YOS: Notion保存確認');
  }
}catch(e){done('YOS: 保存前エラー（'+String(e.message??e).slice(0,65)+'）')}
