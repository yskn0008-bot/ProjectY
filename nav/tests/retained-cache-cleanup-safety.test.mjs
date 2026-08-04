import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const extractBetween = (source, startToken, endToken, message) => {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, message);
  return source.slice(start, end);
};

const selectPreviousBlock = extractBetween(
  serviceWorker,
  'const selectPreviousCache = async keys => {',
  '\nconst isAllowedServingCache =',
  '旧世代キャッシュ選択処理を取得できません'
);

const cleanupBlock = extractBetween(
  serviceWorker,
  'const cleanupStaleCaches = async () => {',
  '\nconst serveNavigation = async',
  '旧キャッシュ整理処理を取得できません'
);

test('旧世代候補はYOSナビ専用prefix・現行未満・世代番号付きだけに限定する', () => {
  assert.match(selectPreviousBlock, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(selectPreviousBlock, /key !== CACHE/);
  assert.match(selectPreviousBlock, /cacheBuildNumber\(key\) >= 0/);
  assert.match(selectPreviousBlock, /cacheBuildNumber\(key\) < CURRENT_BUILD_NUMBER/);
});

test('旧世代候補は新しい順に検証し最初の完全な1世代だけを保持対象にする', () => {
  assert.match(selectPreviousBlock, /\.sort\(\(a, b\) => cacheBuildNumber\(b\) - cacheBuildNumber\(a\)\)/);
  assert.match(selectPreviousBlock, /for \(const key of candidates\)/);
  assert.match(selectPreviousBlock, /if \(await isValidRetainedCache\(key\)\) return key/);
  assert.match(selectPreviousBlock, /return null/);
});

test('整理は現行と検証済み旧1世代を残しYOSナビ以外のキャッシュを削除しない', () => {
  assert.match(cleanupBlock, /const previousCache = await selectPreviousCache\(keys\)/);
  assert.match(cleanupBlock, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE && key !== previousCache/);
  assert.match(cleanupBlock, /caches\.delete\(key\)/);
  assert.doesNotMatch(cleanupBlock, /keys\.filter\(key => key !== CACHE/);
  assert.doesNotMatch(cleanupBlock, /caches\.delete\((?:CACHE|previousCache)\)/);
});

test('画面単位の配信先記録は現行・保持旧世代・ネットワーク固定だけを残す', () => {
  assert.match(cleanupBlock, /for \(const \[clientId, key\] of CLIENT_SERVING_CACHES\)/);
  assert.match(cleanupBlock, /!isNetworkServingPin\(key\) && key !== CACHE && key !== previousCache/);
  assert.match(cleanupBlock, /CLIENT_SERVING_CACHES\.delete\(clientId\)/);
  assert.doesNotMatch(cleanupBlock, /CLIENT_SERVING_CACHES\.clear\(\)/);
});

test('旧キャッシュ整理から担当外機能・永続データ・外部遷移へ介入しない', () => {
  const scope = `${selectPreviousBlock}\n${cleanupBlock}`;
  assert.doesNotMatch(scope, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
  assert.doesNotMatch(scope, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(scope, /location\.(?:assign|replace|reload)|window\.open/);
});
