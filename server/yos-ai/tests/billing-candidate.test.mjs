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
    body:'請求額：500円\n支払期限：2026/11/30'}),status:'verified'};
  assert.equal(shouldCreateMoneyEntry(c),true);
  assert.equal(shouldCreateMoneyEntry(c,[{idempotency_key:'gmail:id-1'}]),false);
});
