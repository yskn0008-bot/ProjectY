import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {previewReviewedCandidate} from '../preview-reviewed-candidate.mjs';

const NOW=new Date('2026-11-20T01:20:00Z');
const candidate=JSON.parse(await readFile(new URL('../editorial-candidates/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const dossier=JSON.parse(await readFile(new URL('../reviewed-evidence/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const clone=o=>structuredClone(o);

async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'yos-journal-review-'));
 const dated=join(root,'journal','editions'),reader=join(root,'ios-app','scriptable','journal');
 await mkdir(dated,{recursive:true});await mkdir(reader,{recursive:true});
 await writeFile(join(reader,'latest.json'),JSON.stringify({issuedOn:'2026-11-19',articles:[]}));
 try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}
}
test('one source-aligned feature previews existing 3 issue file paths WITHOUT writing',async()=>fixture(async root=>{
 const result=await previewReviewedCandidate(clone(candidate),clone(dossier),root,{now:NOW});
 assert.equal(result.publicationAllowed,false);
 assert.equal(result.stage,'editorial_preview_only');
 assert.equal(result.independentReviewStatus,'hold');
 assert.equal(result.articles.length,1);
 assert.equal(result.sourceReviewedClaims,3);
 assert.equal(result.notSupportedClaims,2);
 assert.equal(result.plannedIssuePaths.length,3);
 assert.ok(result.plannedIssuePaths[0].endsWith('/2026-11-20.json'));
 assert.deepEqual(await readdir(join(root,'journal','editions')),[]);
 assert.deepEqual((await readdir(join(root,'ios-app','scriptable','journal'))).sort(),['latest.json']);
}));
test('unreviewed source and unverifiable review date fail closed',async()=>fixture(async root=>{
 const c=clone(candidate);
 c.issue.articles[0].link='https://www.pref.okinawa.lg.jp/kurashikankyo/';
 c.verification[0].link=c.issue.articles[0].link;
 await assert.rejects(()=>previewReviewedCandidate(c,clone(dossier),root,{now:NOW}),/missing from independent review/);
 const c2=clone(candidate);c2.verification[0].checkedOn='2026-11-19';
 await assert.rejects(()=>previewReviewedCandidate(c2,clone(dossier),root,{now:NOW}),/date mismatch/);
}));
test('unsupported or unreviewed claim references are rejected regardless of URL match',async()=>fixture(async root=>{
 const a=clone(candidate);
 a.verification[0].reviewClaimIds=['C1','C4'];
 await assert.rejects(()=>previewReviewedCandidate(a,clone(dossier),root,{now:NOW}),/unsupported, unreviewed/);
 const b=clone(candidate);
 b.verification[0].reviewClaimIds=['C99'];
 await assert.rejects(()=>previewReviewedCandidate(b,clone(dossier),root,{now:NOW}),/unsupported, unreviewed/);
 const c=clone(candidate);
 delete c.verification[0].reviewClaimIds;
 await assert.rejects(()=>previewReviewedCandidate(c,clone(dossier),root,{now:NOW}),/missing independent reviewed claim IDs/);
}));
test('does not implicitly publish even when reviewer status changes to requires approval',async()=>fixture(async root=>{
 const d=clone(dossier);d.articleAssessment.publishDecision='requires_editor_approval';
 const r=await previewReviewedCandidate(clone(candidate),d,root,{now:NOW});
 assert.equal(r.publicationAllowed,false);
 assert.equal(r.independentReviewStatus,'editor_approval_and_publication_gate_required');
}));
test('rejects existing dated issue and protects already published data',async()=>fixture(async root=>{
 const existing=join(root,'journal','editions','2026-11-20.json');
 await writeFile(existing,'{"original":"DO NOT OVERWRITE"}');
 await assert.rejects(()=>previewReviewedCandidate(clone(candidate),clone(dossier),root,{now:NOW}),/already exists/);
 assert.equal(await readFile(existing,'utf8'),'{"original":"DO NOT OVERWRITE"}');
}));
test('private-person identifier fails before any candidate file writing',async()=>fixture(async root=>{
 const c=clone(candidate);
 c.issue.articles[0].reason='陽介に向けた個人情報も盛り込むために選んだ。';
 await assert.rejects(()=>previewReviewedCandidate(c,clone(dossier),root,{now:NOW}),/private/);
 assert.deepEqual(await readdir(join(root,'journal','editions')),[]);
}));
