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

const messageBlock = extractBetween(
  serviceWorker,
  "self.addEventListener('message', event => {",
  "\nself.addEventListener('fetch', event => {",
  'YOSナビ状態応答処理を取得できません'
);

test('状態要求はYOSナビ専用メッセージと返信ポートがある場合だけ処理する', () => {
  assert.match(messageBlock, /event\.data\?\.type !== 'YOS_NAV_STATUS_REQUEST'/);
  assert.match(messageBlock, /const replyPort = event\.ports\?\.\[0\]/);
  assert.match(messageBlock, /if \(!replyPort\) return/);
  assert.doesNotMatch(messageBlock, /event\.source\.postMessage|self\.clients\.matchAll[^;]*postMessage/);
});

test('画面固有の配信先は要求元client IDだけから取得する', () => {
  assert.match(messageBlock, /event\.source\?\.id \? CLIENT_SERVING_CACHES\.get\(event\.source\.id\) \|\| null : null/);
  assert.match(messageBlock, /pinnedServingNetwork = isNetworkServingPin\(pinnedServingTarget\)/);
  assert.match(messageBlock, /pinnedServingCache = pinnedServingNetwork \? null : pinnedServingTarget/);
  assert.doesNotMatch(messageBlock, /Array\.from\(CLIENT_SERVING_CACHES|\.entries\(\)|\.values\(\)/);
});

test('状態応答は必要な診断情報だけを返信し他画面IDや保存内容を露出しない', () => {
  assert.match(messageBlock, /replyPort\.postMessage\(\{/);
  assert.match(messageBlock, /build: BUILD/);
  assert.match(messageBlock, /offlineReady/);
  assert.match(messageBlock, /missingCriticalAssets/);
  assert.match(messageBlock, /invalidCriticalAssets/);
  assert.match(messageBlock, /pinnedServingCache/);
  assert.match(messageBlock, /pinnedServingNetwork/);
  assert.doesNotMatch(messageBlock, /clientId\s*:|activeIds|CLIENT_SERVING_CACHES\s*[,}]/);
  assert.doesNotMatch(messageBlock, /response\.text|cache\.match|localStorage|sessionStorage|indexedDB/);
});

test('状態取得失敗時も内部例外を公開せず固定形式の安全応答を返す', () => {
  assert.match(messageBlock, /\.catch\(\(\) => replyPort\.postMessage\(\{/);
  assert.match(messageBlock, /invalidCriticalAssets: \['status-unavailable'\]/);
  assert.match(messageBlock, /offlineReady: false/);
  assert.doesNotMatch(messageBlock, /error\.message|error\.stack|String\(error\)|console\./);
});

test('状態応答は担当外機能・永続データ・外部遷移を変更しない', () => {
  assert.doesNotMatch(messageBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
  assert.doesNotMatch(messageBlock, /cache\.(?:put|add|delete)|caches\.delete|localStorage\.(?:setItem|removeItem|clear)|sessionStorage\.(?:setItem|removeItem|clear)|indexedDB\.(?:deleteDatabase|open)/);
  assert.doesNotMatch(messageBlock, /location\.(?:assign|replace|reload)|window\.open/);
});
