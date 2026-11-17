import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {jstDate,parseRSS,pickFrom,SOURCES,collect,makeIssue,validateIssue,build,writeIssue} from '../daily-public-issue.mjs';
const NOW=new Date('2026-11-17T00:30:00Z');
const DATE='Mon, 16 Nov 2026 23:15:00 GMT';
const LINK='https://www.pref.okinawa.lg.jp/news/12345.html';
const TITLE='沖縄県で実施する音楽祭の新しい案内について';
const DESC='沖縄の公式情報です。音楽祭の開催内容と参加に関する公式案内が更新されました。詳しい対象条件については公式ページをご確認ください。';
const entry={title:TITLE,description:DESC,link:LINK,published:DATE};
const rss='<rss version="2.0"><channel><item><title><![CDATA['+TITLE+']]></title><link>'+LINK+'</link><pubDate>'+DATE+'</pubDate><description>'+DESC+'</description></item></channel></rss>';
const good=()=>pickFrom([entry],SOURCES[0],NOW)[0];
function mockFetch(url){assert.ok(SOURCES.some(x=>x.feed===url),'unexpected private/API request '+url);return Promise.resolve({ok:true,text:async()=>rss});}
async function tempRepo(fn){const p=await mkdtemp(join(tmpdir(),'yos-journal-'));try{await mkdir(join(p,'journal/editions'),{recursive:true});await mkdir(join(p,'ios-app/scriptable/journal'),{recursive:true});return await fn(p);}finally{await rm(p,{recursive:true,force:true});}}

test('date comes from Asia/Tokyo rather than UTC',()=>{
 assert.equal(jstDate(NOW),'2026-11-17');assert.equal(jstDate(new Date('2026-11-16T14:40:00Z')),'2026-11-16');
});
test('reads only official RSS fields and keeps the original source URL',()=>{
 const parsed=parseRSS(rss);assert.equal(parsed.length,1);assert.equal(parsed[0].title,TITLE);
 const x=pickFrom(parsed,SOURCES[0],NOW)[0];assert.equal(x.link,LINK);assert.equal(x.editorialLane,'DISCOVERY');assert.equal(x.sourceDate,'2026-11-17');
});
test('rejects third-party, future, stale, generic, recruitment and private entries',()=>{
 assert.equal(pickFrom([{...entry,link:'https://evil.invalid/z'}],SOURCES[0],NOW).length,0);
 assert.equal(pickFrom([{...entry,published:'2026-11-05'}],SOURCES[0],NOW).length,0);
 assert.equal(pickFrom([{...entry,published:'2026-12-01'}],SOURCES[0],NOW).length,0);
 assert.equal(pickFrom([{...entry,title:'令和8年一般競争入札について'}],SOURCES[0],NOW).length,0);
 assert.equal(pickFrom([{...entry,title:'沖縄県求人情報の発表について'}],SOURCES[0],NOW).length,0);
 assert.equal(pickFrom([{...entry,title:'沖縄県からのお知らせです'}],SOURCES[0],NOW).length,0);
 assert.equal(pickFrom([{...entry,description:'あなたの残高が公開されています。'+DESC}],SOURCES[0],NOW).length,0);
});
test('creates bounded issue with source excerpt, no AI claims and no images',()=>{
 const issue=makeIssue([good()],{now:NOW});assert.ok(issue);assert.equal(issue.issuedOn,'2026-11-17');
 assert.equal(issue.articles[0].summary,DESC);assert.equal(issue.articles[0].image,'');assert.equal(validateIssue(issue,NOW),true);
 assert.ok(!JSON.stringify(issue).includes('notion'));assert.equal(issue.articles[0].source,'沖縄県公式');
});
test('no relevant fresh articles -> no fake issue; no old article recycling',()=>{
 assert.equal(makeIssue([],{now:NOW}),null);
 assert.equal(makeIssue([good()],{now:NOW,previousLinks:[LINK]}),null);
});
test('source/network outage never returns a new issue',async()=>{
 const no=await collect({fetcher:async()=>{throw Error('offline');},now:NOW});assert.equal(no.working,0);
 await tempRepo(async(rootPath)=>{const result=await build({fetcher:async()=>{throw Error('offline');},now:NOW,rootPath});assert.equal(result.status,'sources-unavailable');});
});
test('conservative editor only fetches allowlisted public sources',async()=>{
 const x=await collect({fetcher:mockFetch,now:NOW});assert.equal(x.working,3);assert.equal(x.items.length,1);
});
test('publishes both existing consumer formats and never overwrites a dated edition',async()=>{
 await tempRepo(async(rootPath)=>{
  const b=await build({fetcher:mockFetch,now:NOW,rootPath});assert.equal(b.status,'ready');
  await writeIssue(b.issue,rootPath,NOW);
  const p=JSON.parse(await readFile(join(rootPath,'journal/editions/2026-11-17.json'),'utf8'));
  const q=JSON.parse(await readFile(join(rootPath,'ios-app/scriptable/journal/latest.json'),'utf8'));
  const h=JSON.parse(await readFile(join(rootPath,'ios-app/scriptable/journal/2026-11-17.json'),'utf8'));
  assert.deepEqual(p,q);assert.deepEqual(q,h);
  assert.equal((await build({fetcher:mockFetch,now:NOW,rootPath})).status,'already-published');
  await assert.rejects(()=>writeIssue(b.issue,rootPath,NOW),/immutable/);
 });
});
test('old links and personal claims never appear in new issue',async()=>{
 await tempRepo(async(rootPath)=>{
  await writeFile(join(rootPath,'ios-app/scriptable/journal/latest.json'),JSON.stringify({issuedOn:'2026-11-16',articles:[{link:LINK}]}));
  const b=await build({fetcher:mockFetch,now:NOW,rootPath});assert.equal(b.status,'no-eligible-new-articles');
  assert.throws(()=>validateIssue({...makeIssue([good()],{now:NOW}),articles:[{...good(),link:'https://example.com/wrong'}]},NOW),/invalid/);
 });
});