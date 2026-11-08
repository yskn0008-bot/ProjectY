import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyHealthReport,extractHealthCaptures,mergeHealthJournal,synchronizeHealthInbox,japanDay} from '../src/widget/health-sync.mjs';

const now=new Date('2026-11-01T05:00:00.000Z');
const timestamp='2026-11-01T01:41:23.215Z';
const report='昨日の夜昨日じゃない今日の今日の午前1時に豚汁とチキン南蛮弁当をほっともっとで買ってきて食べたよ';
const paragraph=s=>({object:'block',type:'paragraph',paragraph:{rich_text:[{plain_text:s}]}});
const sample=[paragraph(`${timestamp} · Memo · clarity:324672-a1`),paragraph(report),{object:'block',type:'divider',divider:{}}];

test('Tokyo day and user food report are correctly recognized',()=>{
 assert.equal(japanDay(timestamp),'2026-11-01');
 assert.deepEqual(classifyHealthReport(report),['meal']);
 assert.equal(extractHealthCaptures(sample,now).length,1);
 assert.deepEqual(extractHealthCaptures(sample,now)[0],{id:'clarity:324672-a1:meal',captureId:'clarity:324672-a1',kind:'meal',raw:report,day:'2026-11-01',reportedAt:timestamp});
});
test('never mistake a hypothetical, canceled meal, or another person for an action',()=>{
 for(const s of ['今日はチャーハンを食べたい','明日チャーハンを食べる予定','チャーハンを食べなかった','父がチャーハンを食べた','今日チャーハン食べた？','もし豚汁を食べたら','今日は5分歩こう','今日は運動していない','昨日5分歩いた','昨日チャーハンを食べた']){
  assert.deepEqual(classifyHealthReport(s),[],s);
 }
});
test('positive activity reports are separate from plans and step counters',()=>{
 assert.deepEqual(classifyHealthReport('今日は5分歩いた'),['activity']);
 assert.deepEqual(classifyHealthReport('スクワット5回やった'),['activity']);
 assert.deepEqual(classifyHealthReport('かかと上げ15回した'),['activity']);
 assert.deepEqual(classifyHealthReport('今日は1000歩でした'),[]);
});
test('reject notification and stale records, retain identical raw capture only once',()=>{
 const blocks=[paragraph(`${timestamp} · Clarity Notification · notification:999`),paragraph('チャーハン食べた'),...sample,...sample,paragraph('2026-10-20T01:20:00Z · Memo · clarity:older123'),paragraph('チャーハン食べた')];
 assert.equal(extractHealthCaptures(blocks,now).length,1);
});
test('support combined header/raw and preserve inline unmodified meal description',()=>{
 const blocks=[paragraph(`${timestamp} · Clarity · clarity:324672-a1\n\n${report}\n---`)];
 assert.equal(extractHealthCaptures(blocks,now)[0].raw,report);
});
test('correctly avoid duplicated events when original diary was migrated manually',()=>{
 const events=extractHealthCaptures(sample,now);
 const original='【本人申告】豚汁を食べた。Clarity報告ID: clarity:324672-a1';
 const result=mergeHealthJournal(original,events);
 assert.deepEqual(result,{updated:original,added:0});
});
test('appending activity when one capture contains both a meal and activity',()=>{
 const events=extractHealthCaptures([paragraph(`${timestamp} · Memo · clarity:324672-a1`),paragraph('今日はチャーハン食べた。今日は5分歩いた')],now);
 assert.equal(events.length,2);
 const added=mergeHealthJournal('',events);
 assert.equal(added.added,2);
 assert.equal(mergeHealthJournal(added.updated,events).added,0);
});
test('advice never asks for more soup when meal already includes 豚汁',()=>{
 const s=mergeHealthJournal('',extractHealthCaptures(sample,now)).updated;
 assert.match(s,/汁物はすでに摂取/);
 assert.doesNotMatch(s,/汁物を増や/);
});

