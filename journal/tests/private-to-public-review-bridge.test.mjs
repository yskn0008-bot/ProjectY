import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditProvenance,checkLiveDraftProvenance} from '../private-to-public-review-bridge.mjs';
import {digest} from '../notion-private-draft-readback.mjs';
const publicCandidate=JSON.parse(await readFile(new URL('../editorial-candidates/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const dossier=JSON.parse(await readFile(new URL('../reviewed-evidence/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const NOW=new Date('2026-11-20T00:50:00Z');
const SOURCE="https://doi.org/10.1177/03010066241284956";
const makeText=()=>[
 "## 【YOS_EDITORIAL_DRAFT_V1】",
 "### 【記事見出し】",
 "第一印象はほんとうに操作できるのか？――揺れる魅力と心の自由",
 "### 【資料と照合状況】",
 "- "+SOURCE,
 "- https://doi.org/10.1038/s41598-017-00526-9",
 "### 【公開不可・要審査】"
].join('\n').padEnd(350,'学');
const d=()=>({receipt:'[YOS_JOURNAL_DRAFT_V1:'+digest(makeText())+':'+makeText().length+']',chars:makeText().length,content:makeText(),state:'private_unverified_never_publish'});
const par=t=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:t},plain_text:t}]}});
test('matches original SAGE DOI in private draft to source-approved public candidate',()=>{
 const result=auditProvenance([d()],structuredClone(publicCandidate),structuredClone(dossier),{now:NOW});
 assert.equal(result.matchedPrivateDraftCount,1);
 assert.equal(result.confirmedPublicSourceCount,1);
 assert.equal(result.reviewedClaimCount,3);
 assert.equal(result.sourceBodyReused,false);
 assert.equal(result.canPublishAutomatically,false);
 assert.equal(result.semanticClaimReviewRequired,true);
 assert.equal(result.legalAndEditorialApprovalRequired,true);
 const data=JSON.stringify(result);
 assert.ok(!data.includes('第一印象はほんとうに'));
 assert.ok(!data.includes('SAGE'));
});
test('refuses missing, mismatched, duplicate or unreviewed private sources',()=>{
 const c=structuredClone(publicCandidate),e=structuredClone(dossier);
 assert.throws(()=>auditProvenance([] ,c,e,{now:NOW}),/NO_PRIVATE_DRAFT/);
 assert.throws(()=>auditProvenance([{...d(),content:'irrelevant'}],c,e,{now:NOW}),/SOURCE_PROVENANCE_AMBIGUOUS/);
 assert.throws(()=>auditProvenance([d(),d()],c,e,{now:NOW}),/SOURCE_PROVENANCE_AMBIGUOUS/);
 const x=structuredClone(c);x.issue.articles[0].link='https://www.nature.com/articles/s41598-017-00526-9';
 x.verification[0].link=x.issue.articles[0].link;
 assert.throws(()=>auditProvenance([d()],x,e,{now:NOW}),/NON_DOI_PUBLISH_SOURCE/);
});
test('refuses private draft not holding the explicit privacy state flag',()=>{
 assert.throws(()=>auditProvenance([{...d(),state:'public_ready'}],structuredClone(publicCandidate),structuredClone(dossier),{now:NOW}),/SOURCE_PROVENANCE_AMBIGUOUS/);
});
test('uses existing Notion Inbox read-only transport without serializing private article body',async()=>{
 const content=makeText(),parts=[par('[YOS_JOURNAL_DRAFT_V1:'+digest(content)+':'+content.length+']'),par('JOURNAL下書き・未検証・公開禁止'),par(content)];
 const visits=[];
 const result=await checkLiveDraftProvenance({token:'mock-notion-auth-secret',candidate:structuredClone(publicCandidate),dossier:structuredClone(dossier),now:NOW,fetcher:async(url,init)=>{
  visits.push({url,method:init.method});
  return {ok:true,json:async()=>({results:parts,has_more:false,next_cursor:null})};
 }});
 assert.equal(visits.length,1);
 assert.equal(visits[0].method,'GET');
 assert.equal(result.canPublishAutomatically,false);
 assert.equal(result.sourceBodyReused,false);
 assert.ok(!JSON.stringify(result).includes('第一印象はほんとうに'));
});
