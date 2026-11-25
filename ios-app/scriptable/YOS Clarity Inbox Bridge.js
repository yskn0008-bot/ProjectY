// Variables used by Scriptable.
// icon-color: purple; icon-glyph: inbox;
// YOS_SCRIPT_NAME: YOS Clarity Inbox Bridge
// Clarity Voice / Text / Share and opt-in YOS JOURNAL private drafts -> existing Notion YOS Inbox (Raw First + verified readback).
// A Shortcut must pass the original dictated text as its Scriptable input.
// No token is embedded or sent to GitHub; the existing Scriptable Keychain is reused.
'use strict';

const CFG = Object.freeze({
  inboxId: '3d35ca88-2895-81ef-9dc8-d5f11ff8e213',
  tokenKey: 'YOS_NOTION_INTEGRATION_TOKEN',
  version: '2025-09-03',
  receiptsFile: 'YOS Clarity Inbox Bridge Receipts.json',
  maxLength: 12000,
  chunkLength: 1500,
  retryDelayMs: 90000,
  maxScanPages: 60
});
const input = typeof args === 'undefined' ? '' : args.shortcutParameter;
// Shortcuts can serialize a Dictionary as JSON text. Accept that alternate
// representation ONLY for an explicitly marked private JOURNAL draft; leave
// legacy Clarity free-text inputs completely unchanged. A malformed JOURNAL
// envelope fails closed rather than being misfiled as a Clarity voice capture.
function journalEnvelope(value) {
  if (typeof value !== 'string' || !/^\s*\{/.test(value) ||
      !/"source"\s*:\s*"journal"/.test(value)) return null;
  try {
    const parsed=JSON.parse(value);
    if(parsed && typeof parsed==='object' && !Array.isArray(parsed) && parsed.source==='journal')
      return parsed;
  }catch(_){}
  return {source:'journal',rawText:''};
}
const payload = input && typeof input === 'object' && !Array.isArray(input)
  ? input : journalEnvelope(input) || {};
const raw = typeof input === 'string' && payload.source !== 'journal' ? input :
  (typeof payload.rawText === 'string' ? payload.rawText : '');
const sourceKey = String(payload.source || payload.inputMode || 'voice').toLowerCase().replace(/^clarity[. ]?/, '').trim();
const sourceLabels = Object.freeze({voice:'Clarity Voice',text:'Clarity Text',share:'Clarity Share',journal:'YOS JOURNAL Draft'});
const sourceLabel = sourceLabels[sourceKey] || null;
const shareSource = sourceKey === 'share' && /^(text|url|webpage|richtext|image|pdf)$/.test(String(payload.shareSource || '').toLowerCase())
  ? String(payload.shareSource).toLowerCase() : '';
// Explicit JOURNAL auto-ID is deterministic across retries; all other modes keep the old contract.
function journalCaptureId(value){
 let a=2166136261,b=2246822519;
 for(let i=0;i<value.length;i++){const ch=value.charCodeAt(i);a=Math.imul(a^ch,16777619)>>>0;b=Math.imul(b^ch,3266489917)>>>0;}
 return 'journal:'+a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0')+'-'+value.length;
}
const externalId = sourceKey==='journal'&&payload.routeMode==='raw-only'&&payload.captureId==='journal:auto'
 ? journalCaptureId(raw)
 : payload.captureId === undefined || payload.captureId === null || payload.captureId === '' ? '' : String(payload.captureId);
// A calendar event created by the local Shortcuts executor must never be
// turned into a second scheduled Notion task merely because its Raw text
// contains an explicit time. This mode only suppresses downstream routing;
// the original capture is still saved and verified in the existing Inbox.
const routeMode = payload.routeMode === undefined ? 'auto' : payload.routeMode;
const calendarCreated = payload.executionTarget === 'calendar.create';
const fm = FileManager.local();
const receiptPath = fm.joinPath(fm.documentsDirectory(), CFG.receiptsFile);
const isNonEmpty = typeof raw === 'string' && raw.trim().length > 0;
const legalId = s => /^(?:clarity|share|journal):[a-z0-9_-]{8,100}$/i.test(String(s || ''));
const textOf = b => (b?.paragraph?.rich_text || []).map(v => v.plain_text ?? v.text?.content ?? '').join('');
const paragraph = value => ({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:value}}]}});
const split = text => {
  const result=[];
  for(let n=0;n<text.length;){
    let end=Math.min(n+CFG.chunkLength,text.length);
    // Never split a UTF-16 surrogate pair between two Notion rich-text blocks.
    if(end<text.length){
      const c=text.charCodeAt(end-1);
      if(c>=0xD800&&c<=0xDBFF)end--;
    }
    if(end<=n)throw Error('CHUNK_BOUNDARY_INVALID');
    result.push(text.slice(n,end));
    n=end;
  }
  return result;
};
const message = (status,receipt,detail='') => ({status,captureId:receipt?.captureId || null,detail,notionVerified:status==='confirmed'});
function load() {
  if (!fm.fileExists(receiptPath)) return [];
  const rows=JSON.parse(fm.readString(receiptPath));
  if (!Array.isArray(rows) || rows.length>100000 ||
      rows.some(r=>!r || !legalId(r.captureId) ||
        (r.status==='archived'
          ? (typeof r.source!=='string' || !r.source)
          : typeof r.raw!=='string')))
    throw Error('LOCAL_RECEIPTS_INVALID');
  return rows;
}
function persist(rows) {
  // Keep every confirmed capture ID as an archival tombstone after its full
  // local receipt ages out. Deleting IDs would let old Shortcut retries append
  // duplicate Notion blocks. Archive only confirmed receipts, never pending ones.
  const confirmed=rows.filter(r=>r.status==='confirmed');
  const archival=rows.filter(r=>r.status==='archived').concat(
    confirmed.slice(0,-150).map(r=>({
      captureId:r.captureId, source:r.source||'Clarity Voice',
      createdAt:r.createdAt, status:'archived'
    }))
  );
  const recent=confirmed.slice(-150);
  const unresolved=rows.filter(r=>r.status!=='confirmed'&&r.status!=='archived');
  if (unresolved.length>500) throw Error('LOCAL_PENDING_LIMIT');
  if (archival.length+recent.length+unresolved.length>100000) throw Error('LOCAL_RECEIPTS_LIMIT');
  const serialized=JSON.stringify([...archival,...recent,...unresolved]);
  fm.writeString(receiptPath,serialized);
  if (fm.readString(receiptPath)!==serialized) throw Error('LOCAL_READBACK_FAILED');
}
function newId() {
  const nonce = Math.floor(Math.random()*1e15).toString(36).padStart(9,'0');
  return (sourceKey==='journal'?'journal:':'clarity:')+Date.now().toString(36)+'-'+nonce;
}
async function notion(method,path,token,body) {
  const req=new Request('https://api.notion.com/v1'+path);
  req.method=method;
  req.timeoutInterval=20;
  req.headers={Authorization:'Bearer '+token,'Notion-Version':CFG.version,'Content-Type':'application/json'};
  if (body!==undefined) req.body=JSON.stringify(body);
  let data;
  try {data=await req.loadJSON();}
  catch(_){throw Error('NETWORK_UNKNOWN');}
  if (!req.response || req.response.statusCode<200 || req.response.statusCode>=300)
    throw Error('NOTION_HTTP_'+(req.response?.statusCode||'UNKNOWN'));
  return data;
}
function confirmResponse(blocks,written,meta,chunks) {
  if (!Array.isArray(written?.results) || written.results.length!==blocks.length) throw Error('APPEND_REPLY_UNKNOWN');
  const list=written.results;
  if (list.some(x=>typeof x?.id!=='string' || !x.id)) throw Error('APPEND_REPLY_UNKNOWN');
  if (textOf(list[0])!==meta || chunks.some((x,i)=>textOf(list[i+1])!==x) || list[list.length-1].type!=='divider')
    throw Error('APPEND_REPLY_MISMATCH');
  return list;
}
async function confirmBlocks(items,meta,chunks,token) {
  for(let i=0;i<items.length;i++) {
    const got=await notion('GET','/blocks/'+encodeURIComponent(items[i].id),token);
    if(i===items.length-1) {if(got?.type!=='divider')throw Error('READBACK_DIVIDER_MISMATCH');}
    else if (textOf(got)!==(i===0?meta:chunks[i-1])) throw Error('READBACK_MISMATCH');
  }
}
// Resolve a missing HTTP response before deciding whether a retry is safe.
// This makes no changes to Notion. Incomplete pagination must not be treated as absence.
async function reconcile(meta,chunks,token) {
  let cursor='',hits=0,buffer=[];
  const sequence=[meta,...chunks,'#DIVIDER#'];
  for(let page=0;page<CFG.maxScanPages;page++) {
    const query='?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):'');
    const data=await notion('GET','/blocks/'+CFG.inboxId+'/children'+query,token);
    if(!Array.isArray(data?.results) || typeof data.has_more!=='boolean')throw Error('SCAN_INVALID');
    for(const block of data.results) {
      const value=block.type==='divider'?'#DIVIDER#':(block.type==='paragraph'?textOf(block):'#OTHER#');
      buffer.push(value);
      if (buffer.length>sequence.length) buffer.shift();
      if(buffer.length===sequence.length && buffer.every((v,i)=>v===sequence[i]))hits++;
    }
    if (!data.has_more) return hits===1?'found':hits>1?'duplicate':'absent';
    if(typeof data.next_cursor!=='string' || !data.next_cursor || cursor===data.next_cursor)throw Error('SCAN_CURSOR_INVALID');
    cursor=data.next_cursor;
  }
  throw Error('SCAN_INCOMPLETE');
}
async function run() {
  if (!isNonEmpty) return message('missing',null,'ショートカットから原文が渡されていません');
  if (!sourceLabel) return message('held',null,'不明なClarity入力元のため保存を保留');
  if (externalId && !legalId(externalId)) return message('held',null,'受付IDが不正なため保存を保留');
  // JOURNAL is a private editorial draft, not an arbitrary Clarity input. Require
  // a stable edition receipt before any local or remote write; never auto-create
  // a fresh ID for a retry, and never route a non-editorial payload as a draft.
  if (sourceKey==='journal') {
    if (/(?:sk-proj-|gh[pousr]_[A-Za-z0-9_-]{16,}|Bearer\s+\S+)/i.test(raw))
      return message('held',null,'JOURNAL原稿に認証情報の可能性があるため停止');
    if (!externalId || !externalId.startsWith('journal:'))
      return message('held',null,'JOURNAL号の固定受付IDがありません。重複防止のため保存しません');
    if (!raw.slice(0,260).includes('YOS_EDITORIAL_DRAFT_V1') ||
        !raw.includes('【資料と照合状況】') || !raw.includes('公開不可・要審査'))
      return message('held',null,'JOURNAL原稿の非公開審査マーカーが揃っていません');
  }
  if (raw.length>(sourceKey==='journal'?36000:CFG.maxLength)) return message('held',null,'長文のためNotion送信を保留（元ショートカットの記録を保持）');
  let rows;
  try{rows=load();}
  catch(_){return message('held',null,'既存の保存記録が読めないため変更せず停止');}
  const sameSource=r=>r.source===sourceLabel || (!r.source && sourceKey==='voice');
  let row=externalId ? rows.find(r=>r.captureId===externalId) :
    rows.find(r=>r.raw===raw&&sameSource(r)&&r.status!=='confirmed');
  const now=Date.now();
  if(row?.status==='archived')
    return message('held',row,'過去に保存確認済みの受付IDです。二重送信を防ぐため再送を保留');
  if(row && (row.raw!==raw || !sameSource(row)))
    return message('held',row,'同じ受付IDに異なる原文・入力元があるため停止');
  if(!row && !externalId) {
    // Only collapse retries within 30 seconds for legacy shortcuts lacking an ID.
    row=rows.find(r=>r.raw===raw&&sameSource(r)&&r.status==='confirmed'&&now-r.createdAt<30000);
    if(row)return message('confirmed',row,'直前の同一入力は読戻し確認済み');
  }
  if(!row) {
    row={captureId:externalId || newId(),raw,source:sourceLabel,shareSource,
      createdAt:now,status:'queued',attempts:0,attemptedAt:0};
    rows.push(row);
  }
  try{persist(rows);}catch(_){return message('held',row,'端末の原文保存・読戻しに失敗');}
  if(row.status==='confirmed')return message('confirmed',row,'保存済み');
  if(!Keychain.contains(CFG.tokenKey))return message('held',row,'既存Notion認証キーがScriptableにありません');
  const token=Keychain.get(CFG.tokenKey);
  if(typeof token!=='string'||token.length<10)return message('held',row,'既存Notion認証キーが無効');
  const chunks=split(row.raw);
  const meta=new Date(row.createdAt).toISOString()+' · '+(row.source || 'Clarity Voice')+' · '+row.captureId+
    (row.shareSource?' · source='+row.shareSource:'');
  const blocks=[paragraph(meta),...chunks.map(paragraph),{object:'block',type:'divider',divider:{}}];
  // If an earlier request may have reached Notion, read the entire Inbox before retrying.
  if(row.attempts>0) {
    try {
      const found=await reconcile(meta,chunks,token);
      if(found==='found') {
        row.status='confirmed';row.confirmedAt=Date.now();persist(rows);
        return message('confirmed',row,'以前の送信をNotionで確認');
      }
      if(found==='duplicate')return message('held',row,'Notionに同じ受付IDが複数あるため停止');
    } catch(_){return message('held',row,'前回送信の結果を完全照合できないため再送を保留');}
    if(Date.now()-row.attemptedAt<CFG.retryDelayMs)
      return message('held',row,'前回送信直後のため再送を保留');
  }
  row.attempts++;
  row.attemptedAt=Date.now();
  row.status='unknown';
  try{persist(rows);}catch(_){return message('held',row,'送信前の保存記録を保護できず停止');}
  try {
    const reply=await notion('PATCH','/blocks/'+CFG.inboxId+'/children',token,{children:blocks});
    const items=confirmResponse(blocks,reply,meta,chunks);
    await confirmBlocks(items,meta,chunks,token);
    row.status='confirmed';row.confirmedAt=Date.now();persist(rows);
    return message('confirmed',row,'Notion Inbox保存・読戻し成功');
  } catch(e) {
    // The append may have succeeded despite a lost reply or a failed readback.
    // Keep the same capture ID for a later safe reconciliation, never blind-retry.
    try{persist(rows);}catch(_){/* preserve the original exception semantics */}
    return message('held',row,'Notion保存は未確認：'+String(e.message||e));
  }
}

