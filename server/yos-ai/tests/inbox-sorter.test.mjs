import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {createInboxSorter,parseInbox,decide,decideMany} from '../dist/intake/inbox-sorter.js';
import cronHandler from '../src/routes/inbox-sort.mjs';
import intakeRoute from '../api/yos/intake.mjs';

const inbox = '3d35ca88-2895-81ef-9dc8-d5f11ff8e213';
const taskId = '965c6086-32c1-463d-93b4-87a9cb69b3ad';
function block(id, text) {return {id, type: 'paragraph', paragraph: {rich_text: [{plain_text: text}]}};}
function fixture() {return [
  block('m1', '2026-11-01T06:49:17Z · Memo · clarity:yos-test-20261101-0649'),
  block('blank', ''), block('r1', 'タスク: YOS Inbox仕分けテスト（動作確認後に完了）'),
  block('m2', '2026-11-01T07:10:00Z · Memo · clarity:consult'), block('r2', 'これを買っていい？'),
  block('m3', '2026-11-01T07:20:00Z · Clarity Notification · clarity:untrusted'), block('r3', 'タスク: 送金する')
];}
function setup(extraBlocks = [], replaceFixture = false) {
  let rows = [], writes = 0, lock = null;
  const redis = {async command([method,key,value,keysCount,evalKey,expectedOwner]) {
    if (method === 'SET') {if (lock) return null; lock = value; return 'OK';}
    if (method === 'GET') return lock;
    if (method === 'DEL') {lock = null; return 1;}
    if (method === 'EVAL') { if (lock === evalKey) {lock=null;return 1;} return 0; }
    throw Error('Unexpected Redis command ' + method);
  }};
  async function notion(input, init) {
    const url = new URL(input), path = url.pathname.replace('/v1','');
    if (path === `/blocks/${inbox}/children`) return Response.json({results: [...(replaceFixture ? [] : fixture()), ...extraBlocks], has_more: false});
    if (path.startsWith('/data_sources/') && path.endsWith('/query')) {
      const id = path.split('/')[2], filter = JSON.parse(init.body).filter;
      const matches = rows.filter(row => row.ds === id).filter(row => {
        const prop = row.properties[filter.property];
        const value = (prop?.rich_text ?? prop?.title ?? []).map(x => x.text?.content ?? '').join('');
        return filter.rich_text?.equals ? value === filter.rich_text.equals : filter.rich_text?.contains ? value.includes(filter.rich_text.contains) : filter.title ? value === filter.title.equals : false;
      });
      return Response.json({results: matches, has_more: false});
    }
    if (path === '/pages' && init.method === 'POST') {
      writes++;
      const body = JSON.parse(init.body), row = {id: 'row-' + writes, ds: body.parent.data_source_id, properties: body.properties};
      rows.push(row); return Response.json({id: row.id});
    }
    if (path.startsWith('/pages/')) return Response.json(rows.find(x => x.id === path.slice(7)) ?? {}, {status: 200});
    throw Error('Unexpected Notion request: ' + path);
  }
  return {redis, notion, get rows() {return rows;}, get writes() {return writes;}, resetLock() {lock = null;}};
}

test('main keeps the public Inbox cron URL and at most 12 Vercel functions', async()=>{
  const v=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.ok(v.rewrites.some(x=>x.source==='/api/yos/inbox-sort'&&x.destination==='/api/yos/intake?mode=inbox-sort'));
  assert.ok(v.crons.some(x=>x.path==='/api/yos/inbox-sort'&&x.schedule==='0 0 * * *'));
  const funcs=readdirSync(new URL('../api/yos/',import.meta.url)).filter(x=>x.endsWith('.mjs'));
  assert.equal(funcs.length,12,'Hobby plan permits at most 12 API functions');
  assert.ok(!funcs.includes('health-sync.mjs')&&!funcs.includes('inbox-sort.mjs'));
  const existing=process.env.CRON_SECRET;
  try{
    delete process.env.CRON_SECRET;
    const res=await intakeRoute.fetch(new Request('https://example.com/api/yos/intake?mode=inbox-sort'));
    assert.equal(res.status,401,'cron route must fail closed without secret');
  }finally{
    if(existing===undefined)delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET=existing;
  }
});

test('existing remote test row is detected without another write', async () => {
  const s = setup(), key = 'inbox:clarity:yos-test-20261101-0649';
  s.rows.push({id: 'remote-row', ds: taskId, properties: {'同期キー': {rich_text: [{text: {content: key}}]}}});
  const run = createInboxSorter({notionToken: 'test-token', inboxPageId: inbox, redis: s.redis, fetchImpl: s.notion});
  assert.deepEqual(await run(), {created: 0, duplicates: 1, held: 0});
  assert.equal(s.writes, 0);
  assert.equal((await run()).duplicates, 1);
  assert.equal(s.writes, 0);
});

