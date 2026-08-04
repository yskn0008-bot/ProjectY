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

const installBlock = extractBetween(
  serviceWorker,
  "self.addEventListener('install'",
  "self.addEventListener('activate'",
  'install処理を取得できません'
);

const activateBlock = extractBetween(
  serviceWorker,
  "self.addEventListener('activate'",
  "self.addEventListener('message'",
  'activate処理を取得できません'
);

test('YOSナビは全重要資産を検証済みキャッシュへ保存した後だけ待機解除する', () => {
  assert.match(installBlock, /caches\.open\(CACHE\)/);
  assert.match(installBlock, /\.then\(cache => cacheCriticalAssets\(cache\)\)/);
  assert.match(installBlock, /\.then\(\(\) => getOfflineCacheStatus\(\)\)/);
  assert.match(installBlock, /if \(!status\.offlineReady\) throw new Error\('offline-cache-incomplete'\)/);
  assert.match(installBlock, /return self\.skipWaiting\(\)/);

  const cacheIndex = installBlock.indexOf('cacheCriticalAssets');
  const statusIndex = installBlock.indexOf('getOfflineCacheStatus');
  const readyIndex = installBlock.indexOf('status.offlineReady');
  const skipIndex = installBlock.indexOf('self.skipWaiting');
  assert.ok(cacheIndex >= 0 && statusIndex > cacheIndex && readyIndex > statusIndex && skipIndex > readyIndex,
    '重要資産の保存・検証より先に待機解除しています');
});

test('install失敗時は不完全な現行キャッシュだけを削除して失敗を隠さない', () => {
  assert.match(installBlock, /\.catch\(async error => \{/);
  assert.match(installBlock, /await caches\.delete\(CACHE\)/);
  assert.match(installBlock, /throw error/);
  assert.doesNotMatch(installBlock, /caches\.keys\(|CACHE_PREFIX|CLIENT_SERVING_CACHES|self\.clients\.claim/);

  const deleteIndex = installBlock.indexOf('await caches.delete(CACHE)');
  const throwIndex = installBlock.indexOf('throw error');
  assert.ok(deleteIndex >= 0 && throwIndex > deleteIndex,
    '不完全キャッシュ削除前にinstall失敗を終了しています');
});

test('activateは現行キャッシュの完全性を確認してからclaim・旧キャッシュ整理・終了画面整理を行う', () => {
  assert.match(activateBlock, /getOfflineCacheStatus\(\)/);
  assert.match(activateBlock, /if \(!status\.offlineReady\) throw new Error\('offline-cache-invalid-before-activate'\)/);
  assert.match(activateBlock, /return self\.clients\.claim\(\)/);
  assert.match(activateBlock, /\.then\(\(\) => cleanupStaleCaches\(\)\)/);
  assert.match(activateBlock, /\.then\(\(\) => pruneClientServingCaches\(\)\)/);

  const statusIndex = activateBlock.indexOf('getOfflineCacheStatus');
  const readyIndex = activateBlock.indexOf('status.offlineReady');
  const claimIndex = activateBlock.indexOf('self.clients.claim');
  const cleanupIndex = activateBlock.indexOf('cleanupStaleCaches');
  const pruneIndex = activateBlock.indexOf('pruneClientServingCaches');
  assert.ok(statusIndex >= 0 && readyIndex > statusIndex && claimIndex > readyIndex && cleanupIndex > claimIndex && pruneIndex > cleanupIndex,
    '完全性確認、claim、旧キャッシュ整理、終了画面整理の順序が崩れています');
});

test('install・activate境界は担当外機能や永続データへ介入しない', () => {
  const transaction = `${installBlock}\n${activateBlock}`;
  assert.doesNotMatch(transaction, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
  assert.doesNotMatch(transaction, /indexedDB|localStorage|sessionStorage|window\.open|location\.(?:href|assign|replace)/);
  assert.doesNotMatch(transaction, /fetch\([^)]*(?:taxi|life|yos|server)/i);
});
