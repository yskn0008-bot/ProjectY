/**
 * YOS JOURNAL: private Notion draft -> separately written public-safe editorial
 * candidate provenance check. This is a REVIEW ONLY boundary. No private
 * article prose is copied into the public candidate or CI logs; a shared DOI
 * is not independent fact-checking or permission to publish.
 */
import {readPrivateInbox} from './notion-private-draft-readback.mjs';
import {validateCandidate} from './gpt-editorial-gate.mjs';
import {validateIndependentDossier} from './reviewed-evidence-gate.mjs';

const STOP='JOURNAL_PRIVATE_PUBLIC_BRIDGE_HOLD';
function refuse(message){throw Error(STOP+':'+message);}
function doiFor(url){
 try{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password)refuse('BAD_SOURCE');
  if(u.hostname==='doi.org'||u.hostname==='www.doi.org'){
    const v=decodeURIComponent(u.pathname.slice(1)).trim().toLowerCase();
    if(/^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i.test(v))return v;
  }
  if(u.hostname==='journals.sagepub.com'||u.hostname==='doi.org'){
    const match=u.pathname.match(/^\/doi\/(10\.\d{4,9}\/[A-Za-z0-9._;()/:-]+)\/?$/);
    if(match)return match[1].toLowerCase();
  }
  return null;
 }catch{return null;}
}
function claimedDois(text){
 const matches=String(text).match(/10\.\d{4,9}\/[-._;()/:a-z0-9]+/gi)||[];
 const set=new Set();
 for(const m of matches){
  const cleaned=m.replace(/[.,;:)]+$/g,'').toLowerCase();
  if(/^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i.test(cleaned))set.add(cleaned);
 }
 return set;
}
export function auditProvenance(privateDrafts,publicCandidate,independentDossier,{now=new Date(),selectedReceipts}={}){
 validateCandidate(publicCandidate,{now});
 const review=validateIndependentDossier(independentDossier);
 if(!Array.isArray(privateDrafts)||!privateDrafts.length)refuse('NO_PRIVATE_DRAFT');
 const claimed=new Set();
 for(const a of publicCandidate.issue.articles){
   const doi=doiFor(a.link);
   if(!doi)refuse('NON_DOI_PUBLISH_SOURCE');
   if(claimed.has(doi))refuse('REPEATED_PUBLIC_SOURCE');
   claimed.add(doi);
   const src=independentDossier.sources.find(x=>doiFor(x.url)===doi||x.url===a.link);
   if(!src||src.status!=='examined')refuse('NO_INDEPENDENT_SOURCE');
 }
 // Explicit receipt selection is private runtime input, never a public candidate field.
 let eligible=privateDrafts;
 if(selectedReceipts!==undefined){
   if(!Array.isArray(selectedReceipts)||selectedReceipts.length<1||selectedReceipts.length>3||
      new Set(selectedReceipts).size!==selectedReceipts.length||
      selectedReceipts.some(id=>typeof id!=='string'||id.length<8||id.length>140))
     refuse('INVALID_RECEIPT_SELECTION');
   eligible=selectedReceipts.map(id=>{
     const matches=privateDrafts.filter(d=>d?.receipt===id);
     if(matches.length!==1)refuse('RECEIPT_SELECTION_NOT_UNIQUE');
     return matches[0];
   });
 }
 const privateSources=eligible.filter(d=>{
   if(!d||d.state!=='private_unverified_never_publish'||typeof d.content!=='string')return false;
   const found=claimedDois(d.content);
   return [...claimed].some(id=>found.has(id));
 }).map(d=>({draft:d,dois:claimedDois(d.content)}));
 // One, two or three records may cover the issue. Each public source must
 // belong to exactly one of the selected records; ambiguity still fails closed.
 const uniqueCoverage=privateSources.length>=1&&privateSources.length<=claimed.size&&
   [...claimed].every(id=>privateSources.filter(x=>x.dois.has(id)).length===1)&&
   (selectedReceipts===undefined||privateSources.length===eligible.length);
 if(!uniqueCoverage)refuse('SOURCE_PROVENANCE_AMBIGUOUS');
 if(publicCandidate.verification.some(v=>!Array.isArray(v.reviewClaimIds)||!v.reviewClaimIds.length))
   refuse('REVIEW_CLAIM_IDS_MISSING');
 // Do not assume the candidate's full prose has been checked because it
 // overlaps with Notion's source bibliography. Always require separate gate.
 return {
   status:'private_draft_sources_match_independently_reviewed_public_candidate',
   matchedPrivateDraftCount:privateSources.length,
   confirmedPublicSourceCount:claimed.size,
   reviewedClaimCount:review.claims.supported,
   sourceBodyReused:false,
   semanticClaimReviewRequired:true,
   legalAndEditorialApprovalRequired:true,
   canPublishAutomatically:false
 };
}
export async function checkLiveDraftProvenance({token,fetcher=fetch,candidate,dossier,now=new Date(),selectedReceipts}={}){
 const drafts=await readPrivateInbox({token,fetcher});
 return auditProvenance(drafts,candidate,dossier,{now,selectedReceipts});
}