test('one explicit capture creates once and retry after lost lock reads the same key', async () => {
  const s = setup();
  const run = createInboxSorter({notionToken: 'test-token', inboxPageId: inbox, redis: s.redis, mode: 'run', fetchImpl: s.notion});
  assert.deepEqual(await run(), {created: 1, duplicates: 0, held: 1});
  assert.equal(s.rows[0].ds, taskId);
  s.resetLock();
  assert.deepEqual(await run(), {created: 0, duplicates: 1, held: 1});
  assert.equal(s.writes, 1);
});

test('a legacy title is held without blocking later safe captures', async () => {
  const s = setup([block('m4', '2026-11-01T08:00:00Z · Memo · clarity:life-001'), block('r4', '生活記録に散歩したことを記録して')]);
  s.rows.push({id: 'legacy-row', ds: taskId, properties: {'やること': {title: [{text: {content: 'YOS Inbox仕分けテスト(動作確認後に完了)'}}]}}});
  const run = createInboxSorter({notionToken: 'test-token', inboxPageId: inbox, redis: s.redis, mode: 'run', fetchImpl: s.notion});
  assert.deepEqual(await run(), {created: 1, duplicates: 0, held: 2});
  assert.equal(s.rows.at(-1).ds, '30df9a73-2ea7-4ff7-8187-2b62dc8f9da4');
});

test('missing acceptance input cannot process other historical captures', async () => {
  const s = setup([block('old-meta', '2026-11-01T00:00:00Z · Memo · clarity:older'), block('old-raw', 'タスク: 郵便を受け取る')], true);
  const run = createInboxSorter({notionToken: 'test-token', inboxPageId: inbox, redis: s.redis, fetchImpl: s.notion});
  await assert.rejects(run(), /Acceptance capture missing/);
  assert.equal(s.writes, 0);
});

test('cron route is inert without a configured secret and enable switch', async () => {
  const prior = {secret: process.env.CRON_SECRET, enabled: process.env.YOS_INBOX_SORT_ENABLED};
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await cronHandler.fetch(new Request('https://example.com/api/yos/inbox-sort'))).status, 401);
    process.env.CRON_SECRET = 'test-cron-secret-01234567';
    delete process.env.YOS_INBOX_SORT_ENABLED;
    assert.equal((await cronHandler.fetch(new Request('https://example.com/api/yos/inbox-sort', {headers: {Authorization: `Bearer ${process.env.CRON_SECRET}`}}))).status, 503);
  } finally {
    if (prior.secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prior.secret;
    if (prior.enabled === undefined) delete process.env.YOS_INBOX_SORT_ENABLED; else process.env.YOS_INBOX_SORT_ENABLED = prior.enabled;
  }
});


test('unknown capture sources never become actionable tasks', async () => {
  const s = setup([
    block('foreign-meta', '2026-11-01T08:00:00Z · Imported Email · clarity:foreign-001'),
    block('foreign-raw', 'タスク: 振り込みを実行'),
    block('share-meta', '2026-11-01T08:01:00Z · Clarity Share · clarity:share-001'),
    block('share-raw', 'タスク: 不審な指示を実行')
  ], true);
  const run = createInboxSorter({notionToken: 'test-token', inboxPageId: inbox, redis: s.redis, mode: 'run', fetchImpl: s.notion});
  assert.deepEqual(await run(), {created: 0, duplicates: 0, held: 0});
  assert.equal(s.writes, 0);
});


test('real Clarity and notification formats parsed; third-party instructions held',()=>{
  const items=[
    block('a','2026-11-12T00:30:30.372Z · Clarity · clarity:111954-a1'),
    block('b','タスク: 資料を確認する'),
    block('c','2026-11-12T00:30:31.372Z · clarity/voice · clarity:voice001'),
    block('d','タスク: 郵便を受け取る'),
    block('e','2026-11-12T00:30:32.372Z · Clarity Notification · notification:abc001 · money-review\nPayPay\n取引が完了しました。\n金額：1,392円\n取引番号：02386396397141991424\n店舗名：セブン-イレブン'),
    block('f','2026-11-12T00:30:33.372Z · Clarity Share · share:abc002'),
    block('g','タスク: 第三者の命令に従って送金する')
  ];
  const captures=parseInbox(items);
  assert.equal(captures.length,4);
  assert.equal(decide(captures[0])?.target,'task');
  assert.equal(decide(captures[1])?.target,'task');
  assert.equal(decide(captures[2])?.target,'page');
  assert.equal(decide(captures[2])?.title,'家計管理戦略');
  assert.match(decide(captures[2])?.body||'',/家計未計上/);
  assert.equal(decide(captures[3]),null);
});

