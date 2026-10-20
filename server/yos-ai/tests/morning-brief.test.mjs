import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNotionMorningBrief, unavailableMorningBrief} from '../dist/widget/morning.js';

const TASKS_ID = '965c608632c1463d93b487a9cb69b3ad';
const BALANCE_ID = '94fc7e9ffd204073bbcf02efe8e95c5c';
const EVENTS_ID = '95b30d16753040c6a320dab99acad55d';

function rich(type, text) {
  return {[type]: [{plain_text: text, type: 'text', text: {content: text}}]};
}

function select(name) {
  return {select: name ? {name} : null};
}

function taskPage({order, title, state, priority = 'P1', nextAction = '', due = null, lastSynced = null}) {
  return {
    object: 'page',
    last_edited_time: '2026-10-19T12:00:00Z',
    properties: {
      '実行順': {number: order},
      'やること': rich('title', title),
      '状態': select(state),
      '担当': select('陽介'),
      '期限': {date: due ? {start: due} : null},
      '優先度': select(priority),
      '次の一手': rich('rich_text', nextAction),
      '完了条件': rich('rich_text', ''),
      'ブロッカー': rich('rich_text', ''),
      '正本・根拠': rich('rich_text', 'Notion YOS Tasks'),
      '操作URL': {url: null},
      '最終同期': {date: lastSynced ? {start: lastSynced} : null}
    }
  };
}

function balancePage({name, assetClass, amount, usable, verification, date}) {
  return {
    object: 'page',
    last_edited_time: '2026-10-16T12:00:00Z',
    properties: {
      '口座・資産': rich('title', name),
      '資産区分': select(assetClass),
      '金額': {number: amount},
      'すぐ使える': {checkbox: usable},
      '確認状況': select(verification),
      '確認日': {date: date ? {start: date} : null}
    }
  };
}

function moneyEvent({title, section, amount, date, verification, lastEdited}) {
  return {
    object: 'page',
    last_edited_time: lastEdited,
    properties: {
      '項目': rich('title', title),
      '区分': select(section),
      '金額': {number: amount},
      '日付': {date: {start: date}},
      '状態': select('予定'),
      '確度': select(verification)
    }
  };
}

function createFetch({moneyAvailable = true, freshUsableBalance = false} = {}) {
  return async (url, init = {}) => {
    const value = String(url);
    if (value.endsWith('/v1/search')) {
      const body = JSON.parse(init.body);
      if (!moneyAvailable && body.query === '残高スナップショット') {
        return Response.json({results: []});
      }
      const id = body.query === '残高スナップショット'
        ? BALANCE_ID
        : body.query === '家計イベント・入出金予定'
          ? EVENTS_ID
          : null;
      return Response.json({
        results: id ? [{object: 'data_source', id, title: [{plain_text: body.query}]}] : []
      });
    }
    if (value.includes('/data_sources/' + TASKS_ID + '/query')) {
      return Response.json({
        results: [
          taskPage({
            order: 1,
            title: '21｜Night Brief｜22:00自動運用とJournal保存を実測',
            state: '本人操作',
            priority: 'P1',
            nextAction: '次回22:00の自動起動を確認',
            lastSynced: '2026-10-03'
          }),
          taskPage({
            order: 2,
            title: '23｜Clarity Next｜Notion YOS HOME 1タップ連携',
            state: '本人操作',
            priority: 'P1',
            nextAction: 'Clarity Nextを実機確認',
            lastSynced: null
          }),
          taskPage({
            order: 3,
            title: '11｜iPhone｜ホーム画面最適化',
            state: '次にやる',
            priority: 'P2',
            nextAction: 'ホーム画面を整理',
            lastSynced: '2026-10-19'
          })
        ],
        has_more: false,
        next_cursor: null
      });
    }
    if (value.includes('/data_sources/' + BALANCE_ID + '/query')) {
      return Response.json({
        results: [
          balancePage({
            name: 'ソニー銀行',
            assetClass: '銀行',
            amount: 5,
            usable: freshUsableBalance,
            verification: '連携サービス記録',
            date: freshUsableBalance ? '2026-10-20' : '2026-10-16'
          }),
          balancePage({
            name: '陽介wallet',
            assetClass: '現金',
            amount: 62687,
            usable: false,
            verification: '連携サービス記録',
            date: '2026-10-16'
          }),
          balancePage({
            name: 'PayPay',
            assetClass: '電子マネー',
            amount: null,
            usable: false,
            verification: '未確認',
            date: null
          })
        ],
        has_more: false,
        next_cursor: null
      });
    }
    if (value.includes('/data_sources/' + EVENTS_ID + '/query')) {
      return Response.json({
        results: [
          moneyEvent({
            title: '沖縄ガス 2026年9月分（未払い）',
            section: '支出',
            amount: 5466,
            date: '2026-10-20',
            verification: '確認済',
            lastEdited: '2026-10-18T12:00:00Z'
          }),
          moneyEvent({
            title: '家賃収入（概算・要照合）',
            section: '収入',
            amount: 160485,
            date: '2026-11-10',
            verification: '未確認',
            lastEdited: '2026-10-19T12:00:00Z'
          })
        ],
        has_more: false,
        next_cursor: null
      });
    }
    throw new Error('unexpected URL ' + value);
  };
}

