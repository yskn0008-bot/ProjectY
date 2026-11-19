import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateIndependentDossier} from '../reviewed-evidence-gate.mjs';
const original=JSON.parse(await readFile(new URL('../reviewed-evidence/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(original);
test('original-publisher review dossier distinguishes support from rejected extrapolations',()=>{
 const d=validateIndependentDossier(copy());
 assert.equal(d.sources,2);
 assert.equal(d.claims.supported,3);
 assert.equal(d.claims.unsupported,2);
 assert.equal(d.canPublishAutomatically,false);
 assert.equal(d.disposition,'hold');
});
test('review status remains manual even if someone changes hold to requires approval',()=>{
 const d=copy();d.articleAssessment.publishDecision='requires_editor_approval';
 const result=validateIndependentDossier(d);
 assert.equal(result.disposition,'editor_approval_and_publication_gate_required');
 assert.equal(result.canPublishAutomatically,false);
});
test('rejects fake publication approval and unsupported source methods',()=>{
 const d=copy();d.articleAssessment.publishDecision='published';
 assert.throws(()=>validateIndependentDossier(d),/Invalid publish/);
 const q=copy();q.reviewerMethod='A model said the study was probably true';
 assert.throws(()=>validateIndependentDossier(q),/Independent original-source/);
 const z=copy();z.sources[0].originalAccess='AI hallucination';
 assert.throws(()=>validateIndependentDossier(z),/Original source/);
});
test('rejects claims that omit a known source, limitations, or status',()=>{
 const d=copy();d.claims[0].sourceId='S9';assert.throws(()=>validateIndependentDossier(d),/Orphan/);
 const e=copy();e.claims[0].limitations='none';assert.throws(()=>validateIndependentDossier(e),/limitations/);
 const f=copy();f.claims[0].status='verified';assert.throws(()=>validateIndependentDossier(f),/Unknown claim/);
});
test('rejects unsafe source URLs, duplicates and private information',()=>{
 const d=copy();d.sources[0].url='http://127.0.0.1/private';
 assert.throws(()=>validateIndependentDossier(d),/Unsafe|Invalid/);
 const e=copy();e.sources.push({...e.sources[0]});
 assert.throws(()=>validateIndependentDossier(e),/Duplicate/);
 const f=copy();f.topic+=' 口座番号 12345678';
 assert.throws(()=>validateIndependentDossier(f),/Private/);
});
test('require explicit public-only scope and constrained schema',()=>{
 const d=copy();d.publicOnly=false;
 assert.throws(()=>validateIndependentDossier(d),/Not a public/);
 const x=copy();x.extra='secret data';
 assert.throws(()=>validateIndependentDossier(x),/Unexpected/);
});
