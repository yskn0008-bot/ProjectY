// YOS JOURNAL GPT draft -> existing private Notion YOS Inbox.
// Fast, fail-closed, draft-only handoff. Never publishes or puts content in a URL.
// The Shortcut has already saved a local iCloud backup before executing this.
'use strict';
const J=Object.freeze({
  inbox:'3d35ca88-2895-81ef-9dc8-d5f11ff8e213',
  key:'YOS_NOTION_INTEGRATION_TOKEN',
  version:'2025-09-03',
  maxLength:12000,
  chunkSize:1400,
  receipts:'YOS JOURNAL Draft Receipt Cache.json'
});
const plain=b=>(b?.paragraph?.rich_text||[]).map(t=>t.plain_text??t.text?.content??'').join('');
const para=s=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:s}}]}});
function digest(s){
  let a=2166136261,b=2246822519;
  for(let i=0;i<s.length;i++){
    const c=s.charCodeAt(i);
    a=Math.imul(a^c,16777619)>>>0;
    b=Math.imul(b^c,3266489917)>>>0;
  }
  return [a,b].map(x=>x.toString(16).padStart(8,'0')).join('');
}
function chunks(str){const arr=[];for(let i=0;i<str.length;i+=J.chunkSize)arr.push(str.slice(i,i+J.chunkSize));return arr;}
function stateFile(){const fm=FileManager.local();return {fm,path:fm.joinPath(fm.documentsDirectory(),J.receipts)};}
function loadRecords(store){
  if(!store.fm.fileExists(store.path))return [];
  const rows=JSON.parse(store.fm.readString(store.path));
  if(!Array.isArray(rows)||rows.length>3000||rows.some(x=>!x||typeof x.id!=='string'||!/^\[YOS_JOURNAL_DRAFT_V1:[0-9a-f]{16}:\d{3,5}\]$/.test(x.id)||!['unknown','submitted','verified'].includes(x.status)))throw Error('LOCAL_RECEIPTS_INVALID');
  return rows;
}
function persist(store,records){
  const json=JSON.stringify(records);
  store.fm.writeString(store.path,json);
  if(store.fm.readString(store.path)!==json)throw Error('LOCAL_RECEIPT_READBACK_FAILED');
}
async function send(token,segments){
  const req=new Request('https://api.notion.com/v1/blocks/'+J.inbox+'/children');
  req.method='PATCH';req.timeoutInterval=7;
  req.headers={Authorization:'Bearer '+token,'Notion-Version':J.version,'Content-Type':'application/json'};
  req.body=JSON.stringify({children:segments.map(para)});
  const response=await req.loadJSON();
  if(!req.response||req.response.statusCode<200||req.response.statusCode>=300)throw Error('NOTION_HTTP_'+(req.response?.statusCode||'UNKNOWN'));
  if(!Array.isArray(response?.results)||response.results.length!==segments.length)throw Error('NOTION_REPLY_INCOMPLETE');
  for(let i=0;i<segments.length;i++){
    const block=response.results[i];
    if(!block?.id||block.type!=='paragraph'||plain(block)!==segments[i])throw Error('NOTION_REPLY_CONTENT_MISMATCH');
  }
  return response.results.map(x=>x.id);
}
async function readback(token,segments,ids){
  if(!Array.isArray(ids)||ids.length!==segments.length)return false;
  for(let i=0;i<ids.length;i++){
    if(typeof ids[i]!=='string'||!/^[0-9a-z-]{6,80}$/i.test(ids[i]))return false;
    const req=new Request('https://api.notion.com/v1/blocks/'+encodeURIComponent(ids[i]));
    req.method='GET';req.timeoutInterval=7;
    req.headers={Authorization:'Bearer '+token,'Notion-Version':J.version};
    const block=await req.loadJSON();
    if(!req.response||req.response.statusCode<200||req.response.statusCode>=300||
       block?.id!==ids[i]||block?.type!=='paragraph'||plain(block)!==segments[i])return false;
  }
  return true;
}
async function confirm(store,records,row,token,segments){
  if(row.status==='verified')return {status:'verified',reason:'ALREADY_READBACK_VERIFIED'};
  if(!Array.isArray(row.blockIds)||row.blockIds.length!==segments.length)
    return {status:'pending',reason:'SUBMITTED_READBACK_PENDING'};
  let ok=false;
  try{ok=await readback(token,segments,row.blockIds);}catch(e){/* never retransmit */ }
  if(!ok)return {status:'pending',reason:'NOTION_READBACK_PENDING'};
  row.status='verified';
  try{persist(store,records);}catch(e){return {status:'pending',reason:'LOCAL_VERIFIED_RECEIPT_WRITE_FAILED'};}
  return {status:'verified',reason:'NOTION_INDEPENDENT_READBACK_MATCH'};
}
function validProvenance(raw){
  const marker='<<YOS_JOURNAL_RESEARCH_PROVENANCE_V1>>';
  if(!raw.includes(marker))return true; // legacy private drafts remain supported
  const parts=raw.split(marker);
  if(parts.length!==2)return false;
  const [draft,research]=parts.map(s=>s.trim());
  if(!research.startsWith('YOS_RESEARCH_ABSTRACT_V1')||!research.includes('自動公開禁止'))return false;
  const doiSet=s=>new Set((s.match(/https:\/\/doi\.org\/10\.\d{4,9}\/[^\s<>【】]+/gi)||[]).map(x=>x.toLowerCase()));
  const sources=doiSet(research),citations=doiSet(draft);
  return sources.size===3&&citations.size===3&&[...citations].every(x=>sources.has(x))&&
    (research.match(/^資料[123]｜/gm)||[]).length===3;
}
async function transfer(input){
  if(typeof input!=='string')return {status:'held',reason:'NO_TEXT_INPUT'};
  const raw=input.trim();
  if(raw.length<150||raw.length>J.maxLength)return {status:'held',reason:'LENGTH_OUT_OF_RANGE'};
  if(!raw.slice(0,260).includes('YOS_EDITORIAL_DRAFT_V1')||!raw.includes('公開不可・要審査'))return {status:'held',reason:'NOT_A_REVIEW_DRAFT'};
  if(/(?:sk-proj-|gh[pousr]_[A-Za-z0-9_-]{16,}|Bearer\s+\S+)/i.test(raw))return {status:'held',reason:'SENSITIVE_TOKEN_MARKER'};
  if(!validProvenance(raw))return {status:'held',reason:'THREE_SOURCE_PROVENANCE_MISMATCH'};
  if(!Keychain.contains(J.key))return {status:'held',reason:'NOTION_KEY_MISSING'};
  const token=Keychain.get(J.key);
  if(typeof token!=='string'||token.length<10)return {status:'held',reason:'NOTION_KEY_INVALID'};
  const id='[YOS_JOURNAL_DRAFT_V1:'+digest(raw)+':'+raw.length+']';
  const segments=[id,'JOURNAL下書き・未検証・公開禁止',...chunks(raw)];
  if(segments.length>90)return {status:'held',reason:'TOO_MANY_BLOCKS'};
  const store=stateFile();
  let records=loadRecords(store);
  const row=records.find(x=>x.id===id);
  // Unknown deliveries must never be blindly retried.
  if(row){
    if(row.status==='unknown')return {status:'held',reason:'PREVIOUS_RESULT_UNKNOWN'};
    return confirm(store,records,row,token,segments);
  }
  records.push({id,status:'unknown'});
  persist(store,records);
  let ids;
  try{ids=await send(token,segments);}catch(e){return {status:'held',reason:'NOTION_RESULT_UNKNOWN'};}
  records=loadRecords(store);
  const candidate=records.find(x=>x.id===id);
  if(!candidate||candidate.status!=='unknown')return {status:'held',reason:'LOCAL_RECEIPT_CONFLICT'};
  candidate.status='submitted';candidate.blockIds=ids;
  try{persist(store,records);}catch(e){return {status:'pending',reason:'LOCAL_RECEIPT_UPDATE_FAILED'};}
  // A PATCH acknowledgement alone must not be treated as successful saving.
  return confirm(store,records,candidate,token,segments);
}
async function main(){
  let result={status:'held',reason:'UNKNOWN'};
  try{result=await transfer(args.shortcutParameter);}
  catch(e){result={status:'held',reason:String(e?.message||e).slice(0,65)};}
  try{Script.setShortcutOutput('YOS_JOURNAL_NOTION_'+result.status.toUpperCase()+':'+result.reason);}
  catch(e){/* output API failure must not bypass Script.complete */}
  return result;
}
try{await main();}
finally{Script.complete();}
