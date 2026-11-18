// YOS JOURNAL GPT制作 → existing private Notion YOS Inbox (draft-only).
// Embedded into the compiled Shortcut's native Scriptable inline action.
// No new credentials, service, DB, or installable Scriptable script.
// The source draft has already been saved to iCloud Drive by Shortcuts.
// Never uploads text to public GitHub or labels it as a published issue.
'use strict';
const JOURNAL_INBOX=Object.freeze({
  page:'3d35ca88-2895-81ef-9dc8-d5f11ff8e213',
  token:'YOS_NOTION_INTEGRATION_TOKEN',
  version:'2025-09-03',
  maxLength:12000,
  chunkSize:1400,
  maxPages:60
});
const txt=x=>String(x??'');
const plain=b=>(b?.paragraph?.rich_text||[]).map(x=>x.plain_text??x.text?.content??'').join('');
const para=x=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:x}}]}});
function digest(s) {
  let a=2166136261,b=2246822519;
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,16777619)>>>0;b=Math.imul(b^c,3266489917)>>>0;}
  return [a,b].map(x=>x.toString(16).padStart(8,'0')).join('');
}
function chunks(str) {
  const out=[];for(let i=0;i<str.length;i+=JOURNAL_INBOX.chunkSize)out.push(str.slice(i,i+JOURNAL_INBOX.chunkSize));
  return out;
}
async function request(method,path,token,body) {
  const req=new Request('https://api.notion.com/v1'+path);
  req.method=method;
  req.timeoutInterval=20;
  req.headers={Authorization:'Bearer '+token,'Notion-Version':JOURNAL_INBOX.version,'Content-Type':'application/json'};
  if(body!==undefined)req.body=JSON.stringify(body);
  let data;
  try{data=await req.loadJSON();}catch(_){throw Error('NETWORK_UNKNOWN');}
  if(!req.response||req.response.statusCode<200||req.response.statusCode>=300)
    throw Error('NOTION_HTTP_'+(req.response?.statusCode||'UNKNOWN'));
  return data;
}
async function findReceipt(token,marker,expected) {
  let cursor='',markers=0,complete=0,window=[];
  for(let i=0;i<JOURNAL_INBOX.maxPages;i++) {
    const res=await request('GET','/blocks/'+JOURNAL_INBOX.page+'/children?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):''),token);
    if(!Array.isArray(res.results)||typeof res.has_more!=='boolean')throw Error('SCAN_INVALID');
    for(const b of res.results){
      const v=b.type==='paragraph'?plain(b):'#OTHER#';
      if(v===marker)markers++;
      window.push(v);
      if(window.length>expected.length)window.shift();
      if(window.length===expected.length&&window.every((str,j)=>str===expected[j]))complete++;
    }
    if(!res.has_more)return {markers,complete};
    if(!res.next_cursor||res.next_cursor===cursor)throw Error('SCAN_CURSOR_INVALID');
    cursor=res.next_cursor;
  }
  throw Error('SCAN_INCOMPLETE');
}
async function verifyBlocks(token,expected,items) {
  if(!Array.isArray(items)||items.length!==expected.length||items.some(x=>!x?.id))throw Error('APPEND_RESPONSE_INVALID');
  for(let i=0;i<expected.length;i++){
    const block=await request('GET','/blocks/'+encodeURIComponent(items[i].id),token);
    if(block?.type!=='paragraph'||plain(block)!==expected[i])throw Error('READBACK_MISMATCH');
  }
}
async function transfer(input) {
  if(typeof input!=='string')return {status:'held',reason:'NO_TEXT_INPUT'};
  const raw=input.trim();
  if(raw.length<150||raw.length>JOURNAL_INBOX.maxLength)return {status:'held',reason:'LENGTH_OUT_OF_RANGE'};
  if(!raw.slice(0,260).includes('YOS_EDITORIAL_DRAFT_V1'))return {status:'held',reason:'DRAFT_MARKER_MISSING'};
  if(!raw.includes('公開不可・要審査'))return {status:'held',reason:'NOT_REVIEW_MARKED'};
  if(/(?:sk-proj-|gh[pousr]_[A-Za-z0-9_-]{16,}|Bearer\s+\S+)/i.test(raw))return {status:'held',reason:'SENSITIVE_TOKEN_MARKER'};
  if(!Keychain.contains(JOURNAL_INBOX.token))return {status:'held',reason:'NOTION_KEY_MISSING'};
  const token=Keychain.get(JOURNAL_INBOX.token);
  if(typeof token!=='string'||token.length<10)return {status:'held',reason:'NOTION_KEY_INVALID'};
  const marker='[YOS_JOURNAL_DRAFT_V1:'+digest(raw)+':'+raw.length+']';
  // Fixed metadata also makes reconciliation stable across midnight.
  const segments=[marker,'JOURNAL下書き・未検証・公開禁止',...chunks(raw)];
  if(segments.length>100)return {status:'held',reason:'TOO_MANY_BLOCKS'};
  let result=await findReceipt(token,marker,segments);
  if(result.markers>1)return {status:'held',reason:'DUPLICATE_MARKERS_FOUND'};
  if(result.markers===1&&result.complete!==1)return {status:'held',reason:'INCOMPLETE_EXISTING_DRAFT'};
  if(result.complete===1)return {status:'confirmed',reason:'ALREADY_VERIFIED',marker};
  const reply=await request('PATCH','/blocks/'+JOURNAL_INBOX.page+'/children',token,{children:segments.map(para)});
  // Unknown response must never be treated as safe to blindly retry.
  await verifyBlocks(token,segments,reply.results);
  result=await findReceipt(token,marker,segments);
  if(result.markers!==1||result.complete!==1)throw Error('RECEIPT_NOT_UNIQUE_AFTER_WRITE');
  return {status:'confirmed',reason:'NOTION_READBACK_OK',marker};
}
async function notifyHeld(reason) {
  try{
    const n=new Notification();
    n.title='YOS JOURNAL｜下書き転送は保留';
    n.body='iCloudには下書きを保存済み。Notionへの反映は未確認（'+reason+'）。再実行で二重送信しないよう保護します。';
    await n.schedule();
  }catch(_){}
}
async function main(){
  let result;
  try{result=await transfer(args.shortcutParameter);}
  catch(e){result={status:'held',reason:txt(e?.message||e)};}
  if(result.status!=='confirmed')await notifyHeld(result.reason);
  Script.setShortcutOutput('YOS_JOURNAL_DRAFT_NOTION_'+(result.status==='confirmed'?'CONFIRMED':'HELD')+':'+result.reason);
  Script.complete();
}
await main();
