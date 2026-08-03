import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const pruneMatch = serviceWorker.match(
  /const pruneClientServingCaches = async \(\) => \{([\s\S]*?)\n\};\nconst cleanupStaleCaches/
);
assert.ok(pruneMatch, 'pruneClientServingCaches関数を取得できません');
const pruneBlock = pruneMatch[1];

const indexOfOrFail = (token, message) => {
  const index = pruneBlock.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビはwindowクライアントの現在一覧を取得してから固定解除を判断する', () => {
  assert.match(pruneBlock, /self\.clients\.matchAll\(\{type: 'window', includeUncontrolled: true\}\)/);
  assert.match(pruneBlock, /new Set\(activeClients\.map\(client => client\.id\)\)/);

  const list = indexOfOrFail('self.clients.matchAll', 'windowクライアント一覧取得がありません');
  const activeIds = indexOfOrFail('new Set(activeClients.map(client => client.id))', '有効クライアントID集合の作成がありません');
  const remove = indexOfOrFail('CLIENT_SERVING_CACHES.delete(clientId)', '終了画面の固定解除がありません');
  assert.ok(list < activeIds && activeIds < remove, '有効画面の確認前に固定解除しています');
});

test('終了した画面の固定だけを解除し稼働中画面の固定を維持する', () => {
  assert.match(pruneBlock, /for \(const clientId of CLIENT_SERVING_CACHES\.keys\(\)\)/);
  assert.match(pruneBlock, /if \(!activeIds\.has\(clientId\)\) CLIENT_SERVING_CACHES\.delete\(clientId\)/);
  assert.doesNotMatch(pruneBlock, /CLIENT_SERVING_CACHES\.clear\(\)/);
  assert.doesNotMatch(pruneBlock, /CLIENT_SERVING_CACHES\.delete\(clientId\)(?![^\n]*!activeIds\.has)/);
});

test('固定解除処理はキャッシュ本体やService Worker状態を変更しない', () => {
  assert.doesNotMatch(pruneBlock, /caches\.|cache\.|fetch\(|skipWaiting|clients\.claim|registration\.unregister/);
  assert.doesNotMatch(pruneBlock, /CLIENT_SERVING_CACHES\.(?:set|clear)\(/);
});

test('担当外のTaxi・Life・YOS・serverを直接参照しない', () => {
  assert.doesNotMatch(pruneBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
  assert.doesNotMatch(pruneBlock, /taxi-|life-|hj-|hero/i);
});

test('固定解除後の残存数だけを診断値として返す', () => {
  assert.match(pruneBlock, /return CLIENT_SERVING_CACHES\.size/);
});
