import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GOOGLE_READ_ONLY_SCOPES,
  GOOGLE_SHEETS_WRITE_SCOPES
} from '../dist/auth/google-runtime.js';

test('default YOS source access remains read-only', () => {
  assert.deepEqual(GOOGLE_READ_ONLY_SCOPES, [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly'
  ]);
});

test('Taxi live sync requests only the Sheets write scope', () => {
  assert.deepEqual(GOOGLE_SHEETS_WRITE_SCOPES, [
    'https://www.googleapis.com/auth/spreadsheets'
  ]);
  assert.equal(GOOGLE_SHEETS_WRITE_SCOPES.includes('https://www.googleapis.com/auth/drive'), false);
});
