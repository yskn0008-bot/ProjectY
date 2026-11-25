import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest} from '../notion-private-draft-readback.mjs';
import {checkLiveDraftProvenance} from '../private-to-public-review-bridge.mjs';
import {previewReviewedCandidate} from '../preview-reviewed-candidate.mjs';
import {buildOfflineReaderPreview} from '../build-offline-reader-preview.mjs';

const NOW=new Date('2026-11-20T00:53:00Z');
const CANDIDATE=JSON.parse(await readFile(new URL('../editorial-candidates/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const DOSSIER=JSON.parse(await readFile(new URL('../reviewed-evidence/2026-11-20-first-impressions.public.json',import.meta.url),'utf8'));
const HTML=await readFile(new URL('../../journal-v2/index.html',import.meta.url),'utf8');
const block=t=>({type:'paragraph',paragraph:{rich_text:[{plain_text:t}]}});
const draftText=[
  '## 【YOS_EDITORIAL_DRAFT_V1】',
  '### 【記事見出し】',
  '第一印象の操作について—取材メモ（非公開）',
  '### 【資料と照合状況】',
  '- https://doi.org/10.1177/03010066241284956',
  '- https://doi.org/10.1038/s41598-017-00526-9',
  '### 【公開不可・要審査】',
  'これは下書きです。前提に含まれる個人的な情報を公開してはいけません。'
].join('\n').padEnd(360,'学');
function fakeNotion(){
 return [
  block('unrelated private capture'),
  block('[YOS_JOURNAL_DRAFT_V1:'+digest(draftText)+':'+draftText.length+']'),
  block('JOURNAL下書き・未検証・公開禁止'),
  ...Array.from({length:Math.ceil(draftText.length/1400)},(_,i)=>block(draftText.slice(i*1400,(i+1)*1400)))
 ];
}
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'yos-private-review-e2e-'));
 await mkdir(join(root,'journal','editions'),{recursive:true});
 await mkdir(join(root,'ios-app','scriptable','journal'),{recursive:true});
 const latest=join(root,'ios-app','scriptable','journal','latest.json');
 const original='{"issuedOn":"2026-11-19","headline":"Preserved prior issue","articles":[]}';
 await writeFile(latest,original);
 try{await fn(root,latest,original);}finally{await rm(root,{recursive:true,force:true});}
}
test('private Notion receipt -> independent claim check -> existing issue preview -> original magazine HTML, no writes',async()=>fixture(async(root,latest,original)=>{
 let requests=0;
 const provenance=await checkLiveDraftProvenance({
   token:'mock-existing-notion-secret',now:NOW,
   candidate:structuredClone(CANDIDATE),dossier:structuredClone(DOSSIER),
   fetcher:async(url,init)=>{
     requests++;
     assert.equal(init.method,'GET');
     assert.ok(url.includes('/v1/blocks/3d35ca88-2895-81ef-9dc8-d5f11ff8e213/children'));
     return {ok:true,json:async()=>({results:fakeNotion(),has_more:false,next_cursor:null})};
   }
 });
 assert.equal(requests,1);
 assert.equal(provenance.canPublishAutomatically,false);
 assert.equal(provenance.sourceBodyReused,false);
 const prepared=await previewReviewedCandidate(structuredClone(CANDIDATE),structuredClone(DOSSIER),root,{now:NOW});
 assert.equal(prepared.publicationAllowed,false);
 assert.equal(prepared.articles.length,1);
 const html=buildOfflineReaderPreview(HTML,structuredClone(CANDIDATE));
 assert.ok(html.includes('非公開の編集プレビュー'));
 assert.ok(html.includes('301人と307人の実験'));
 assert.ok(html.includes('journals.sagepub.com/doi/10.1177/03010066241284956'));
 assert.ok(!html.includes('これは下書きです'));
 assert.ok(!html.includes('mock-existing-notion-secret'));
 assert.deepEqual(await readdir(join(root,'journal','editions')),[]);
 assert.equal(await readFile(latest,'utf8'),original);
}));
test('private Notion receipt source mismatch safely stops before public preview',async()=>{
 const wrong=fakeNotion();
 const sourcePos=wrong.findIndex(x=>x.paragraph?.rich_text?.[0]?.plain_text?.includes('YOS_EDITORIAL_DRAFT_V1'));
 assert.ok(sourcePos>=0);
 const denied=structuredClone(CANDIDATE);
 denied.issue.articles[0].link='https://www.nature.com/articles/s41598-017-00526-9';
 denied.verification[0].link=denied.issue.articles[0].link;
 await assert.rejects(
   checkLiveDraftProvenance({token:'mock-existing-notion-secret',now:NOW,candidate:denied,dossier:structuredClone(DOSSIER),
     fetcher:async()=>({ok:true,json:async()=>({results:wrong,has_more:false,next_cursor:null})})}),
   /NON_DOI_PUBLISH_SOURCE/
 );
});
