import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredSourceIds } from '../dist/source-policy.js';

const baseRoute = { related: [], liveMode: false, reasons: [] };

test('all routes include core governance sources', () => {
  const ids = requiredSourceIds({ ...baseRoute, primary: 'life' });
  assert.deepEqual(ids.slice(0, 3), ['00_law', '02_yos_master', '00_change_log']);
});

test('taxi live route includes Taxi Master and Project75', () => {
  const ids = requiredSourceIds({ ...baseRoute, primary: 'taxi-live', liveMode: true });
  assert.ok(ids.includes('03_taxi_master'));
  assert.ok(ids.includes('project75_trip_history'));
});

test('system route includes System Master and code', () => {
  const ids = requiredSourceIds({ ...baseRoute, primary: 'system' });
  assert.ok(ids.includes('04_system_master'));
  assert.ok(ids.includes('projecty_code'));
});
