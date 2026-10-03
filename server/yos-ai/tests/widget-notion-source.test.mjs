import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNotionTaskDashboard} from '../dist/widget/notion-source.js';

const DATA_SOURCE_ID = '965c608632c1463d93b487a9cb69b3ad';

function rich(type, text) {
  return {[type]: [{plain_text: text, type: 'text', text: {content: text}}]};
}

function select(name) {
  return {select: name ? {name} : null};
}

function page({order, title, state, owner = 'YOS', due = null, priority = 'P1', nextAction = ''}) {
  return {
    object: 'page',
    properties: {
      '実行順': {number: order},
      'やること': rich('title', title),
      '状態': select(state),
      '担当': select(owner),
      '期限': {date: due ? {start: due} : null},
      '優先度': select(priority),
      '次の一手': rich('rich_text', nextAction),
      '完了条件': rich('rich_text', ''),
      'ブロッカー': rich('rich_text', ''),
      '正本・根拠': rich('rich_text', 'Notion YOS Tasks')
    }
  };
}

test('live Notion source returns current YOS Tasks in execution order', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url: String(url), init});
    return Response.json({
      results: [
        page({order: 2, title: '19｜PR #553を修正', state: '次にやる'}),
        page({order: 1, title: '18｜YOS Money Local v1.5.1を安定起動まで直す', state: '実行中', nextAction: '実機確認'}),
        page({order: null, title: '24｜orderなし', state: '実行中'})
      ],
      has_more: false,
      next_cursor: null
    });
  };

  const result = await loadNotionTaskDashboard({
    notionToken: 'secret-token',
    notionDataSourceId: DATA_SOURCE_ID,
    fetchImpl
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/data_sources\/965c608632c1463d93b487a9cb69b3ad\/query$/);
  assert.equal(calls[0].init.headers['Notion-Version'], '2026-03-11');
  assert.deepEqual(result.tasks.map((item) => item.order), [1, 2]);
  assert.equal(result.tasks[0].title, '18｜YOS Money Local v1.5.1を安定起動まで直す');
  assert.equal(result.tasks[0].nextAction, '実機確認');
  assert.ok(result.generatedAt);
});

test('live Notion source discovers exactly one YOS Tasks data source when id is omitted', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.endsWith('/v1/search')) {
      return Response.json({
        results: [
          {
            object: 'data_source',
            id: DATA_SOURCE_ID,
            title: [{plain_text: 'YOS Tasks'}]
          }
        ]
      });
    }
    return Response.json({results: [], has_more: false, next_cursor: null});
  };

  const result = await loadNotionTaskDashboard({
    notionToken: 'secret-token',
    fetchImpl
  });

  assert.equal(calls.length, 2);
  assert.ok(calls[0].endsWith('/v1/search'));
  assert.match(calls[1], /\/v1\/data_sources\/965c608632c1463d93b487a9cb69b3ad\/query$/);
  assert.deepEqual(result.tasks, []);
});

// Direct Notion widget source is covered end-to-end at the parser boundary.
