/**
 * Existing JOURNAL review pipeline -> existing private Notion reading page.
 * This is a trusted editor entry point, not a model self-approval or public publisher.
 * It must be invoked only by the existing independent reviewer after semantic and
 * rights checks. No new credentials, database, automation, GitHub writes, or notifications.
 */
import {createHash} from 'node:crypto';
import {auditProvenance} from './private-to-public-review-bridge.mjs';
import {readPrivateInbox} from './notion-private-draft-readback.mjs';
import {parseReviewedEdition} from '../server/yos-ai/src/routes/journal-reader.mjs';
const PAGE='4215ca88-2895-816f-bdd3-c48c6cf700ae';
const PATH='https://api.notion.com/v1/blocks/'+PAGE+'/children';
const MARK='本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。';
const sha=x=>createHash('sha256').update(JSON.stringify(x),'utf8').digest('hex');
const stop=reason=>{throw Error('JOURNAL_PRIVATE_READING_HOLD:'+reason)};
const canonical=x=>/^https:\/\/doi\.org\/10\.\d{4,9}\/[A-Za-z0-9._;()/:+%-]{1,300}$/i.test(x||'')?x.toLowerCase():stop('DOI_REQUIRED');
const rich=(content,url)=>({type:'text',text:{content,...(url?{link:{url}}:{})}});
const block=(type,content,url)=>({object:'block',type,[type]:type==='divider'?{}:{rich_text:[rich(content,url)]}});
const label=b=>(b?.[b.type]?.rich_text||[]).map(x=>x.plain_text??x.text?.content??'').join('');
const head=b=>b?.type==='heading_2'&&/^YOS JOURNAL｜\d{4}\.\d{2}\.\d{2}(?:\s|$)/u.test(label(b));
export function reviewFingerprint(candidate,dossier,selectedReceipts){
 return sha({candidate,dossier,selectedReceipts});
}
export function preparePrivateReading({candidate,dossier,privateDrafts,selectedReceipts,approval,now=new Date()}){
 if(!Array.isArray(selectedReceipts)||!selectedReceipts.length||
    approval?.privateOnly!==true||approval.semanticReviewCompleted!==true||
    approval.rightsReviewCompleted!==true||approval.decision!=='approve_private_reading'||
    approval.fingerprint!==reviewFingerprint(candidate,dossier,selectedReceipts))
   stop('EXACT_EDITOR_APPROVAL_REQUIRED');
 // Existing provenance and schema gates still run. A matching DOI is not enough.
 auditProvenance(privateDrafts,candidate,dossier,{now,selectedReceipts});
 if(dossier.articleAssessment?.status!=='reviewed_with_limitations'||
    dossier.articleAssessment.publishDecision!=='requires_editor_approval')
   stop('REVIEW_HOLD');
 const {issue,verification}=candidate;
 if(issue.articles.length!==3)stop('THREE_ARTICLES_REQUIRED');
 const dates=issue.issuedOn.split('-');
 const rows=[block('heading_2','YOS JOURNAL｜'+dates.join('.')),
    block('paragraph',issue.headline),block('paragraph',issue.lead),block('paragraph',MARK)];
 const links=new Set();
 for(const [i,a] of issue.articles.entries()){
   const url=canonical(a.link);
   if(links.has(url))stop('DUPLICATE_DOI');
   links.add(url);
   const source=dossier.sources.find(x=>canonical(x.url)===url);
   if(!source||!['publisher_full_text','official_primary_document'].includes(source.originalAccess)||
      verification[i].checkedOn!==dossier.reviewedOn)stop('ORIGINAL_FULL_TEXT_REQUIRED');
   for(const id of verification[i].reviewClaimIds){
      const claim=dossier.claims.find(c=>c.id===id);
      if(!claim||claim.sourceId!==source.id||claim.status!=='supported_in_study')stop('UNSUPPORTED_CLAIM');
   }
   if(!/^[A-Z]+$/u.test(a.category))stop('CATEGORY_INVALID');
   if(a.image||a.imageCaption||a.imageKind)stop('IMAGE_RIGHTS_NOT_SUPPORTED');
   rows.push(block('divider'),block('heading_3','0'+(i+1)+' / '+a.category+'｜'+a.title),
      block('paragraph',a.summary),block('paragraph',a.reason),block('paragraph','日常への視点：'+a.action),
      block('paragraph','研究の限界：'+a.caveat),block('paragraph','原著論文｜'+a.source,url));
 }
 rows.push(block('divider'));
 // Round-trip the actual production reader contract before any write.
 const edition=parseReviewedEdition(rows);
 return {rows,edition,publicationAllowed:false};
}
function editionsFromHistory(blocks){
 if(!Array.isArray(blocks)||blocks.length>500)stop('READER_CAPACITY');
 const starts=blocks.map((b,i)=>head(b)?i:-1).filter(i=>i>=0);
 const editions=starts.map((start,i)=>parseReviewedEdition(blocks.slice(start,starts[i+1]??blocks.length)));
 const dates=new Set();
 for(const e of editions){if(dates.has(e.issuedOn))stop('AMBIGUOUS_HISTORY');dates.add(e.issuedOn);}
 return editions;
}
async function readHistory(fetcher,token){
 let blocks=[],cursor='';
 for(let p=0;p<5;p++){
  const res=await fetcher(PATH+'?page_size=100'+(cursor?'&start_cursor='+encodeURIComponent(cursor):''),{
    method:'GET',headers:{Authorization:'Bearer '+token,'Notion-Version':'2025-09-03'},
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!res.ok)stop('READ_FAILED');
  const data=await res.json();
  if(!Array.isArray(data.results)||typeof data.has_more!=='boolean')stop('READ_INVALID');
  blocks.push(...data.results);
  if(!data.has_more)return blocks;
  if(typeof data.next_cursor!=='string'||!data.next_cursor||data.next_cursor===cursor)stop('READ_CURSOR_INVALID');
  cursor=data.next_cursor;
 }
 stop('READER_CAPACITY');
}
function findIdentical(editions,edition){
 const same=editions.filter(e=>e.issuedOn===edition.issuedOn);
 if(!same.length)return false;
 if(same.length===1&&JSON.stringify(same[0])===JSON.stringify(edition))return true;
 stop('DATE_COLLISION');
}
function duplicates(editions,edition){
 const previous=new Set(editions.flatMap(e=>e.articles.map(a=>canonical(a.link))));
 if(edition.articles.some(a=>previous.has(canonical(a.link))))stop('ALREADY_REVIEWED_SOURCE');
}
/**
 * Explicit single-writer invocation only. Notion does not offer compare-and-swap
 * for child appends. Caller must serialize review invocations through the existing
 * reviewer; an ambiguous response never causes an automatic retry. A later
 * authorized retry first reads the page and recognizes the exact edition.
 */
export async function appendPrivateReviewedReading({candidate,dossier,selectedReceipts,approval,token,fetcher=fetch,now=new Date(),singleWriterConfirmed=false}){
 if(singleWriterConfirmed!==true||typeof token!=='string'||token.length<10)stop('TRUSTED_WRITER_REQUIRED');
 const privateDrafts=await readPrivateInbox({token,fetcher});
 const prepared=preparePrivateReading({candidate,dossier,privateDrafts,selectedReceipts,approval,now});
 const before=await readHistory(fetcher,token),history=editionsFromHistory(before);
 if(findIdentical(history,prepared.edition))return {status:'already_verified',issuedOn:prepared.edition.issuedOn,publicationAllowed:false};
 duplicates(history,prepared.edition);
 if(before.length+prepared.rows.length>500)stop('READER_CAPACITY');
 // Recheck the original history immediately before the one append.
 const current=await readHistory(fetcher,token);
 if(JSON.stringify(current)!==JSON.stringify(before))stop('HISTORY_CHANGED');
 try{
  const response=await fetcher(PATH,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Notion-Version':'2025-09-03','Content-Type':'application/json'},
    body:JSON.stringify({children:prepared.rows}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)stop('APPEND_OUTCOME_UNCONFIRMED');
 }catch(_){stop('APPEND_OUTCOME_UNCONFIRMED_RECONCILE_BEFORE_RETRY')}
 const after=await readHistory(fetcher,token);
 if(!findIdentical(editionsFromHistory(after),prepared.edition))stop('READBACK_UNCONFIRMED');
 // Confirm old article contents still exist, not merely the new date.
 const afterEditions=editionsFromHistory(after);
 for(const e of history)if(!findIdentical(afterEditions,e))stop('PRIOR_EDITION_READBACK_FAILED');
 return {status:'saved_and_verified_private',issuedOn:prepared.edition.issuedOn,publicationAllowed:false};
}
