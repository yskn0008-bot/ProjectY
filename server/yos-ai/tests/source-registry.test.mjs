import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceRegistry} from '../dist/runtime/source-registry.js';
import {inspectBoundedA1Range} from '../dist/sources/a1-range.js';

const config = {
  openAiApiKey: 'secret',
  openAiModel: 'gpt-5.6-terra',
  googleClientId: 'client',
  allowedOrigins: ['https://yos.example'],
  allowedSubjectHash: 'hash',
  googleWorkloadAuth: {
    mode: 'vercel_oidc',
    projectNumber: '123456789012',
    workloadIdentityPoolId: 'vercel-pool',
    workloadIdentityProviderId: 'vercel-provider',
    serviceAccountEmail: 'yos-reader@example-project.iam.gserviceaccount.com'
  },
  sourceIds: {
    law: 'abcdefghijk1',
    yosMaster: 'abcdefghijk2',
    changeLog: 'abcdefghijk3',
    systemMaster: 'abcdefghijk4',
    taxiMaster: 'abcdefghijk5',
    project75: 'abcdefghijk6'
  },
  limits: {
    requestsPerHour: 30,
    maxOutputTokens: 5000,
    liveMaxOutputTokens: 1500,
    maxContextCharacters: 100000,
    maxDocumentCharacters: 30000
  }
};

test('uses bounded privacy-minimized Project75 ranges', () => {
  const entries = createSourceRegistry(config);
  const sheets = entries.filter((entry) => entry.type === 'sheet');
  assert.ok(sheets.length >= 5);
  for (const entry of sheets) {
    for (const range of entry.ranges) {
      assert.ok(inspectBoundedA1Range(range).cells <= 10_000);
    }
  }

  const daily = sheets.find((entry) => entry.id === 'project75_daily');
  const trips = sheets.find((entry) => entry.id === 'project75_trip_history');
  assert.deepEqual(daily.ranges, ["'乗務日報'!A1:AE50"]);
  assert.deepEqual(trips.ranges, ["'乗車履歴'!A1:AC200"]);
  assert.equal(daily.ranges.some((range) => range.includes('AF')), false);
  assert.equal(trips.ranges.some((range) => range.includes('AD')), false);
});
