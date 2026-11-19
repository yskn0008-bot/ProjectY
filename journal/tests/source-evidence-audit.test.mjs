import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safeSourceUrl, validateResearchPacket, extractReadableText,
  auditResearchPacket, downloadSource
} from '../source-evidence-audit.mjs';

const url='https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/';
const sentence='The measured skin colour was associated with higher perceived attractiveness in the selected photographic sample.';
const body='<html><body><h1>Simulated academic source</h1><p>' + sentence + '</p><p>This synthetic paragraph is provided for a deterministic offline security and evidence test, not as scientific evidence.</p></body></html>';
const packet=()=>({
  schemaVersion:1,publicOnly:true,topic:'顔の肌色に関する印象研究の検証候補',
  sources:[{id:'S1',url,sourceType:'primary'}],
  claims:[{id:'C1',text:'The measured skin colour was associated with higher perceived attractiveness in the selected photographic sample.',sourceId:'S1',evidenceQuote:sentence}]
});
const mock=(text=body, code=200, headers={'content-type':'text/html; charset=utf-8'})=>async()=>new Response(text,{status:code,headers});
const clock=()=>new Date('2026-11-19T12:00:00Z');

test('source hosts are tightly bounded; public links only',()=>{
  assert.equal(safeSourceUrl(url),url);
  for(const item of [
    'https://127.0.0.1/latest','https://169.254.169.254/latest',
    'https://pmc.ncbi.nlm.nih.gov.evil.org/','http://pmc.ncbi.nlm.nih.gov/',
    'https://pmc.ncbi.nlm.nih.gov/?secret=abc',
    'https://you:pass@pmc.ncbi.nlm.nih.gov/a',
    'https://github.com/yskn0008-bot/ProjectY'
  ]) assert.throws(()=>safeSourceUrl(item),/Invalid|Unsafe/);
});
test('rejects personal data and structurally invalid packets',()=>{
  const p=packet();p.topic='ようすけの健康状態を研究する';assert.throws(()=>validateResearchPacket(p),/Private/);
  const q=packet();q.sources.push({...q.sources[0]});assert.throws(()=>validateResearchPacket(q),/Duplicate/);
  const r=packet();r.claims[0].sourceId='S99';assert.throws(()=>validateResearchPacket(r),/unknown source/);
  const s=packet();s.privateDiary='raw diary';assert.throws(()=>validateResearchPacket(s),/Unexpected/);
});
test('exact quote is located but is NEVER marked independently fact-verified',async()=>{
  const result=await auditResearchPacket(packet(),{fetcher:mock(),clock});
  assert.equal(result.sources[0].status,'retrieved_not_fact_checked');
  assert.equal(result.claims[0].status,'evidence_located_review_required');
  assert.equal(result.checks.evidenceLocated,1);
  assert.equal(result.checks.verifiedClaims,0);
  assert.equal(result.publicationAllowed,false);
  assert.equal(result.semanticFactCheck,'NOT_PERFORMED');
  assert.match(result.handoffText,/公開一次資料の取材ノート/);
  assert.ok(!JSON.stringify(result).includes('synthetic paragraph'));
  assert.equal(result.sources[0].contentSha256.length,64);
});
test('evidence quote not found means no handoff evidence',async()=>{
  const p=packet();p.claims[0].evidenceQuote='This quote was not actually present in the referenced paper at all.';
  const result=await auditResearchPacket(p,{fetcher:mock(),clock});
  assert.equal(result.claims[0].status,'evidence_not_located');
  assert.equal(result.checks.evidenceLocated,0);
});
test('unsubstantiated numbers are blocked even if other words match',async()=>{
  const p=packet();p.claims[0].text=sentence+' The effect was 78 percent greater.';
  const result=await auditResearchPacket(p,{fetcher:mock(),clock});
  assert.equal(result.claims[0].status,'numerical_evidence_gap');
});
test('quotation embedded only inside script tags does not count',async()=>{
  const fake='<html><head><script>'+sentence+'</script></head><body>Real study body. No comparable finding was reported in this source. This static text is long enough for the test to pass the minimum text length requirement.</body></html>';
  const result=await auditResearchPacket(packet(),{fetcher:mock(fake),clock});
  assert.equal(result.claims[0].status,'evidence_not_located');
});
test('access challenge and unsupported PDF both fail closed',async()=>{
  const blocked=await auditResearchPacket(packet(),{fetcher:mock('<html><title>Checking your browser before accessing</title></html>'),clock});
  assert.equal(blocked.sources[0].status,'access_blocked');
  assert.equal(blocked.claims[0].status,'source_unavailable');
  const pdf=await auditResearchPacket(packet(),{fetcher:mock('%PDF-1.5',200,{'content-type':'application/pdf'}),clock});
  assert.equal(pdf.sources[0].status,'source_unavailable');
});
test('redirects to a different unknown host are refused before fetching',async()=>{
  let calls=0;
  const f=async()=>{calls++;return new Response('',{status:302,headers:{location:'http://127.0.0.1/latest'}});};
  await assert.rejects(()=>downloadSource(url,{fetcher:f}),/Unsafe/);
  assert.equal(calls,1);
});
test('HTTP error or truncated text prevents evidence acceptance',async()=>{
  const unavailable=await auditResearchPacket(packet(),{fetcher:mock('no',404),clock});
  assert.equal(unavailable.checks.evidenceLocated,0);
  const tooShort=await auditResearchPacket(packet(),{fetcher:mock('<html><p>short</p></html>'),clock});
  assert.equal(tooShort.claims[0].status,'source_unavailable');
});
test('HTML entities and tag splits normalize without accepting a substring in scripts',()=>{
  const text=extractReadableText('<html><body>A&nbsp;test <b>with</b> data &amp; methods.</body></html>','text/html');
  assert.equal(text,'A test with data & methods.');
});

test('Europe PMC OA full-text XML is accepted without granting broad access to unrelated EBI APIs',async()=>{
  const ep='https://www.ebi.ac.uk/europepmc/webservices/rest/PMC9626598/fullTextXML';
  assert.equal(safeSourceUrl(ep),ep);
  assert.throws(()=>safeSourceUrl('https://www.ebi.ac.uk/private/anything'),/Unsafe/);
  const p=packet();p.sources[0].url=ep;
  const xml='<article><front><title-group><article-title>Simulated source study</article-title></title-group></front><body><sec><p>'+sentence+'</p><p>Further synthetic context confirms that the sample is made up and is included only to exercise XML text extraction.</p></sec></body></article>';
  const result=await auditResearchPacket(p,{fetcher:mock(xml,200,{'content-type':'application/xml'}),clock});
  assert.equal(result.sources[0].status,'retrieved_not_fact_checked');
  assert.equal(result.claims[0].status,'evidence_located_review_required');
  assert.equal(result.checks.verifiedClaims,0);
});
