// Variables used by Scriptable.
// icon-color: purple; icon-glyph: inbox;
// YOS_SCRIPT_NAME: YOS Clarity Inbox Bridge
// Clarity Voice / Text / Share -> existing Notion YOS Inbox (Raw First + verified readback).
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
const payload = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
const raw = typeof input === 'string' ? input :
  (typeof payload.rawText === 'string' ? payload.rawText : '');
const sourceKey = String(payload.source || payload.inputMode || 'voice').toLowerCase().replace(/^clarity[. ]?/, '').trim();
const sourceLabels = Object.freeze({voice:'Clarity Voice',text:'Clarity Text',share:'Clarity Share'});
const sourceLabel = sourceLabels[sourceKey] || null;
const shareSource = sourceKey === 'share' && /^(text|url|webpage|richtext|image|pdf)$/.test(String(payload.shareSource || '').toLowerCase())
  ? String(payload.shareSource).toLowerCase() : '';
const externalId = payload.captureId === undefined || payload.captureId === null || payload.captureId === '' ? '' : String(payload.captureId);
const fm = FileManager.local();
const receiptPath = fm.joinPath(fm.documentsDirectory(), CFG.receiptsFile);
const isNonEmpty = typeof raw === 'string' && raw.trim().length > 0;
const legalId = s => /^(?:clarity|share):[a-z0-9_-]{8,100}$/i.test(String(s || ''));
const textOf = b => (b?.paragraph?.rich_text || []).map(v => v.plain_text ?? v.text?.content ?? '').join('');
const paragraph = value => ({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:value}}]}});
const split = text => {const result=[];for(let n=0;n<text.length;n+=CFG.chunkLength)result.push(text.slice(n,n+CFG.chunkLength));return result;};
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
  return 'clarity:'+Date.now().toString(36)+'-'+nonce;
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
  if (raw.length>CFG.maxLength) return message('held',null,'長文のためNotion送信を保留（元ショートカットの記録を保持）');
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
let outcome;
try{outcome=await run();}
catch(e){outcome=message('held',null,'安全停止：'+String(e.message||e));}
const line=outcome.status==='confirmed'?'Notion Inbox保存確認済み':
  outcome.status==='missing'?'Notion未保存：入力がありません':'Notion未保存・確認待ち';
Script.setShortcutOutput(line+'\n'+outcome.detail+'\n'+(outcome.captureId||''));
// Notify only on errors, without exposing the sensitive voice content.
if(outcome.status!=='confirmed'){
  try {const n=new Notification();n.title='Clarity｜Notion保存を確認できません';n.body=outcome.detail;n.sound='default';await n.schedule();}catch(_){}
}
Script.complete();
