import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDomain } from '../dist/domain-router.js';

const cases = [
  ['営業中。今どこへ向かう？', 'taxi-live', true],
  ['今日の営業戦略を作って', 'taxi-pre', false],
  ['日報を振り返って', 'taxi-post', false],
  ['ProjectYのAPI設計', 'system', false],
  ['日本語を韓国語に通訳', 'translation', false],
  ['人生全体で考えて', 'yos', false]
];

for (const [text, expectedDomain, expectedLive] of cases) {
  test(`route: ${text}`, () => {
    const result = routeDomain(text);
    assert.equal(result.primary, expectedDomain);
    assert.equal(result.liveMode, expectedLive);
  });
}
