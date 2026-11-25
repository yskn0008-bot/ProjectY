import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {digest} from '../notion-private-draft-readback.mjs';
import {preparePrivateReading,appendPrivateReviewedReading,reviewFingerprint} from '../private-reviewed-reading.mjs';
import {parseReviewedEdition} from '../../server/yos-ai/src/routes/journal-reader.mjs';

const NOW=new Date('2026-11-25T00:00:00Z');
const SAMPLE=JSON.parse(await readFile(new URL('../editorial-candidates/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const DOSSIER=JSON.parse(await readFile(new URL('../reviewed-evidence/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const B=(type,t,url)=>({object:'block',type,[type]:type==='divider'?{}:{rich_text:[{type:'text',text:{content:t,...(url?{link:{url}}:{})}}]}});
function fixture(){
 const c=structuredClone(SAMPLE),d=structuredClone(DOSSIER);
 const links=[1,2,3].map(n=>'https://doi.org/10.1234/fixture-'+n);
 c.issue.issuedOn='2026-11-25';c.issue.date='2026.11.25 WED';
 c.issue.articles=links.map((link,i)=>({...c.issue.articles[0],category:'SCIENCE',link,
   title:'合成テスト専用の記事'+(i+1)+'：原典を確認する条件',
   summary:'これは実在する研究ではない合成テスト専用の内容です。テストケース'+(i+1)+'における資料と記事の紐付けの確認だけを目的とします。'}));
 c.verification=c.issue.articles.map((a,i)=>({...c.verification[0],link:a.link,checkedOn:'2026-11-25',reviewClaimIds:['C'+(i+1)]}));
 d.reviewedOn='2026-11-25';
 d.sources=links.map((url,i)=>({...d.sources[0],id:'S'+(i+1),url,originalAccess:'publisher_full_text'}));
 d.claims=links.map((_,i)=>({...d.claims[0],id:'C'+(i+1),sourceId:'S'+(i+1),status:'supported_in_study'}));
 d.articleAssessment={...d.articleAssessment,status:'reviewed_with_limitations',publishDecision:'requires_editor_approval'};
 const raw=['【YOS_EDITORIAL_DRAFT_V1】','【資料と照合状況】',...links,'公開不可・要審査','合成原稿の保存試験'.repeat(30)].join('\n');
 const receipt='[YOS_JOURNAL_DRAFT_V1:'+digest(raw)+':'+raw.length+']';
 const draft={receipt,chars:raw.length,content:raw,state:'private_unverified_never_publish'};
 const input={candidate:c,dossier:d,privateDrafts:[draft],selectedReceipts:[receipt],now:NOW};
 const approve=()=>({...input,approval:{privateOnly:true,semanticReviewCompleted:true,rightsReviewCompleted:true,decision:'approve_private_reading',
  fingerprint:reviewFingerprint(input.candidate,input.dossier,input.selectedReceipts)}});
 return {input,approve,raw,receipt};
}
function older(link='https://doi.org/10.1234/old1'){
 const rows=[B('heading_2','YOS JOURNAL｜2026.11.24 TUE'),B('paragraph','以前の見出し'),B('paragraph','以前の導入'),
  B('paragraph','本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。')];
 for(let n=1;n<=3;n++)rows.push(B('divider'),B('heading_3','0'+n+' / CULTURE｜以前の記事'),B('paragraph','概要'),B('paragraph','本文'),
  B('paragraph','日常への視点：行動'),B('paragraph','研究の限界：限界'),B('paragraph','原著論文',n===1?link:'https://doi.org/10.1234/old'+n));
 rows.push(B('divider'),B('paragraph','unrelated private content'));
 return rows;
}
function mock(f,{history=older(),failAppend=false,ambiguous=false}={}){
 let writes=0,reads=0;const calls=[];
 const fetcher=async(url,init)=>{
  calls.push([url,init.method]);
  assert.equal(init.headers.Authorization,'Bearer mock-private-token');
  if(url.includes('3d35ca88-2895-81ef-9dc8-d5f11ff8e213')){
   assert.equal(init.method,'GET');
   return {ok:true,json:async()=>({results:[B('paragraph',f.receipt),B('paragraph','JOURNAL下書き・未検証・公開禁止'),B('paragraph',f.raw)],has_more:false})};
  }
  assert.ok(url.startsWith('https://api.notion.com/v1/blocks/4215ca88-2895-816f-bdd3-c48c6cf700ae/children'));
  if(init.method==='PATCH'){
   writes++;
   if(failAppend)throw Error('network timeout');
   history.push(...JSON.parse(init.body).children);
   if(ambiguous)throw Error('write succeeded but response lost');
   return {ok:true};
  }
  reads++;return {ok:true,json:async()=>({results:structuredClone(history),has_more:false})};
 };
 const run=overrides=>appendPrivateReviewedReading({...f.approve(),singleWriterConfirmed:true,token:'mock-private-token',fetcher,...overrides});
 return {run,calls,writes:()=>writes,reads:()=>reads,history:()=>history};
}
test('approved exact candidate round-trips through existing private reader without raw content',()=>{
 const f=fixture(),p=preparePrivateReading(f.approve());
 assert.equal(p.edition.articles.length,3);
 assert.equal(p.edition.issuedOn,'2026-11-25');
 assert.equal(p.publicationAllowed,false);
 assert.deepEqual(parseReviewedEdition(p.rows),p.edition);
 assert.ok(!JSON.stringify(p.rows).includes('合成原稿の保存試験'));
});
test('holds unapproved, changed, abstract-only, wrong-claim and review-hold candidates',()=>{
 const f=fixture();
 assert.throws(()=>preparePrivateReading(f.input),/EXACT_EDITOR_APPROVAL_REQUIRED/);
 const a=f.approve();a.candidate.issue.headline+=' altered';
 assert.throws(()=>preparePrivateReading(a),/EXACT_EDITOR_APPROVAL_REQUIRED/);
 const b=fixture();b.input.dossier.sources[0].originalAccess='publisher_abstract';
 assert.throws(()=>preparePrivateReading(b.approve()),/ORIGINAL_FULL_TEXT_REQUIRED/);
 const c=fixture();c.input.candidate.verification[0].reviewClaimIds=['C2'];
 assert.throws(()=>preparePrivateReading(c.approve()),/UNSUPPORTED_CLAIM/);
 const d=fixture();d.input.dossier.articleAssessment.publishDecision='hold';
 assert.throws(()=>preparePrivateReading(d.approve()),/REVIEW_HOLD/);
});
test('private append and readback, retry no duplicate, previous edition retained',async()=>{
 const f=fixture(),m=mock(f);
 assert.equal((await m.run()).status,'saved_and_verified_private');
 assert.equal(m.writes(),1);
 assert.equal((await m.run()).status,'already_verified');
 assert.equal(m.writes(),1);
 assert.equal(parseReviewedEdition(m.history()).issuedOn,'2026-11-25');
 assert.ok(m.history().some(b=>b.paragraph?.rich_text?.[0]?.text?.content==='以前の見出し'));
});
test('duplicate prior DOI and unconfirmed writer stop with zero writes',async()=>{
 const f=fixture(),m=mock(f,{history:older(f.input.candidate.issue.articles[0].link)});
 await assert.rejects(m.run(),/ALREADY_REVIEWED_SOURCE/);
 await assert.rejects(m.run({singleWriterConfirmed:false}),/TRUSTED_WRITER_REQUIRED/);
 assert.equal(m.writes(),0);
});
test('ambiguous response does not auto retry; later authorized readback reconciles',async()=>{
 const f=fixture(),m=mock(f,{ambiguous:true});
 await assert.rejects(m.run(),/APPEND_OUTCOME_UNCONFIRMED_RECONCILE_BEFORE_RETRY/);
 assert.equal(m.writes(),1);
 assert.equal((await m.run()).status,'already_verified');
 assert.equal(m.writes(),1);
});
