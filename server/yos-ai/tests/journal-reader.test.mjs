import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReviewedEdition,createJournalReader} from '../src/routes/journal-reader.mjs';
const b=(type,t,url)=>({type,[type]:{rich_text:[{plain_text:t,...(url?{href:url}:{})}]}});
const fixture=()=>{
 const rows=[b('heading_2','YOS JOURNAL｜2026.11.24 TUE'),b('paragraph','見出し'),b('paragraph','導入'),b('paragraph','本人用の非公開読書版。原著の主要箇所と照合済み。外部公開・配信は行っていない。')];
 for(let n=1;n<=3;n++)rows.push({type:'divider'},b('heading_3','0'+n+' / HEALTH｜記事'+n),b('paragraph','概要'),b('paragraph','本文'),b('paragraph','日常への視点：行動'),b('paragraph','研究の限界：限界'),b('paragraph','原著論文','https://doi.org/10.1234/test'+n));
 rows.push({type:'divider'},b('paragraph',' unrelated private task metadata '));return rows;
};
test('only three reviewed articles, no unrelated task metadata',()=>{
 const e=parseReviewedEdition(fixture());assert.equal(e.articles.length,3);assert.equal(e.issuedOn,'2026-11-24');assert.ok(!JSON.stringify(e).includes('unrelated'));
});
test('fails closed on missing marker, duplicate edition, unsafe link or truncated articles',()=>{
 for(const mutate of [x=>x.splice(3,1),x=>x.push(x[0]),x=>x[10].paragraph.rich_text[0].href='javascript:alert(1)',x=>x.splice(11,7),x=>x.pop()&&x.pop()]){
  const rows=fixture();mutate(rows);assert.throws(()=>parseReviewedEdition(rows));
 }
});
test('owner-only read; no Notion access before identity gate, no cache',async()=>{
 let calls=0;
 const origin='https://yskn0008-bot.github.io';
 const handler=createJournalReader({authorize:async t=>t==='test-valid-token-1234',notionToken:'mock-notion-token',origins:[origin],fetcher:async()=>{calls++;return Response.json({results:fixture(),has_more:false});}});
 const req=(o,t,method='GET')=>new Request('https://example.test',{method,headers:{origin:o,...(t?{authorization:'Bearer '+t}:{})}});
 assert.equal((await handler(req(origin))).status,401);
 assert.equal((await handler(req(origin,'not-valid-token-1234'))).status,401);
 assert.equal((await handler(req('https://other.test','test-valid-token-1234'))).status,403);
 assert.equal((await handler(req(origin,'test-valid-token-1234','POST'))).status,405);
 assert.equal(calls,0);
 const preflight=await handler(req(origin,null,'OPTIONS'));assert.equal(preflight.status,204);assert.equal(calls,0);
 const res=await handler(req(origin,'test-valid-token-1234'));assert.equal(res.status,200);assert.equal(calls,1);assert.equal(res.headers.get('Cache-Control'),'private, no-store');
 const data=await res.json();assert.equal(data.source,'notion-reviewed-private');assert.equal(data.edition.articles.length,3);
});
test('Notion response errors and incomplete pagination never return partial edition',async()=>{
 const origin='https://yskn0008-bot.github.io';
 for(const response of [()=>new Response('',{status:403}),()=>Response.json({results:fixture(),has_more:true,next_cursor:'same'})]){
  const h=createJournalReader({authorize:async()=>true,notionToken:'mock',origins:[origin],fetcher:async()=>response()});
  const res=await h(new Request('https://example.test',{headers:{origin,authorization:'Bearer test-valid-token-1234'}}));assert.equal(res.status,503);assert.equal((await res.json()).edition,undefined);
 }
});

test('latest unique private edition is selected without deleting older data',()=>{
 const older=fixture();older[0]=b('heading_2','YOS JOURNAL｜2026.11.23 MON');
 const newest=fixture();const all=[...older,...newest];
 assert.equal(parseReviewedEdition(all).issuedOn,'2026-11-24');
 assert.equal(parseReviewedEdition([...newest,...older]).issuedOn,'2026-11-24');
 assert.throws(()=>parseReviewedEdition([...newest,...newest]));
});

test('more than the previous 500 blocks remains readable through complete bounded pagination',async()=>{
 const origin='https://yskn0008-bot.github.io',all=[];
 for(let n=0;n<25;n++){
  const h=fixture(),day=new Date(Date.UTC(2025,0,n+1)).toISOString().slice(0,10);h[0]=b('heading_2','YOS JOURNAL｜'+day.replace(/-/g,'.'));all.push(...h);
 }
 assert.ok(all.length>500);
 let calls=0;
 const handler=createJournalReader({authorize:async()=>true,notionToken:'mock',origins:[origin],fetcher:async u=>{
  calls++;const start=Number(new URL(u).searchParams.get('start_cursor')||0),end=start+100;
  return Response.json({results:all.slice(start,end),has_more:end<all.length,next_cursor:end<all.length?String(end):null});
 }});
 const res=await handler(new Request('https://example.test',{headers:{origin,authorization:'Bearer test-valid-token-1234'}}));
 assert.equal(res.status,200);assert.ok(calls>5);assert.equal((await res.json()).edition.issuedOn,'2025-01-25');
});
