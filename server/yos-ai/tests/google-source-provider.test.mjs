import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleSourceProvider } from '../dist/sources/google-source-provider.js';

const drive = {
  async getMetadata(fileId) { return { id: fileId, name: fileId, mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-07-29T00:00:00Z' }; },
  async exportText(fileId) { return `content:${fileId}`; }
};
const sheets = {
  async batchGet(spreadsheetId, ranges) { return { spreadsheetId, valueRanges: ranges.map((range) => ({ range, values: [['x']] })) }; }
};

const registry = [
  { id: '00_law', type: 'document', fileId: 'law', title: '00_律法', kind: 'law', priority: 1, privacyLevel: 'L1' },
  { id: '02_yos_master', type: 'document', fileId: 'master', title: '02_YOS Master', kind: 'master', priority: 2, privacyLevel: 'L1' },
  { id: '00_change_log', type: 'document', fileId: 'log', title: '00_Change Log', kind: 'change-log', priority: 4, privacyLevel: 'L1' },
  { id: '03_taxi_master', type: 'document', fileId: 'taxi', title: '03_Taxi Master', kind: 'master', priority: 5, privacyLevel: 'L1' },
  { id: 'project75_daily', type: 'sheet', spreadsheetId: 'p75', ranges: ["'乗務日報'!A1:F20"], title: 'Project75日報', kind: 'sheet', priority: 7, privacyLevel: 'L2' },
  { id: 'project75_trip_history', type: 'sheet', spreadsheetId: 'p75', ranges: ["'乗車履歴'!A1:J100"], title: 'Project75乗車履歴', kind: 'sheet', priority: 7, privacyLevel: 'L2' }
];

test('provider loads core and route-specific sources', async () => {
  const provider = new GoogleSourceProvider(drive, sheets, { accessToken: 'token', registry });
  const core = await provider.loadCoreSources();
  const domain = await provider.loadDomainSources({ primary: 'taxi-live', related: [], liveMode: true, reasons: [] }, { requestId: 'r', userText: '営業中', currentTime: '2026-07-29T00:00:00Z' });
  assert.deepEqual(core.map((item) => item.source.id), ['00_law', '02_yos_master', '00_change_log']);
  assert.ok(domain.some((item) => item.source.id === '03_taxi_master'));
  assert.ok(domain.some((item) => item.source.id === 'project75_trip_history'));
});

test('provider marks unconfigured required source as unknown', async () => {
  const provider = new GoogleSourceProvider(drive, sheets, { accessToken: 'token', registry: registry.slice(0, 3) });
  const domain = await provider.loadDomainSources({ primary: 'life', related: [], liveMode: false, reasons: [] }, { requestId: 'r', userText: '健康', currentTime: '2026-07-29T00:00:00Z' });
  assert.equal(domain[0].retrievalStatus, 'missing');
  assert.match(domain[0].content, /未確認/);
});