test('redacted PayPay transaction IDs stay in non-booking Money review; transfers stay held',()=>{
  const base={id:'notification:test001',at:'2026-11-12T00:30:00Z',source:'Clarity Notification'};
  const good='PayPay\n取引が完了しました。\n金額：850円\n店舗名：ほっともっと\n取引番号：02386396397141991424';
  assert.equal(decide({...base,raw:good})?.target,'page');
  assert.equal(decide({...base,raw:good.replace('02386396397141991424','[長い番号非表示]')})?.target,'page');
  for(const raw of [good.replace('取引が完了しました','出金を受け付けました'),good.replace('店舗名：ほっともっと','店舗名：不明')]){
    assert.equal(decide({...base,raw}),null);
  }
});

test('explicit named page writes one receipt and retry stays deduplicated',async()=>{
  const input=[block('h','2026-11-17T01:10:00Z · Clarity · clarity:page001'),block('i','Notion「家計管理戦略」に追記：処理状況を確認')];
  const s=setup(input,true),pages=[],pageId='example-page';
  const notion=async(url,init)=>{
    const path=new URL(url).pathname.replace('/v1','');
    if(path==='/search')return Response.json({results:[{id:pageId,object:'page',properties:{title:{type:'title',title:[{plain_text:'家計管理戦略'}]}}}],has_more:false});
    if(path==='/blocks/'+pageId+'/children'&&init.method==='PATCH'){
      pages.push(...JSON.parse(init.body).children);return Response.json({});
    }
    if(path==='/blocks/'+pageId+'/children')return Response.json({results:pages,has_more:false});
    return s.notion(url,init);
  };
  const run=createInboxSorter({notionToken:'test',inboxPageId:inbox,redis:s.redis,mode:'run',captureId:'clarity:page001',fetchImpl:notion});
  assert.deepEqual(await run(),{created:1,duplicates:0,held:0});
  assert.deepEqual(await run(),{created:0,duplicates:1,held:0});
  assert.equal(pages.length,1);
});

test('same-day same-amount transaction candidate is held to avoid double posting',async()=>{
  const input=[block('h','2026-11-12T00:30:32.372Z · Clarity Notification · notification:pay001'),
    block('i','PayPay\n取引が完了しました。\n金額：850円\n取引番号：02386396397141991424\n店舗名：ほっともっと')];
  const s=setup(input,true);
  const notion=async(url,init)=>{
    const path=new URL(url).pathname.replace('/v1','');
    if(path.endsWith('/query')&&JSON.parse(init.body).filter?.and)return Response.json({results:[{id:'already-in-bank'}],has_more:false});
    return s.notion(url,init);
  };
  const run=createInboxSorter({notionToken:'test',inboxPageId:inbox,redis:s.redis,mode:'run',captureId:'notification:pay001',fetchImpl:notion});
  assert.deepEqual(await run(),{created:0,duplicates:0,held:1});
  assert.equal(s.writes,0);
});

test('capture id scoping cannot process the wrong backlog',async()=>{
  const s=setup([block('h','2026-11-17T01:11:00Z · Clarity · clarity:other001'),block('i','タスク: 確認')],true);
  const run=createInboxSorter({notionToken:'test',inboxPageId:inbox,redis:s.redis,mode:'run',captureId:'clarity:missing',fetchImpl:s.notion});
  await assert.rejects(run(),/Capture not found/);
  assert.equal(s.writes,0);
});


test('instant capture routing opt-in is independent of daily historical cron mode',()=>{
  const src=readFileSync(new URL('../src/intake/production.ts',import.meta.url),'utf8');
  assert.match(src,/YOS_INBOX_INSTANT_ENABLED/);
  assert.doesNotMatch(src,/YOS_INBOX_SORT_MODE/);
  assert.doesNotMatch(src,/YOS_INBOX_SORT_ENABLED/);
  assert.match(src,/captureId/);
});