// v3-compatible optional direct routing. After durable Raw readback, this can
// send an explicit Clarity user instruction to its existing Notion destination
// without a server, new token, DB, Shortcut or service. Never route shared data.
// Generic destinations use an EXACT, uniquely resolved existing Notion page.
const ROUTES=Object.freeze({
  task:{id:'965c6086-32c1-463d-93b4-87a9cb69b3ad',title:'やること',key:'同期キー'},
  shopping:{id:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc',title:'商品名',key:'メモ'},
  diary:{id:'fe0e0973-d1cc-4bde-b138-1cb1da64ac68',title:'日記',key:'記録キー'},
  life:{id:'30df9a73-2ea7-4ff7-8187-2b62dc8f9da4',title:'イベント名',key:'記録キー'}
});
const rt=s=>[{type:'text',text:{content:String(s)}}];
const plain=xs=>(xs||[]).map(x=>x.plain_text??x.text?.content??'').join('');
function routeDay(ms){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
function scheduledTask(text,createdAt){
  if(/[?？]/u.test(text)||routeUnsafe.test(text)||/(?:は不要|しない|行かない|見送り)[。！!]*$/u.test(text))return null;
  const value=text.replace(/^(?:タスク|やること)[:：]\s*/u,'');
  const match=/^(今日|明日|あした|明後日|\d{4}-\d{2}-\d{2})(?:の)?[,、\s]*(\d{1,2})(?::(\d{2})|時\s*(?:(\d{1,2})分)?)\s*(?:から[,、\s]*(\d{1,4})分|[〜～~–—-]\s*(\d{1,2})(?::(\d{2})|時\s*(?:(\d{1,2})分)?))[,、\s]*(.{1,120})$/u.exec(value);
  if(!match)return null;
  const [,when,h,colons,spoken,duration,endH,endColon,endSpoken,title]=match;
  const startMinute=Number(colons??spoken??0);
  const endMinute=Number(endColon??endSpoken??0);
  if(Number(h)>23||startMinute>59||endMinute>59)return null;
  const relative={今日:0,明日:1,あした:1,明後日:2}[when];
  const day=relative===undefined?when:new Date(Date.parse(routeDay(createdAt)+'T00:00:00Z')+relative*86400000).toISOString().slice(0,10);
  const midnight=Date.parse(day+'T00:00:00+09:00');
  if(!Number.isFinite(midnight)||routeDay(midnight)!==day)return null;
  const start=Number(h)*60+startMinute;
  const end=duration?start+Number(duration):Number(endH)*60+endMinute;
  if(end-start<5||end>1440)return null;
  const format=minute=>new Date(midnight+minute*60000).toISOString();
  return {target:'task',text:title.trim(),window:{start:format(start),end:format(end)}};
}
function instruction(line,createdAt){
  const text=String(line||'').trim().normalize('NFKC');
  if(!text||text.length>1800||/^(?:もし|仮に|相談|質問|調べて|比較して)/u.test(text))return null;
  let m=/^Notion[のに]?[「『]([^」』]{1,100})[」』]に(?:追記|保存|記録)[：:\s]+([\s\S]{1,1800})$/iu.exec(text);
  if(m&&m[1]?.trim()&&m[2]?.trim()&&m[1].trim()!=='YOS Inbox')
    return {target:'page',pageName:m[1].trim(),text:m[2].trim()};
  if(/(?:支払|入金|出金|返済|振込|決済|購入済|残高|銀行|PayPay|送金|ログイン|暗証番号)/iu.test(text))
    return null;
  const timed=scheduledTask(text,createdAt);
  if(timed&&timed.text)return timed;
  m=/^(?:タスク|やること)[：:]\s*(.{1,180})$/iu.exec(text);
  if(m)return {target:'task',text:m[1].trim()};
  m=/^(?:買い物リスト|買い物|欲しいもの)[：:]\s*(.{1,180})$/iu.exec(text);
  if(m)return {target:'shopping',text:m[1].trim()};
  m=/^(?:日記)[：:]\s*(.{1,800})$/iu.exec(text);
  if(m)return {target:'diary',text:m[1].trim()};
  m=/^生活記録に[：:\s]*(.{1,180})を(?:記録|保存)して[。！!]?$/iu.exec(text);
  if(m)return {target:'life',text:m[1].trim()};
  return null;
}
const routeUnsafe=/(?:削除|キャンセル|取り消し|登録しない|追加しない|記録しない|買わない|欲しくない|したくない|中止|やめる)/u;
const routeFinance=/(?:残高|支払|入金|出金|返済|振込|送金|口座|銀行|PayPay|クレジット|請求|引落|\d[\d,]*\s*円)/iu;
const routeDateRisk=/(?:明日|あした|明後日|今週|来週|来月|来年|再来週|今日|今夜|今度|月末|\d{1,2}\s*[日月時]|\d{1,4}[-/]\d{1,2}|予定|期限|締切|予約)/u;
function modelInstruction(item,createdAt){
  // v3's exact-substring and high-confidence guard, with no natural-language
  // device commands, funds transfers, payments, or destructive instructions.
  if(!item||typeof item.text!=='string'||typeof item.target!=='string'||
      !Number.isFinite(item.confidence)||item.confidence<.95||item.confidence>1)return null;
  const candidate=item.text.trim().normalize('NFKC');
  if(candidate.length<3||candidate.length>1000||/[?？]/u.test(candidate)||routeUnsafe.test(candidate))return null;
  const explicit=instruction(candidate,createdAt);
  if(explicit&&item.target===explicit.target)return explicit;
  if(routeFinance.test(candidate)||!['task','shopping','diary','life'].includes(item.target))return null;
  if(['task','shopping'].includes(item.target)&&routeDateRisk.test(candidate))return null;
  if(item.confidence<.98)return null;
  let text='';
  if(item.target==='task'&&/^[^\n]{2,80}(?:する|片付ける|掃除する)[。!！]?$/u.test(candidate))
    text=candidate.replace(/[。!！]+$/u,'').trim();
  if(item.target==='shopping'&&/^[^\n]{2,90}(?:を|が)?(?:買いたい|買わなきゃ|欲しい)[。!！]?$/u.test(candidate))
    text=candidate.replace(/(?:を|が)?(?:買いたい|買わなきゃ|欲しい)[。!！]?$/u,'').trim();
  // Diary and Life still require an explicit user label. Historical memories,
  // health claims, and future plans must not be misfiled by a classifier guess.
  return text&&text.length<=120?{target:item.target,text}:null;
}
function proposals(createdAt){
  if(sourceKey==='share')return [];
  // The existing Pilot v3 asks ChatGPT for {text,target,confidence}; GPT must
  // quote exact non-overlapping substrings of the user's Raw capture.
  const supplied=payload.items_json??payload.itemsJson;
  if(supplied!==undefined){
    let parsed;
    try{parsed=typeof supplied==='string'?JSON.parse(supplied):supplied;}catch(_){return [];}
    if(!Array.isArray(parsed)||parsed.length>6)return [];
    const taken=[];
    const plans=[];
    for(const item of parsed){
      if(!item||typeof item.text!=='string'||item.text.length<3||item.text.length>1000){
        return []; // malformed plan: stop the entire batch rather than shifting keys
      }
      const t=item.text.trim();
      let p=raw.indexOf(t),found=-1;
      while(p>=0){
        if(taken.every(([a,b])=>p+t.length<=a||p>=b)){found=p;break;}
        p=raw.indexOf(t,p+1);
      }
      if(found<0)return [];
      taken.push([found,found+t.length]);
      plans.push(modelInstruction(item,createdAt));
    }
    return plans;
  }
  const lines=raw.replace(/<br\s*\/?\s*>/giu,'\n').split(/\r?\n/u).map(x=>x.trim()).filter(Boolean);
  if(lines.length>6)return [];
  return lines.map(line=>instruction(line,createdAt));
}

async function routeQuery(ds,filter,token){
  const result=await notion('POST','/data_sources/'+ds+'/query',token,{filter,page_size:2});
  if(!Array.isArray(result.results)||result.has_more)throw Error('ROUTE_QUERY_INCOMPLETE');
  return result.results;
}
async function routeToKnown(v,receipt,token,entry){
  const spec=ROUTES[v.target];
  const filter={property:spec.key,rich_text: v.target==='shopping'?{contains:receipt}:{equals:receipt}};
  let matches=await routeQuery(spec.id,filter,token);
  for(const row of matches){
    const got=await notion('GET','/pages/'+row.id,token);
    const existing=plain(got.properties?.[spec.key]?.rich_text);
    if(v.target==='shopping'?existing.split(/\r?\n/u).includes(receipt):existing===receipt)return 'duplicate';
  }
  // Check the verified v3 receipt on retries even if the older single-item
  // record used the unsuffixed key.
  const sameTitle=await routeQuery(spec.id,{property:spec.title,title:{equals:v.target==='diary'?routeDay(entry.createdAt)+'｜Clarity':v.text}},token);
  if(sameTitle.some(row=>{
    if(!v.window)return true;
    const date=row.properties?.['期限']?.date;
    if(!date?.start)return true; // A nameless time match must not overwrite an existing unscheduled row.
    const at=Date.parse(date.start),until=Date.parse(date.end);
    return !Number.isFinite(at)||!date.start.includes('T')||at===Date.parse(v.window.start)||
      (Number.isFinite(until)&&at<Date.parse(v.window.end)&&until>Date.parse(v.window.start));
  }))return 'held';
  const props={};
  const title=v.target==='diary'?routeDay(entry.createdAt)+'｜Clarity':v.text;
  props[spec.title]={title:rt(title)};
  if(v.target==='task'){
    props['同期キー']={rich_text:rt(receipt)};
    props['正本・根拠']={rich_text:rt('YOS Inbox '+entry.captureId)};
    props['種類']={select:{name:'Task'}};
    props['状態']={select:{name:'次にやる'}};
    if(v.window)props['期限']={date:v.window};
  }else if(v.target==='shopping'){
    props['メモ']={rich_text:rt(v.text+'\n'+receipt)};
    props['区分']={select:{name:'欲しいもの'}};
    props['買い物状態']={select:{name:'検討中'}};
  }else if(v.target==='diary'){
    props['本文']={rich_text:rt(v.text)};
    props['日付']={date:{start:routeDay(entry.createdAt)}};
    props['記録元']={select:{name:'Clarity'}};
    props['記録キー']={rich_text:rt(receipt)};
  }else if(v.target==='life'){
    props['備考']={rich_text:rt(v.text)};
    props['記録キー']={rich_text:rt(receipt)};
    props['取得元']={select:{name:'Clarity'}};
    props['種類']={select:{name:'その他'}};
  }
  const created=await notion('POST','/pages',token,{parent:{type:'data_source_id',data_source_id:spec.id},properties:props});
  if(!created?.id)throw Error('ROUTE_CREATE_UNKNOWN');
  const saved=await notion('GET','/pages/'+created.id,token);
  const keyValue=plain(saved.properties?.[spec.key]?.rich_text);
  if(!(v.target==='shopping'?keyValue.split(/\r?\n/u).includes(receipt):keyValue===receipt))throw Error('ROUTE_READBACK_UNKNOWN');
  if(v.window){
    const date=saved.properties?.['期限']?.date;
    if(Date.parse(date?.start)!==Date.parse(v.window.start)||Date.parse(date?.end)!==Date.parse(v.window.end))throw Error('ROUTE_DATE_READBACK_UNKNOWN');
  }
  return 'created';
}
async function routeToPage(v,receipt,token){
  const found=await notion('POST','/search',token,{query:v.pageName,filter:{property:'object',value:'page'},page_size:100});
  if(!Array.isArray(found.results)||found.has_more)throw Error('PAGE_SEARCH_INCOMPLETE');
  const exact=found.results.filter(p=>p?.object==='page'&&!p.in_trash&&!p.archived&&p.id&&p.id!==CFG.inboxId &&
    Object.values(p.properties||{}).some(x=>x?.type==='title'&&plain(x.title)===v.pageName));
  if(exact.length!==1)return 'held';
  const id=exact[0].id;
  async function hasReceipt(){
    let cursor='';
    for(let i=0;i<60;i++){
      const res=await notion('GET','/blocks/'+id+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):''),token);
      if(!Array.isArray(res.results)||typeof res.has_more!=='boolean')throw Error('PAGE_SCAN_INCOMPLETE');
      if(res.results.some(b=>b.type==='paragraph'&&plain(b.paragraph?.rich_text).startsWith('[YOS Inbox '+receipt+']')))return true;
      if(!res.has_more)return false;
      if(typeof res.next_cursor!=='string'||!res.next_cursor||res.next_cursor===cursor)throw Error('PAGE_CURSOR_INVALID');
      cursor=res.next_cursor;
    }
    throw Error('PAGE_SCAN_LIMIT');
  }
  if(await hasReceipt())return 'duplicate';
  const item=paragraph('[YOS Inbox '+receipt+'] '+v.text);
  await notion('PATCH','/blocks/'+id+'/children',token,{children:[item]});
  if(!await hasReceipt())throw Error('PAGE_APPEND_READBACK_UNKNOWN');
  return 'created';
}
async function routeAfterVerifiedRaw(outcome){
  if(outcome.status!=='confirmed'||sourceKey==='share'||sourceKey==='journal')return null;
  if(calendarCreated && routeMode!=='raw-only')return '振り分け保留（既存カレンダー登録の重複防止）';
  if(routeMode==='raw-only')return '原文のみ保存（別原本の予定を二重登録しません）';
  if(routeMode!=='auto')return '振り分け保留（未対応の振り分けモード）';
  if(!Keychain.contains(CFG.tokenKey))return '振り分け保留（認証情報なし）';
  const rows=load(),entry=rows.find(x=>x.captureId===outcome.captureId);
  if(!entry||entry.status!=='confirmed'||entry.raw!==raw)return '振り分け保留（Raw受領確認なし）';
  const plan=proposals(entry.createdAt);
  if(!plan.length)return '振り分け未指定（原文は保存済み）';
  // Freeze the item-to-receipt mapping in the existing local receipt journal.
  // Repeated AI classifications of the same Raw text must never re-purpose
  // an existing :01 or :02 receipt for another Notion destination.
  const signature=JSON.stringify(plan.map(x=>x?[x.target,x.text,x.pageName||'',...(x.window?[x.window.start,x.window.end]:[])]:null));
  if(entry.planSignature&&entry.planSignature!==signature)return '振り分け保留（以前と分類内容が異なる）';
  if(!entry.planSignature){
    entry.planSignature=signature;
    try{persist(rows);}catch(_){return '振り分け保留（分類状態を端末に保存できません）';}
  }
  const token=Keychain.get(CFG.tokenKey);
  let created=0,duplicates=0,held=0,unknown=0;
  for(let i=0;i<plan.length;i++){
    const v=plan[i];
    if(!v){held++;continue;}
    const receipt='inbox:'+entry.captureId+':'+String(i+1).padStart(2,'0');
    try {
      const result=v.target==='page'?await routeToPage(v,receipt,token):await routeToKnown(v,receipt,token,entry);
      if(result==='created')created++;
      else if(result==='duplicate')duplicates++;
      else held++;
    }catch(_){unknown++;} // A timed-out write may have succeeded; next pass must reconcile first.
  }
  return '振り分け：登録'+created+'件／既存'+duplicates+'件／保留'+held+'件／結果未確認'+unknown+'件';
}

