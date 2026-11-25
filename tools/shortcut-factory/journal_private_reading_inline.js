// Private-only automatic reading edition after exact Clarity receipt readback.
// Build prepends the existing Inbox inspector and Web reader parser.
// No separate installer, public publication, model, server or new credential.
const PSEP='<<YOS_JOURNAL_RESEARCH_PROVENANCE_V1>>', FSEP='<<YOS_FINAL_REVIEW_RECEIPT_V1>>';
const RSEP='\n<<YOS_INBOX_RECEIPT_V1>>\n';
const HOLD='YOS_JOURNAL_READING_HOLD:';
const failReading=reason=>{throw Error(reason)};
const readingDay=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const exactKeys=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===keys.slice().sort().join('|');
function field(v,min,max){
 if(typeof v!=='string'||v!==v.trim()||v.length<min||v.length>max||/[\u0000-\u001f\u007f<>]|https?:\/\/|Bearer\s+\S+|sk-proj-|ntn_[a-zA-Z0-9_-]+|gh[pousr]_[a-zA-Z0-9_]{16,}/i.test(v))failReading('FIELD_INVALID');
 return v;
}
function approvedSources(s){
 const parts=s.trim().split(/^資料[123]｜/m);
 if(parts.length!==4||!parts[0].startsWith('YOS_RESEARCH_APPROVED_V1\n')||!parts[0].includes('自動公開禁止'))failReading('EVIDENCE_INVALID');
 const out=parts.slice(1).map(x=>{
  const lines=x.trim().split('\n'),url=lines.filter(l=>l.startsWith('論文リンク: ')),year=lines.filter(l=>l.startsWith('出版年: '));
  if(url.length!==1||year.length!==1||!/^出版年: (?:19|20)\d{2}$/.test(year[0])||!safeLink(url[0].slice(7))||!['方法の原文: ','結果の原文: ','考察・限界の原文: '].every(k=>lines.filter(l=>l.startsWith(k)&&l.slice(k.length).length>=35).length===1))failReading('SOURCE_INVALID');
  return {link:url[0].slice(7),source:field(lines[0],10,400)+'（'+year[0].slice(5)+'）'};
 });
 if(new Set(out.map(x=>x.link.toLowerCase())).size!==3)failReading('DUPLICATE_SOURCE');
 return out;
}
function prepareReading(input){
 if(typeof input!=='string'||input.length>40000)failReading('INPUT_INVALID');
 const pair=input.split(RSEP);
 if(pair.length!==2||!pair[1].startsWith('YOS_JOURNAL_NOTION_VERIFIED: '))failReading('INBOX_NOT_VERIFIED');
 const raw=pair[0],receipt='journal:'+digest(raw)+'-'+raw.length;
 if(pair[1].split(/\r?\n/).filter(x=>x===receipt).length!==1||raw.length>36000)failReading('RECEIPT_MISMATCH');
 const final=raw.split(FSEP);
 if(final.length!==2||final[1].trim()!=='YOS_FINAL_REVIEW_PASS_V1')failReading('FINAL_REVIEW_REQUIRED');
 const p=final[0].split(PSEP);
 if(p.length!==2)failReading('PROVENANCE_REQUIRED');
 const sources=approvedSources(p[1]);
 const m=/^【YOS_EDITORIAL_DRAFT_V1】\n【資料と照合状況】\n([\s\S]+)\n【公開不可・要審査】$/.exec(p[0].trim());
 if(!m)failReading('DRAFT_FORMAT');
 let draft;try{draft=JSON.parse(m[1])}catch(_){failReading('DRAFT_JSON')}
 if(!exactKeys(draft,['headline','lead','articles'])||!Array.isArray(draft.articles)||draft.articles.length!==3)failReading('ISSUE_SCHEMA');
 const headline=field(draft.headline,8,160),lead=field(draft.lead,20,500);
 const rows=[readingBlock('heading_2','YOS JOURNAL｜'+readingDay().replace(/-/g,'.')),readingBlock('paragraph',headline),readingBlock('paragraph',lead),readingBlock('paragraph',AUTO_REVIEW_MARK)];
 const seen=new Set();
 for(const [i,a] of draft.articles.entries()){
  if(!exactKeys(a,['category','title','summary','reason','action','caveat','link'])||!/^[A-Z]{4,20}$/.test(a.category||''))failReading('ARTICLE_SCHEMA');
  const src=sources.find(s=>s.link===a.link);
  if(!src||seen.has(a.link))failReading('SOURCE_MISMATCH');
  seen.add(a.link);
  rows.push(readingBlock('divider'),readingBlock('heading_3','0'+(i+1)+' / '+a.category+'｜'+field(a.title,10,160)),readingBlock('paragraph',field(a.summary,45,1500)),readingBlock('paragraph',field(a.reason,20,800)),readingBlock('paragraph','日常への視点：'+field(a.action,10,500)),readingBlock('paragraph','研究の限界：'+field(a.caveat,15,600)),readingBlock('paragraph','原著論文｜'+src.source,src.link));
 }
 rows.push(readingBlock('divider'));
 return {raw,receipt,rows,edition:parseReviewedEdition(rows)};
}
function readingBlock(type,content,url){
 return {object:'block',type,[type]:type==='divider'?{}:{rich_text:[{type:'text',text:{content,...(url?{link:{url}}:{})}}]}};
}
function allEditions(blocks){
 if(!Array.isArray(blocks)||blocks.length>500)failReading('READER_CAPACITY');
 const starts=blocks.map((b,i)=>b?.type==='heading_2'&&HEAD.test(text(b))?i:-1).filter(i=>i>=0);
 if(!starts.length)failReading('READING_HISTORY_ABSENT');
 const editions=starts.map((i,n)=>parseReviewedEdition(blocks.slice(i,starts[n+1]??blocks.length)));
 if(new Set(editions.map(x=>x.issuedOn)).size!==editions.length)failReading('DATE_AMBIGUOUS');
 return editions;
}
function sameEdition(editions,expected){
 const found=editions.filter(e=>e.issuedOn===expected.issuedOn);
 if(!found.length)return false;
 if(found.length!==1||JSON.stringify(found[0])!==JSON.stringify(expected))failReading('DATE_COLLISION');
 return true;
}
async function readingRequest(page,token,method='GET',cursor='',rows=null){
 if(page!==PAGE&&page!==INBOX_ID)failReading('PAGE_NOT_ALLOWED');
 if(method!=='GET'&&(method!=='PATCH'||page!==PAGE||!rows))failReading('WRITE_NOT_ALLOWED');
 const r=new Request('https://api.notion.com/v1/blocks/'+page+'/children'+(method==='GET'?'?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):''):''));
 r.method=method;r.timeoutInterval=6;r.onRedirect=()=>null;
 r.headers={Authorization:'Bearer '+token,'Notion-Version':'2025-09-03','Content-Type':'application/json'};
 if(rows)r.body=JSON.stringify({children:rows});
 const response=await r.loadJSON();
 if(r.response?.statusCode!==200)failReading(method==='PATCH'?'APPEND_UNCONFIRMED':'READ_FAILED');
 return response;
}
async function readingBlocks(page,token,maxPages,deadline){
 const list=[];let cursor='';
 for(let n=0;n<maxPages;n++){
  if(Date.now()>deadline)failReading('READ_TIMEOUT');
  const b=await readingRequest(page,token,'GET',cursor);
  if(!Array.isArray(b.results)||typeof b.has_more!=='boolean')failReading('READ_INVALID');
  list.push(...b.results);
  if(!b.has_more)return list;
  if(typeof b.next_cursor!=='string'||!b.next_cursor||b.next_cursor===cursor)failReading('READ_CURSOR');
  cursor=b.next_cursor;
 }
 failReading('READ_CAPACITY');
}
async function reflectReading(input){
 const p=prepareReading(input);
 if(!Keychain.contains('YOS_NOTION_INTEGRATION_TOKEN'))failReading('TOKEN_MISSING');
 const token=Keychain.get('YOS_NOTION_INTEGRATION_TOKEN');
 if(typeof token!=='string'||token.length<10)failReading('TOKEN_MISSING');
 const deadline=Date.now()+25000;
 const inbox=inspectDrafts(await readingBlocks(INBOX_ID,token,30,deadline));
 const found=inbox.filter(d=>d.receipt===p.receipt);
 if(found.length!==1||found[0].content!==p.raw)failReading('INBOX_READBACK_MISMATCH');
 const before=await readingBlocks(PAGE,token,5,deadline),editions=allEditions(before);
 if(sameEdition(editions,p.edition))return 'YOS_JOURNAL_READING_VERIFIED:ALREADY_SAVED';
 const links=new Set(editions.flatMap(e=>e.articles.map(a=>a.link.toLowerCase())));
 if(p.edition.articles.some(a=>links.has(a.link.toLowerCase())))failReading('PREVIOUS_SOURCE');
 if(before.length+p.rows.length>500)failReading('READER_CAPACITY');
 const fm=FileManager.local(),lock=fm.joinPath(fm.documentsDirectory(),'YOS-JOURNAL-READING-'+p.edition.issuedOn+'.pending');
 if(fm.fileExists(lock))failReading('PREVIOUS_APPEND_UNCONFIRMED');
 const check=await readingBlocks(PAGE,token,5,deadline);
 if(JSON.stringify(check)!==JSON.stringify(before)||fm.fileExists(lock)||Date.now()>deadline)failReading('HISTORY_CHANGED');
 // Single existing workflow only; Notion has no compare-and-swap for append.
 // Preserve the pending marker even on a network failure; a later run
 // recognizes the exact already-saved edition or stops, never blindly retries.
 fm.writeString(lock,p.receipt);
 if(fm.readString(lock)!==p.receipt)failReading('LOCAL_RECEIPT_FAILED');
 await readingRequest(PAGE,token,'PATCH','',p.rows);
 const after=allEditions(await readingBlocks(PAGE,token,5,Date.now()+12000));
 if(!sameEdition(after,p.edition))failReading('APPEND_READBACK_MISMATCH');
 for(const e of editions)if(!sameEdition(after,e))failReading('OLD_EDITION_CHANGED');
 return 'YOS_JOURNAL_READING_VERIFIED:SAVED_AND_READBACK';
}
try{Script.setShortcutOutput(await reflectReading(args.shortcutParameter));}
catch(e){
 const allowed=/^[A-Z_]{3,60}$/.test(String(e?.message||''))?e.message:'CHECK_FAILED';
 Script.setShortcutOutput(HOLD+allowed);
}finally{Script.complete();}
