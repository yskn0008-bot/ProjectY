import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const cleanupMatch = serviceWorker.match(
  /const cleanupStaleCaches = async \(\) => \{([\s\S]*?)\n\};\nconst serveNavigation/
);
assert.ok(cleanupMatch, 'cleanupStaleCaches関数を取得できません');
const cleanupBlock = cleanupMatch[1];

const indexOfOrFail = (token, message) => {
  const index = cleanupBlock.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビは削除前に有効な直前キャッシュを選定する', () => {
  assert.match(cleanupBlock, /const keys = await caches\.keys\(\)/);
  assert.match(cleanupBlock, /const previousCache = await selectPreviousCache\(keys\)/);

  const list = indexOfOrFail('await caches.keys()', 'キャッシュ一覧取得がありません');
  const select = indexOfOrFail('await selectPreviousCache(keys)', '直前キャッシュ選定がありません');
  const remove = indexOfOrFail('caches.delete(key)', '古いキャッシュ削除がありません');
  assert.ok(list < select && select < remove, '直前キャッシュ選定前に削除しています');
});

test('YOSナビ専用の古いキャッシュだけを削除し現行と直前有効キャッシュを保持する', () => {
  assert.match(cleanupBlock, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(cleanupBlock, /key !== CACHE/);
  assert.match(cleanupBlock, /key !== previousCache/);
  assert.doesNotMatch(cleanupBlock, /caches\.delete\(CACHE\)/);
  assert.doesNotMatch(cleanupBlock, /caches\.delete\(previousCache\)/);
});

test('担当外キャッシュ名や担当外パスを直接参照しない', () => {
  assert.doesNotMatch(cleanupBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
  assert.doesNotMatch(cleanupBlock, /taxi-|life-|yos-/i);
  assert.doesNotMatch(cleanupBlock, /caches\.delete\((?:'|")/);
});

test('画面別配信先は保持対象外だけを解除しネットワーク固定を維持する', () => {
  assert.match(cleanupBlock, /for \(const \[clientId, key\] of CLIENT_SERVING_CACHES\)/);
  assert.match(cleanupBlock, /!isNetworkServingPin\(key\)/);
  assert.match(cleanupBlock, /key !== CACHE/);
  assert.match(cleanupBlock, /key !== previousCache/);
  assert.match(cleanupBlock, /CLIENT_SERVING_CACHES\.delete\(clientId\)/);
  assert.doesNotMatch(cleanupBlock, /CLIENT_SERVING_CACHES\.clear\(\)/);
});

test('整理結果として選定済みの直前キャッシュだけを返す', () => {
  assert.match(cleanupBlock, /return previousCache/);
});
