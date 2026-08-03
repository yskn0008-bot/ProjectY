import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const installMatch = serviceWorker.match(
  /self\.addEventListener\('install', event => event\.waitUntil\(([\s\S]*?)\n\)\);\n\nself\.addEventListener\('activate'/
);
assert.ok(installMatch, 'installイベント処理を取得できません');
const installBlock = installMatch[1];

const indexOfOrFail = (token, message) => {
  const index = installBlock.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビは現行キャッシュへ全重要資産を検証保存してから有効化する', () => {
  assert.match(installBlock, /caches\.open\(CACHE\)/);
  assert.match(installBlock, /cacheCriticalAssets\(cache\)/);
  assert.match(installBlock, /getOfflineCacheStatus\(\)/);
  assert.match(installBlock, /if \(!status\.offlineReady\) throw new Error\('offline-cache-incomplete'\)/);
  assert.match(installBlock, /return self\.skipWaiting\(\)/);

  const cacheAssets = indexOfOrFail('cacheCriticalAssets(cache)', '重要資産保存がありません');
  const verifyOffline = indexOfOrFail('getOfflineCacheStatus()', 'オフライン完成検査がありません');
  const activate = indexOfOrFail('self.skipWaiting()', '検証後の有効化がありません');
  assert.ok(cacheAssets < verifyOffline && verifyOffline < activate, '保存・完成検査・有効化の順序が崩れています');
});

test('インストール失敗時は不完全な現行キャッシュだけを削除して失敗を維持する', () => {
  assert.match(installBlock, /\.catch\(async error => \{/);
  assert.match(installBlock, /await caches\.delete\(CACHE\)/);
  assert.match(installBlock, /throw error/);
  assert.doesNotMatch(installBlock, /caches\.keys\(|CACHE_PREFIX|previousCache/);
  assert.doesNotMatch(installBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);

  const removeIncomplete = indexOfOrFail('await caches.delete(CACHE)', '不完全キャッシュ削除がありません');
  const rethrow = indexOfOrFail('throw error', '失敗の再送出がありません');
  assert.ok(removeIncomplete < rethrow, '不完全キャッシュ削除前に失敗を終了しています');
});

test('インストール中に担当外キャッシュや保存済み退避キャッシュを変更しない', () => {
  assert.doesNotMatch(installBlock, /CLIENT_SERVING_CACHES\.(?:clear|delete|set)/);
  assert.doesNotMatch(installBlock, /cleanupStaleCaches\(|selectPreviousCache\(/);
  assert.doesNotMatch(installBlock, /caches\.delete\((?!CACHE\))/);
});
