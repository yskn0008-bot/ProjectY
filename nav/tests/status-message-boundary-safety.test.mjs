import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const messageMatch = serviceWorker.match(
  /self\.addEventListener\('message', event => \{([\s\S]*?)\n\}\);\nself\.addEventListener\('fetch'/
);
assert.ok(messageMatch, 'messageイベント処理を取得できません');
const messageBlock = messageMatch[1];

const indexOfOrFail = (token, message) => {
  const index = messageBlock.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビは専用の状態要求だけを処理し返信ポートがない要求を無視する', () => {
  assert.match(messageBlock, /if \(event\.data\?\.type !== 'YOS_NAV_STATUS_REQUEST'\) return;/);
  assert.match(messageBlock, /const replyPort = event\.ports\?\.\[0\];/);
  assert.match(messageBlock, /if \(!replyPort\) return;/);

  const typeGuard = indexOfOrFail("event.data?.type !== 'YOS_NAV_STATUS_REQUEST'", '専用要求種別の確認がありません');
  const portGuard = indexOfOrFail('if (!replyPort) return;', '返信ポートの確認がありません');
  const inspect = indexOfOrFail('getOfflineCacheStatus()', '状態検査がありません');
  assert.ok(typeGuard < portGuard && portGuard < inspect, '入力境界の確認前に状態検査を開始しています');
});

test('状態応答は要求元画面の固定だけを参照し全画面の固定情報を公開しない', () => {
  assert.match(messageBlock, /event\.source\?\.id \? CLIENT_SERVING_CACHES\.get\(event\.source\.id\) \|\| null : null/);
  assert.match(messageBlock, /pinnedServingNetwork = isNetworkServingPin\(pinnedServingTarget\)/);
  assert.match(messageBlock, /pinnedServingCache = pinnedServingNetwork \? null : pinnedServingTarget/);
  assert.doesNotMatch(messageBlock, /Array\.from\(CLIENT_SERVING_CACHES|\.entries\(\)|\.values\(\)/);
  assert.doesNotMatch(messageBlock, /CLIENT_SERVING_CACHES\.(?:set|clear)\(/);
});

test('状態応答は検査と終了画面整理をwaitUntil内で完了してから返す', () => {
  assert.match(messageBlock, /event\.waitUntil\(Promise\.all\(\[getOfflineCacheStatus\(\), caches\.keys\(\), pruneClientServingCaches\(\)\]\)/);
  assert.match(messageBlock, /replyPort\.postMessage\(\{/);
  assert.match(messageBlock, /pinnedClientCount/);

  const wait = indexOfOrFail('event.waitUntil(', 'waitUntilがありません');
  const prune = indexOfOrFail('pruneClientServingCaches()', '終了画面整理がありません');
  const reply = indexOfOrFail('replyPort.postMessage({', '状態応答がありません');
  assert.ok(wait < prune && prune < reply, '終了画面整理前に状態を返しています');
});

test('状態検査失敗時は安全な固定値を返しエラー詳細を外部へ漏らさない', () => {
  assert.match(messageBlock, /\.catch\(\(\) => replyPort\.postMessage\(\{/);
  assert.match(messageBlock, /offlineReady: false/);
  assert.match(messageBlock, /invalidCriticalAssets: \['status-unavailable'\]/);
  assert.doesNotMatch(messageBlock, /error\.message|error\.stack|String\(error\)/);
});

test('状態応答処理は担当外機能を直接参照または変更しない', () => {
  assert.doesNotMatch(messageBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
  assert.doesNotMatch(messageBlock, /taxi-|life-|hj-|hero/i);
  assert.doesNotMatch(messageBlock, /caches\.delete\(|cache\.put\(|fetch\(/);
});
