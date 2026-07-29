import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleDriveClient } from '../dist/sources/google-drive-client.js';
import { GoogleSheetsClient } from '../dist/sources/google-sheets-client.js';

const response = (body, status = 200, headers = { 'content-type': 'application/json' }) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

test('GoogleDriveClient exports text with bearer auth', async () => {
  let seen;
  const client = new GoogleDriveClient(async (input, init) => {
    seen = { url: String(input), init };
    return response('master text', 200, { 'content-type': 'text/plain' });
  });
  const text = await client.exportText('doc id', 'token');
  assert.equal(text, 'master text');
  assert.match(seen.url, /files\/doc%20id\/export/);
  assert.equal(seen.init.headers.Authorization, 'Bearer token');
});

test('GoogleSheetsClient requests bounded ranges', async () => {
  let seenUrl = '';
  const client = new GoogleSheetsClient(async (input) => {
    seenUrl = String(input);
    return response({ spreadsheetId: 'sheet', valueRanges: [] });
  });
  await client.batchGet('sheet', ["'乗車履歴'!A1:J20", "'乗務日報'!A1:F5"], 'token');
  assert.match(seenUrl, /values:batchGet/);
  assert.match(seenUrl, /ranges=/);
  assert.match(seenUrl, /valueRenderOption=FORMATTED_VALUE/);
});
