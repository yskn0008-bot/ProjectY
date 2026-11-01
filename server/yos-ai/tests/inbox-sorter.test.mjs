import test from 'node:test';
import assert from 'node:assert/strict';
import {createInboxSorter} from '../dist/intake/inbox-sorter.js';
import cronHandler from '../api/yos/inbox-sort.mjs';

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
  let rows = [], writes = 0, lock = false;
  const redis = {async command([method]) {if (method !== 'SET') throw Error('Unexpected Redis command'); if (lock) return null; lock = true; return 'OK';}};
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
  return {redis, notion, get rows() {return rows;}, get writes() {return writes;}, resetLock() {lock = false;}};
}

test('existing remote test row is detected without another write', async () => {
  const s = setup(), key = 'inbox:clarity:yos-test-20261101-0649';
  s.rows.push({id: 'remote-row', ds: taskId, properties: {'同期キー': {rich_text: [{text: {content: key}}]}}});
  const run = createInboxSorter({notionToken: 'test-token', inboxPageId: inbox, redis: s.redis, fetchImpl: s.notion});
  assert.deepEqual(await run(), {created: 0, duplicates: 1, held: 0});
  assert.equal(s.writes, 0);
  await assert.rejects(run(), /already running/);
  s.resetLock();
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