let outcome;
try{outcome=await run();}
catch(e){outcome=message('held',null,'安全停止：'+String(e.message||e));}
let routeStatus=null;
if(outcome.status==='confirmed'){
  try{routeStatus=await routeAfterVerifiedRaw(outcome);}
  catch(_){routeStatus='振り分け保留（結果不明・原文保存済み）';}
}
const line=outcome.status==='confirmed'?'Notion Inbox保存確認済み':
  outcome.status==='missing'?'Notion未保存：入力がありません':'Notion未保存・確認待ち';
// The existing signed JOURNAL Shortcut recognizes this machine receipt.
// Keep the ordinary Clarity human-readable output and all non-JOURNAL paths unchanged.
const journalReceiptPrefix = sourceKey==='journal' && outcome.status==='confirmed'
  ? 'YOS_JOURNAL_NOTION_VERIFIED: ' : '';
const outputDetail = sourceKey==='journal'
  ? String(outcome.detail||'').replace(/YOS_JOURNAL_NOTION_VERIFIED:/g,'JOURNAL_RECEIPT_TEXT')
  : outcome.detail;
Script.setShortcutOutput(journalReceiptPrefix+line+'\n'+outputDetail+'\n'+(outcome.captureId||'')+(routeStatus?'\n'+routeStatus:''));
// Notify only on errors, without exposing the sensitive voice content.
if(outcome.status!=='confirmed'){
  try {const n=new Notification();n.title=sourceKey==='journal'?'JOURNAL｜Notion保存を確認できません':'Clarity｜Notion保存を確認できません';n.body=outcome.detail;n.sound='default';await n.schedule();}catch(_){}
}
Script.complete();