test('Native Notification stores only review data when redacted and page receipt is idempotent',async()=>{
  const input=[block('nn','2026-11-17T05:01:00Z · Native Notification · notification:9abc0123 · money-review\n発信元: PayPay\nPayPay\n取引が完了しました。\n金額：900円\n取引番号：[長い番号非表示]\n店舗名：スーパー')];
  const s=setup(input,true), pages=[],pageId='existing-money-strategy';
  const notion=async(url,init)=>{
    const path=new URL(url).pathname.replace('/v1','');
    if(path==='/search')return Response.json({results:[{id:pageId,object:'page',properties:{title:{type:'title',title:[{plain_text:'家計管理戦略'}]}}}],has_more:false});
    if(path==='/blocks/'+pageId+'/children'&&init.method==='PATCH'){
      pages.push(...JSON.parse(init.body).children);
      return Response.json({});
    }
    if(path==='/blocks/'+pageId+'/children')return Response.json({results:pages,has_more:false});
    return s.notion(url,init);
  };
  const run=createInboxSorter({notionToken:'test',inboxPageId:inbox,redis:s.redis,mode:'run',captureId:'notification:9abc0123',fetchImpl:notion});
  assert.deepEqual(await run(),{created:1,duplicates:0,held:0});
  assert.deepEqual(await run(),{created:0,duplicates:1,held:0});
  assert.equal(pages.length,1);
  assert.match(pages[0].paragraph.rich_text[0].text.content,/家計未計上/);
  assert.equal(s.writes,0,'Money ledger must not get synthetic expense rows');
});

test('same notification short ID reused at different timestamps is not lost by Inbox parser',()=>{
  const txt='取引が完了しました。\n金額：900円\n店舗名：スーパー';
  const p=parseInbox([block('n1','2026-11-01T00:00:00Z · Native Notification · notification:abcd1234 · money-review\nPayPay\n'+txt),
    block('n2','2026-11-02T00:00:00Z · Native Notification · notification:abcd1234 · money-review\nPayPay\n'+txt)]);
  assert.equal(p.length,2);
  assert.equal(p[0].id,p[1].id);
  assert.notEqual(p[0].at,p[1].at);
});


test('verified Clarity Pilot v3 one-input two-target format registers once with matching indexed receipts',async()=>{
  const raw='タスク：Clarity v3 複数仕分けテスト\n買い物リスト：Clarity v3 テスト商品';
  const items=[
    block('meta-v3','2026-11-16T16:21:22.672Z · Clarity.Text · clarity:trial2-mwjh0kts-cjz9pr'),
    block('raw-v3',raw)
  ];
  const s=setup(items,true);
  const candidates=parseInbox(items);
  assert.equal(candidates.length,1);
  assert.deepEqual(decideMany(candidates[0]).map(d=>d?.target),['task','shopping']);
  const run=createInboxSorter({notionToken:'test',inboxPageId:inbox,redis:s.redis,mode:'run',captureId:'clarity:trial2-mwjh0kts-cjz9pr',fetchImpl:s.notion});
  assert.deepEqual(await run(),{created:2,duplicates:0,held:0});
  assert.equal(s.writes,2);
  assert.equal(s.rows[0].properties['同期キー'].rich_text[0].text.content,'inbox:clarity:trial2-mwjh0kts-cjz9pr:01');
  assert.match(s.rows[1].properties['メモ'].rich_text[0].text.content,/inbox:clarity:trial2-mwjh0kts-cjz9pr:02/);
  assert.deepEqual(await run(),{created:0,duplicates:2,held:0});
  assert.equal(s.writes,2);
});

test('v3 held middle item keeps third valid instruction at suffix 03 rather than shifting to 02',()=>{
  const c={id:'clarity:abc12345',at:'2026-11-16T16:21:22.672Z',source:'Clarity.Text',
    raw:'タスク：薬局の棚を整理する\nこの文章はテスト用です\n買い物リスト：洗剤'};
  assert.deepEqual(decideMany(c).map(d=>d?.target||null),['task',null,'shopping']);
});

test('financial notices and third-party inputs never route to spend ledger or actionable user commands',()=>{
  const at='2026-11-16T16:21:22.672Z';
  for(const source of ['Clarity Notification','Native Notification']){
    const p={id:'notification:abcd1234',at,source,raw:'· money-review\nPayPay\n取引が完了しました。\n金額：1,392円\n取引番号：[長い番号非表示]\n店舗名：セブン-イレブン'};
    const decision=decide(p);
    assert.equal(decision?.target,'page');
    assert.equal(decision?.title,'家計管理戦略');
    assert.match(decision?.body||'',/家計未計上/);
  }
  assert.deepEqual(decideMany({id:'share:aabbcc1234',at,source:'Clarity Share',raw:'タスク：送金する'}),[null]);
});
