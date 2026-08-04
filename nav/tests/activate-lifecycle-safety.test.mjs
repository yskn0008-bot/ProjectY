import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const activateMatch = serviceWorker.match(
  /self\.addEventListener\('activate', event => event\.waitUntil\(([\s\S]*?)\n\)\);\s*self\.addEventListener\('message'/
);
assert.ok(activateMatch, 'activateイベント処理を取得できません');
const activateBlock = activateMatch[1];

const indexOfOrFail = (token, message) => {
  const index = activateBlock.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビはオフライン完成確認後だけ新Service Workerを画面へ適用する', () => {
  assert.match(activateBlock, /getOfflineCacheStatus\(\)/);
  assert.match(activateBlock, /if \(!status\.offlineReady\) throw new Error\('offline-cache-invalid-before-activate'\);/);
  assert.match(activateBlock, /return self\.clients\.claim\(\);/);

  const inspect = indexOfOrFail('getOfflineCacheStatus()', 'オフライン完成確認がありません');
  const rejectInvalid = indexOfOrFail("if (!status.offlineReady) throw new Error('offline-cache-invalid-before-activate');", '不完全キャッシュの拒否がありません');
  const claim = indexOfOrFail('self.clients.claim()', '画面への適用処理がありません');
  assert.ok(inspect < rejectInvalid && rejectInvalid < claim, '完成確認前に新Service Workerを画面へ適用しています');
});

test('YOSナビは画面適用後に専用キャッシュ整理と終了画面の固定解除を順序実行する', () => {
  const claim = indexOfOrFail('self.clients.claim()', '画面への適用処理がありません');
  const cleanup = indexOfOrFail('cleanupStaleCaches()', 'YOSナビ専用キャッシュ整理がありません');
  const prune = indexOfOrFail('pruneClientServingCaches()', '終了画面の配信先固定解除がありません');
  assert.ok(claim < cleanup && cleanup < prune, 'activate時の安全処理順序が崩れています');
});

test('activate処理は担当外のパスやキャッシュを直接操作しない', () => {
  assert.doesNotMatch(activateBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
  assert.doesNotMatch(activateBlock, /caches\.delete\(|cache\.delete\(/);
  assert.doesNotMatch(activateBlock, /CLIENT_SERVING_CACHES\.(?:set|clear)/);
  assert.match(activateBlock, /cleanupStaleCaches\(\)/);
  assert.match(activateBlock, /pruneClientServingCaches\(\)/);
});
