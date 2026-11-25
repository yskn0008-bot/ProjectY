import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildReviewBundle} from '../build-reviewed-release-bundle.mjs';
const now=new Date('2026-11-20T00:57:00Z');
const candidate=JSON.parse(await readFile(new URL('../editorial-candidates/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const dossier=JSON.parse(await readFile(new URL('../reviewed-evidence/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const clone=o=>structuredClone(o);
async function fixture(fn){
 const tmp=await mkdtemp(join(tmpdir(),'yos-release-bundle-'));
 const repo=join(tmp,'repo'),out=join(tmp,'review-output');
 await mkdir(join(repo,'journal','editions'),{recursive:true});
 await mkdir(join(repo,'ios-app','scriptable','journal'),{recursive:true});
 const latest=join(repo,'ios-app','scriptable','journal','latest.json');
 const old='{"issuedOn":"2026-11-19","headline":"PREVIOUS PRESERVED","articles":[]}';
 await writeFile(latest,old);
 try{await fn(repo,out,latest,old);}finally{await rm(tmp,{recursive:true,force:true});}
}
test('emits three review-only dated files in a separate output folder, never touching main checkout',async()=>fixture(async(repo,out,latest,original)=>{
 const x=await buildReviewBundle(clone(candidate),clone(dossier),repo,out,{now});
 assert.equal(x.status,'REVIEW_ONLY_NOT_PUBLISHED');
 assert.equal(x.candidateCount,1);
 assert.equal(x.independentReviewStatus,'hold');
 assert.equal(x.requiresExplicitEditorialApproval,true);
 assert.equal(x.fullArticleSemanticVerificationNotGuaranteed,true);
 assert.equal(x.privateNotionInputIncluded,false);
 assert.equal(x.files.length,3);
 assert.deepEqual(await readdir(join(repo,'journal','editions')),[]);
 assert.equal(await readFile(latest,'utf8'),original);
 const data=await Promise.all(x.files.map(p=>readFile(join(out,p),'utf8')));
 assert.equal(new Set(data).size,1);
 const issue=JSON.parse(data[0]);
 assert.equal(issue.issuedOn,'2026-11-20');
 assert.equal(issue.articles.length,1);
 assert.ok(issue.articles[0].title.includes('301人と307人'));
 assert.ok(!data[0].includes('YOS_EDITORIAL_DRAFT_V1'));
 assert.ok(!data[0].includes('Notion'));
 const notice=JSON.parse(await readFile(join(out,'RELEASE_NOT_APPROVED.json'),'utf8'));
 assert.equal(notice.requiresPublicationMerge,true);
}));
test('refuses output inside checkout, stale date and already published editions',async()=>fixture(async(repo,out,latest,original)=>{
 await assert.rejects(buildReviewBundle(clone(candidate),clone(dossier),repo,join(repo,'tmp'),{now}),/outside checkout/);
 await assert.rejects(buildReviewBundle(clone(candidate),clone(dossier),repo,out,{now:new Date('2026-11-21T01:00:00Z')}),/date|stale|today|different|invalid/i);
 const present=join(repo,'journal','editions','2026-11-20.json');
 await writeFile(present,'{"existing":true}');
 await assert.rejects(buildReviewBundle(clone(candidate),clone(dossier),repo,out,{now}),/already exists/);
 assert.equal(await readFile(present,'utf8'),'{"existing":true}');
 assert.equal(await readFile(latest,'utf8'),original);
}));