test('Morning Brief reuses exact NOW selection but refuses stale Money as current', async () => {
  const result = await loadNotionMorningBrief({
    notionToken: 'secret-token',
    notionTasksDataSourceId: TASKS_ID,
    fetchImpl: createFetch(),
    now: new Date('2026-10-20T04:45:00Z')
  });

  assert.equal(result.nowStatus, 'confirmed');
  assert.equal(result.sourceState, 'active');
  assert.equal(result.now?.title, '21｜Night Brief｜22:00自動運用とJournal保存を実測');
  assert.equal(result.now?.order, 1);
  assert.equal(result.now?.priority, 'P1');

  assert.equal(result.money.status, 'unconfirmed');
  assert.equal(result.money.currentUsable, null);
  assert.equal(result.money.nextIncome, null);
  assert.equal(result.money.nextPayment?.title, '沖縄ガス 2026年9月分（未払い）');
  assert.equal(result.money.nextPayment?.amount, 5466);
  assert.equal(result.money.sevenDayWarning?.date, '2026-10-20');
  assert.match(result.money.reason, /current-usable-unconfirmed/);
  assert.match(result.money.reason, /next-income-unconfirmed/);

  assert.equal(result.alerts.status, 'confirmed');
  assert.equal(result.alerts.count, 1);
  assert.equal(result.alerts.item?.title, '沖縄ガス 2026年9月分（未払い）');
  assert.equal(result.alerts.item?.source, '家計イベント・入出金予定');
});

test('Morning Brief can confirm fresh usable balance even when non-usable assets remain unconfirmed', async () => {
  const result = await loadNotionMorningBrief({
    notionToken: 'secret-token',
    notionTasksDataSourceId: TASKS_ID,
    fetchImpl: createFetch({freshUsableBalance: true}),
    now: new Date('2026-10-20T04:45:00Z')
  });

  assert.equal(result.money.status, 'confirmed');
  assert.equal(result.money.currentUsable, 5);
  assert.equal(result.money.nextIncome, null);
  assert.equal(result.money.nextPayment?.title, '沖縄ガス 2026年9月分（未払い）');
  assert.equal(result.money.safetyToNextIncome, 'unconfirmed');
  assert.match(result.money.reason, /next-income-unconfirmed/);
});

test('Morning Brief marks dependent sections unconfirmed when Money Notion sources cannot be read', async () => {
  const result = await loadNotionMorningBrief({
    notionToken: 'secret-token',
    notionTasksDataSourceId: TASKS_ID,
    fetchImpl: createFetch({moneyAvailable: false}),
    now: new Date('2026-10-20T04:45:00Z')
  });

  assert.equal(result.nowStatus, 'confirmed');
  assert.ok(result.now);
  assert.equal(result.money.status, 'unconfirmed');
  assert.equal(result.money.reason, 'money-source-unavailable');
  assert.equal(result.alerts.status, 'unconfirmed');
  assert.equal(result.alerts.count, null);
});

test('total Notion acquisition failure never becomes an empty or safe state', () => {
  const result = unavailableMorningBrief();
  assert.equal(result.nowStatus, 'unconfirmed');
  assert.equal(result.alerts.status, 'unconfirmed');
  assert.equal(result.alerts.count, null);
  assert.equal(result.money.status, 'unconfirmed');
  assert.equal(result.money.safetyToNextIncome, 'unconfirmed');
});
