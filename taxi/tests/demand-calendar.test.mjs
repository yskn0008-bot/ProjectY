import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const jsonPath = new URL('../demand-calendar-v1.json', import.meta.url);
const htmlPath = new URL('../demand-calendar.html', import.meta.url);
const allowedConfidence = new Set(['confirmed', 'provisional', 'unverified']);
const allowedDemand = new Set(['high', 'medium', 'low']);

test('旧イベントデータは保存し、旧日付の需要を現在の表示から除外する', async () => {
  const data = JSON.parse(await readFile(jsonPath, 'utf8'));
  assert.equal(data.version, 2);
  assert.ok(Array.isArray(data.events));
  assert.ok(data.events.length > 0);
  for (const event of data.events) {
    assert.match(event.id, /^2026-/);
    assert.ok(/^2026-\d{2}-\d{2}$/.test(event.date));
    assert.ok(event.title && event.area && event.venue);
    assert.ok(allowedDemand.has(event.demandLevel));
    assert.ok(allowedConfidence.has(event.confidence));
    assert.match(event.sourceUrl, /^https:\/\//);
    assert.ok(event.sourceCheckedAt);
    assert.ok(Array.isArray(event.demandWindows));
  }
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /filter\(e=>e\.endDate\?e\.endDate>=jstToday\(\):e\.date>=jstToday\(\)\)/);
});

test('那覇中心の営業前需要情報は公式と速報を区別する', async () => {
  const data = JSON.parse(await readFile(jsonPath, 'utf8'));
  const sources = data.liveSources;
  assert.equal(sources.length, 7);
  assert.equal(sources.filter(s => s.role === '速報').length, 2);
  assert.equal(sources.filter(s => s.role !== '速報').length, 5);
  assert.ok(sources.every(s => s.status === 'manual-check-required'));
  assert.ok(sources.every(s => s.confidence === 'unverified'));
  assert.ok(sources.every(s => /^https:\/\//.test(s.sourceUrl)));
  assert.equal(sources.find(s => s.type === 'cruise' && s.role !== '速報').sourceUrl, 'https://nacru.my.site.com/s/');
});

test('営業前画面は確認時刻を記録できるが確認行為を事実の確定としない', async () => {
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /demand-calendar-v1\.json/);
  assert.match(html, /CHECK_KEY='yos-taxi-source-checks-v1'/);
  assert.match(html, /90\*60000/);
  assert.match(html, /確認済みとして記録/);
  assert.match(html, /公式予定とXなどの速報/);
  assert.match(html, /情報の内容は未連携/);
  assert.match(html, /那覇中心/);
  assert.match(html, /¥600,000/);
  assert.match(html, /運転中の操作は禁止/);
  assert.match(html, /noopener/);
});
