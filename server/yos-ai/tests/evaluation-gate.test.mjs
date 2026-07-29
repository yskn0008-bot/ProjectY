import test from 'node:test';
import assert from 'node:assert/strict';
import {routeDomain} from '../dist/domain-router.js';
import {validateGroundedFacts} from '../dist/grounding.js';
import {sanitizeText} from '../dist/privacy-filter.js';
import {requiredSourceIds} from '../dist/source-policy.js';

const routingCases = [
  ['通訳して', 'translation', false],
  ['ナビを開いて', 'navigation', false],
  ['営業中。今どこへ向かう？', 'taxi-live', true],
  ['営業前の戦略', 'taxi-pre', false],
  ['営業終了。日報を確認', 'taxi-post', false],
  ['Project75のKPIを研究', 'taxi-research', false],
  ['ProjectYのAPIを実装', 'system', false],
  ['家計と返済を整理', 'money', false],
  ['体調と生活を相談', 'life', false],
  ['アイデアを整理', 'idea', false],
  ['最新ニュースを検索', 'external', false],
  ['どうすればいい？', 'yos', false]
];

for (const [input, expectedDomain, expectedLiveMode] of routingCases) {
  test(`evaluation routing: ${input}`, () => {
    const route = routeDomain(input);
    assert.equal(route.primary, expectedDomain);
    assert.equal(route.liveMode, expectedLiveMode);
  });
}

test('evaluation sources: core sources are always included', () => {
  const ids = requiredSourceIds({primary: 'translation', related: [], liveMode: false, reasons: []});
  assert.deepEqual(ids, ['00_law', '02_yos_master', '00_change_log']);
});

test('evaluation sources: taxi live includes master and operational data', () => {
  const ids = requiredSourceIds({primary: 'taxi-live', related: [], liveMode: true, reasons: []});
  assert.ok(ids.includes('03_taxi_master'));
  assert.ok(ids.includes('project75_daily'));
  assert.ok(ids.includes('project75_trip_history'));
});

test('evaluation sources: system includes code and mission control', () => {
  const ids = requiredSourceIds({primary: 'system', related: [], liveMode: false, reasons: []});
  assert.ok(ids.includes('projecty_code'));
  assert.ok(ids.includes('mission_control'));
});

test('evaluation sources: related domains are included without duplicates', () => {
  const ids = requiredSourceIds({primary: 'system', related: ['taxi-research', 'system'], liveMode: false, reasons: []});
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.includes('project75_kpi'));
});

test('evaluation privacy: L4 content is blocked completely', () => {
  const result = sanitizeText('top secret', 'L4');
  assert.equal(result.blocked, true);
  assert.equal(result.content, '');
});

test('evaluation privacy: API keys are redacted', () => {
  const result = sanitizeText('sk-abcdefghijklmnopqrstuvwxyz123456', 'L2');
  assert.equal(result.blocked, false);
  assert.match(result.content, /REDACTED/);
  assert.doesNotMatch(result.content, /sk-abcdefghijklmnopqrstuvwxyz123456/);
});

test('evaluation privacy: normal source text is preserved', () => {
  const result = sanitizeText('安全を最優先する', 'L1');
  assert.equal(result.blocked, false);
  assert.equal(result.content, '安全を最優先する');
});

test('evaluation grounding: known source fact is accepted', () => {
  const result = validateGroundedFacts(
    [{text: '安全を最優先する', sourceIds: ['00_law']}],
    [{id: '00_law', title: '00_律法', kind: 'law', priority: 1}]
  );
  assert.equal(result.accepted.length, 1);
  assert.equal(result.rejected.length, 0);
});

test('evaluation grounding: source-free fact is rejected', () => {
  const result = validateGroundedFacts(
    [{text: '根拠のない断定', sourceIds: []}],
    [{id: '00_law', title: '00_律法', kind: 'law', priority: 1}]
  );
  assert.equal(result.accepted.length, 0);
  assert.match(result.rejected[0].reason, /根拠情報源がない/);
});

test('evaluation grounding: unknown source fact is rejected', () => {
  const result = validateGroundedFacts(
    [{text: '未知の根拠', sourceIds: ['unknown']}],
    [{id: '00_law', title: '00_律法', kind: 'law', priority: 1}]
  );
  assert.equal(result.accepted.length, 0);
  assert.match(result.rejected[0].reason, /未知の根拠情報源/);
});