function makeMock(initial=[]){
 const saved=new Map(initial.map(([day,body])=>[day,body]));
 const commands=[]; const calls=[];
 const store=new Map();
 const redis={command:async(cmd)=>{
   commands.push(cmd); const [op,key,value,arg,n,ttl]=cmd;
   if(op==='SET'){
     if(cmd.includes('NX')&&store.has(key))return null;
     store.set(key,value);return 'OK';
   }
   if(op==='DEL')return store.delete(key)?1:0;
   return store.get(key)||null;
 }};
 const fetchImpl=async(url,request)=>{
   const u=new URL(url);const path=u.pathname;
   calls.push({path,method:request.method,body:request.body?JSON.parse(request.body):null});
   const answer=(data,status=200)=>Response.json(data,{status});
   if(path==='/v1/blocks/3d35ca88289581ef9dc8d5f11ff8e213/children')return answer({results:sample,has_more:false,next_cursor:null});
   if(path==='/v1/search')return answer({results:[{object:'data_source',id:'fe0e0973-d1cc-4bde-b138-1cb1da64ac68',title:[{plain_text:'YOS 日記'}]}]});
   if(path==='/v1/data_sources/fe0e0973-d1cc-4bde-b138-1cb1da64ac68/query'){
     let day=(request.body?JSON.parse(request.body):{}).filter.rich_text?.equals?.replace('health:','');
     const value=saved.get(day);return answer({results:value===undefined?[]:[page(day,value)]});
   }
   if(path==='/v1/pages'&&request.method==='POST'){
     const body=JSON.parse(request.body);const day=body.properties['日付'].date.start;
     saved.set(day,richToString(body.properties['本文'].rich_text));return answer(page(day,saved.get(day)),201);
   }
   const m=/^\/v1\/pages\/([a-f0-9-]+)$/.exec(path);
   if(m){
     const day='2026-11-01';
     if(!saved.has(day))return answer({message:'not found'},404);
     if(request.method==='PATCH')saved.set(day,richToString(JSON.parse(request.body).properties['本文'].rich_text));
     return answer(page(day,saved.get(day)));
   }
   return answer({message:'unmocked '+path},404);
 };
 return {redis,fetchImpl,saved,store,calls,commands};
}
const richToString=x=>x.map(y=>y.text.content).join('');
function page(day,body){return {object:'page',id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',properties:{'記録キー':{rich_text:[{plain_text:'health:'+day}]},'記録元':{select:{name:'Clarity'}},'日付':{date:{start:day}},'本文':{rich_text:[{plain_text:body}]}}};}
const env={YOS_NOTION_API_TOKEN:'notion-mocked-token',YOS_NOTION_INBOX_PAGE_ID:'3d35ca88289581ef9dc8d5f11ff8e213'};
test('sync creates exactly one page in existing diary with idempotent text',async()=>{
 const m=makeMock();const o=await synchronizeHealthInbox({environment:env,redis:m.redis,fetchImpl:m.fetchImpl,now});
 assert.equal(o.status,'verified');assert.equal(o.added,1);assert.equal(o.created,1);
 assert.equal(m.saved.size,1);
 assert.match(m.saved.get('2026-11-01'),/YOS-health:clarity:324672-a1:meal/);
 assert.deepEqual(await synchronizeHealthInbox({environment:env,redis:m.redis,fetchImpl:m.fetchImpl,now}),{status:'cooldown'});
 m.store.delete('yos:health-inbox-sync:v1:cooldown');
 const again=await synchronizeHealthInbox({environment:env,redis:m.redis,fetchImpl:m.fetchImpl,now});
 assert.equal(again.status,'verified');assert.equal(again.added,0);assert.equal(again.created,0);
});
test('sync does not duplicate a manually migrated food report',async()=>{
 const m=makeMock([['2026-11-01','【本人申告】豚汁とチキン南蛮弁当。Clarity報告ID: clarity:324672-a1']]);
 const o=await synchronizeHealthInbox({environment:env,redis:m.redis,fetchImpl:m.fetchImpl,now});
 assert.equal(o.added,0);assert.equal(o.created,0);
 assert.equal(m.calls.filter(x=>x.method==='PATCH').length,0);
});
test('missing config does not attempt external reads or writes',async()=>{
 const m=makeMock();assert.deepEqual(await synchronizeHealthInbox({environment:{},redis:m.redis,fetchImpl:m.fetchImpl,now}),{status:'disabled:missing-existing-config'});assert.equal(m.calls.length,0);
});
test('fail closed on a non-unique health journal key and release locks for later retry',async()=>{
 const m=makeMock();const orig=m.fetchImpl;
 m.fetchImpl=async(u,q)=>u.includes('/query')?Response.json({results:[page('2026-11-01','a'),page('2026-11-01','b')]}):orig(u,q);
 await assert.rejects(synchronizeHealthInbox({environment:env,redis:m.redis,fetchImpl:m.fetchImpl,now}),/not unique/);
 assert.equal(m.store.has('yos:health-inbox-sync:v1:lock'),false);
 assert.equal(m.store.has('yos:health-inbox-sync:v1:cooldown'),false);
});
test('preserves actual food and exercise even when other clauses contain future plans or questions',()=>{
 assert.deepEqual(classifyHealthReport('今日はチャーハンを食べた。明日は野菜をもっと食べたい'),['meal']);
 assert.deepEqual(classifyHealthReport('今日は5分歩いた。明日も歩きたい'),['activity']);
 assert.deepEqual(classifyHealthReport('今日は豚汁を食べた。これはどう？'),['meal']);
 assert.deepEqual(classifyHealthReport('今日は弁当を食べた、明日はカレーを食べたい'),['meal']);
 assert.deepEqual(classifyHealthReport('昨日の夜に歩いた。今日はチャーハンを食べた'),['meal']);
 assert.deepEqual(classifyHealthReport('家族が弁当を食べた。今日は5分歩いた'),['activity']);
 assert.deepEqual(classifyHealthReport('昼はパン。食べた'),['meal']);
 assert.deepEqual(classifyHealthReport('今日はチャーハンを食べた？'),[]);
 assert.deepEqual(classifyHealthReport('朝はチャーハン？食べた'),[]);
});

test('mixed capture saves only explicit completed categories, not future activity',()=>{
 const blocks=[paragraph(`${timestamp} · Memo · clarity:health-mixed-1`),
   paragraph('今日は豚汁を食べた。明日から5分歩く予定。')];
 const result=extractHealthCaptures(blocks,now);
 assert.equal(result.length,1);
 assert.equal(result[0].kind,'meal');
 assert.equal(result[0].captureId,'clarity:health-mixed-1');
});
