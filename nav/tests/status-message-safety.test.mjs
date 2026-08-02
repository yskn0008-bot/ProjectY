import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const messageBlockMatch = serviceWorker.match(/self\.addEventListener\('message', event => \{([\s\S]*?)\n\}\);\nself\.addEventListener\('fetch'/);
assert.ok(messageBlockMatch, 'messageイベント処理を取得できません');
const messageBlock = messageBlockMatch[1];

test('YOSナビ状態照会は専用メッセージ種別だけを受け付ける', () => {
  assert.match(messageBlock, /event\.data\?\.type !== 'YOS_NAV_STATUS_REQUEST'/);
  assert.doesNotMatch(messageBlock, /taxi|life/i);
});

test('状態照会は要求元が渡したMessagePortだけへ応答する', () => {
  assert.match(messageBlock, /const replyPort = event\.ports\?\.\[0\]/);
  assert.match(messageBlock, /if \(!replyPort\) return/);
  assert.match(messageBlock, /replyPort\.postMessage\(/);
  assert.doesNotMatch(messageBlock, /clients\.matchAll[\s\S]*postMessage|event\.source\.postMessage/);
});

test('状態照会処理はevent.waitUntilで完了まで保持される', () => {
  assert.match(messageBlock, /event\.waitUntil\(Promise\.all\(/);
  assert.match(messageBlock, /getOfflineCacheStatus\(\)/);
  assert.match(messageBlock, /caches\.keys\(\)/);
  assert.match(messageBlock, /pruneClientServingCaches\(\)/);
});

test('状態照会はキャッシュ内容や担当外資産を変更しない', () => {
  assert.doesNotMatch(messageBlock, /caches\.delete\(|cache\.put\(|cache\.add|fetch\(/);
  assert.doesNotMatch(messageBlock, /\/taxi\/|\/life\/|\/yos\//i);
});

test('状態取得失敗時は安全側の診断値だけを返す', () => {
  assert.match(messageBlock, /offlineReady: false/);
  assert.match(messageBlock, /servingCache: null/);
  assert.match(messageBlock, /servingFallback: false/);
  assert.match(messageBlock, /pinnedServingNetwork: false/);
  assert.match(messageBlock, /invalidCriticalAssets: \['status-unavailable'\]/);
});
