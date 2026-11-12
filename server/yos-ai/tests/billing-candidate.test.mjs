import test from 'node:test';
import assert from 'node:assert/strict';
import {extractBillingCandidate, shouldCreateMoneyEntry} from '../lib/billing-candidate.mjs';

test('extracts unverified candidate, never automatically creates Money entry', () => {
  const c = extractBillingCandidate({sourceId:'message-1',sender:'billing@example.jp',
    subject:'ご請求のお知らせ',body:'請求金額：12,000円\n支払期限：2026/11/25'});
  assert.equal(c.amount_yen,12000);
  assert.equal(c.due_date,'2026-11-25');
  assert.equal(c.status,'unverified');
  assert.equal(shouldCreateMoneyEntry(c),false);
});
test('does not treat ads and receipts as bills', () => {
  assert.equal(extractBillingCandidate({sourceId:'ad',subject:'請求キャンペーン',body:'請求額：1000円'}),null);
  assert.equal(extractBillingCandidate({sourceId:'paid',subject:'お支払い完了',body:'請求額：1000円'}),null);
});
test('ambiguous total and missing date stay unresolved', () => {
  const c=extractBillingCandidate({sourceId:'debt',subject:'督促のお知らせ',
    body:'請求額：10,000円\n延滞金額：2,000円'});
  assert.equal(c.amount_yen,null);
  assert.equal(c.due_date,null);
  assert.equal(c.category,'debt_or_collection_review');
});
test('invalid dates are not accepted', () => {
  const c=extractBillingCandidate({sourceId:'invalid',subject:'請求',body:'請求額：500円\n支払期限：2026/02/31'});
  assert.equal(c.due_date,null);
});
test('verified candidates require deduplication', () => {
  const c={...extractBillingCandidate({sourceId:'id-1',subject:'請求',
    body:'請求額：500円\n支払期限：2026/11/30'}),status:'verified',requires_review:false};
  assert.equal(shouldCreateMoneyEntry(c),true);
  assert.equal(shouldCreateMoneyEntry(c,[{idempotency_key:'gmail:id-1'}]),false);
});

test('a status flag alone cannot clear review or supply a missing source/date identity', () => {
  const c={...extractBillingCandidate({sourceId:'id-2',subject:'請求',
    body:'請求額：500円\n支払期限：2026/11/30'}),status:'verified'};
  assert.equal(shouldCreateMoneyEntry(c),false);
  const verified={...c,requires_review:false};
  for(const changed of [{source_id:''},{idempotency_key:''},{schema:'other'},
    {due_date:'2026-02-31'},{due_date:'2026-11-301'}])
    assert.equal(shouldCreateMoneyEntry({...verified,...changed}),false);
  assert.equal(shouldCreateMoneyEntry(verified,null),false);
});

test('a new message ID with the same sender, amount and deadline requires duplicate review', () => {
  const c={...extractBillingCandidate({sourceId:'reminder-2',sender:'billing@example.jp',subject:'請求',
    body:'請求額：500円\n支払期限：2026/11/30'}),status:'verified',requires_review:false};
  assert.equal(shouldCreateMoneyEntry(c,[{idempotency_key:'gmail:original-1',sender:'BILLING@example.jp',
    amount_yen:500,due_date:'2026-11-30'}]),false);
});

test('malformed or overlong numeric tokens are never truncated into a payable amount or date', () => {
  for(const amount of ['123456789012','1,23','1,234,56']) {
    const c=extractBillingCandidate({sourceId:'bad',subject:'請求',
      body:'請求額：'+amount+'円\n支払期限：2026/11/301'});
    assert.equal(c.amount_yen,null,amount);
    assert.equal(c.due_date,null);
  }
  assert.equal(extractBillingCandidate(null),null);
});
