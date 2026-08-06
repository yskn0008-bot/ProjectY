import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const jsonPath = new URL('../demand-calendar-v1.json', import.meta.url);
const htmlPath = new URL('../demand-calendar.html', import.meta.url);

const allowedConfidence = new Set(['confirmed', 'provisional', 'unverified']);
const allowedDemand = new Set(['high', 'medium', 'low']);

test('需要カレンダーJSONは必須項目と公式根拠を持つ', async () => {
  const data = JSON.parse(await readFile(jsonPath, 'utf8'));
  assert.equal(data.version, 1);
  assert.ok(Array.isArray(data.events));
  assert.ok(data.events.length > 0);
  for (const event of data.events) {
    assert.match(event.id, /^2026-/);
    assert.match(event.date, /^2026-08-\d{2}$/);
    assert.ok(event.title);
    assert.ok(event.area);
    assert.ok(event.venue);
    assert.ok(allowedDemand.has(event.demandLevel));
    assert.ok(allowedConfidence.has(event.confidence));
    assert.equal(event.confidence, 'confirmed');
    assert.match(event.sourceUrl, /^https:\/\//);
    assert.match(event.sourceCheckedAt, /^2026-08-\d{2}$/);
    assert.ok(Array.isArray(event.demandWindows));
  }
});

test('需要カレンダー画面はJSONと公式リンクを読み込む', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /demand-calendar-v1\.json/);
  assert.match(html, /公式情報を確認/);
  assert.match(html, /運転中の操作は禁止/);
  assert.match(html, /noopener/);
});

test('クルーズ予定は当日確認導線として保持する', async () => {
  const data = JSON.parse(await readFile(jsonPath, 'utf8'));
  const cruise = data.liveSources.find((source) => source.type === 'cruise');
  assert.ok(cruise);
  assert.equal(cruise.status, 'manual-check-required');
  assert.equal(cruise.confidence, 'confirmed');
  assert.match(cruise.sourceUrl, /nahaport\.jp/);
});
