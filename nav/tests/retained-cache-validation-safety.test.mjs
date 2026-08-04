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

const validationBlock = extractBetween(
  serviceWorker,
  'const isValidRetainedCache = async key => {',
  '\nconst selectPreviousCache = async keys => {',
  '保持キャッシュ検証処理を取得できません'
);

const servingSelectionBlock = extractBetween(
  serviceWorker,
  'const selectServingCache = async preferredCache => {',
  '\nconst getValidatedServingCacheResponse = async',
  '配信キャッシュ選択処理を取得できません'
);

test('保持候補は有効なYOSナビ世代番号を持つ場合だけ検証する', () => {
  assert.match(validationBlock, /const build = cacheBuild\(key\)/);
  assert.match(validationBlock, /if \(!build\) return false/);
  assert.doesNotMatch(validationBlock, /CACHE_PREFIX\s*=|key\.replace|parseInt\(key/);
});

test('保持候補は全重要資産を候補世代として検証し1件でも不正なら拒否する', () => {
  assert.match(validationBlock, /const cache = await caches\.open\(key\)/);
  assert.match(validationBlock, /for \(const src of CRITICAL_ASSETS\)/);
  assert.match(validationBlock, /inspectCachedAsset\(cache, src, build\)/);
  assert.match(validationBlock, /if \(await inspectCachedAsset\(cache, src, build\)\) return false/);
  assert.match(validationBlock, /return true/);

  const openIndex = validationBlock.indexOf('caches.open(key)');
  const inspectIndex = validationBlock.indexOf('inspectCachedAsset(cache, src, build)');
  const acceptIndex = validationBlock.lastIndexOf('return true');
  assert.ok(openIndex >= 0 && inspectIndex > openIndex && acceptIndex > inspectIndex,
    '全重要資産の検証前に保持候補を採用しています');
});

test('保持候補の読取失敗は安全側で拒否し例外を外へ広げない', () => {
  assert.match(validationBlock, /catch \(error\) \{/);
  assert.match(validationBlock, /return false/);
  assert.doesNotMatch(validationBlock, /throw error|console\.|postMessage\(/);
});

test('画面の優先キャッシュも同じ完全性検証を通過した場合だけ採用する', () => {
  assert.match(servingSelectionBlock, /isAllowedServingCache\(preferredCache\)/);
  assert.match(servingSelectionBlock, /await isValidRetainedCache\(preferredCache\)/);
  assert.match(servingSelectionBlock, /if \(currentStatus\.offlineReady\) return CACHE/);
  assert.match(servingSelectionBlock, /return selectPreviousCache\(await caches\.keys\(\)\)/);

  const preferredIndex = servingSelectionBlock.indexOf('isValidRetainedCache(preferredCache)');
  const currentIndex = servingSelectionBlock.indexOf('getOfflineCacheStatus()');
  const previousIndex = servingSelectionBlock.indexOf('selectPreviousCache(await caches.keys())');
  assert.ok(preferredIndex >= 0 && currentIndex > preferredIndex && previousIndex > currentIndex,
    '優先候補、現行、検証済み旧世代の選択順序が崩れています');
});

test('保持キャッシュ検証は担当外機能・永続データ・外部遷移を変更しない', () => {
  const scope = `${validationBlock}\n${servingSelectionBlock}`;
  assert.doesNotMatch(scope, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
  assert.doesNotMatch(scope, /cache\.(?:put|add|delete)|caches\.delete|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(scope, /location\.(?:assign|replace|reload)|window\.open/);
});
