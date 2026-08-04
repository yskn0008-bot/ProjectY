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

const navigationBlock = extractBetween(
  serviceWorker,
  'const serveNavigation = async event => {',
  '\nconst serveApprovedAsset = async',
  'ナビゲーション配信処理を取得できません'
);

const assetBlock = extractBetween(
  serviceWorker,
  'const serveApprovedAsset = async',
  "\nself.addEventListener('install'",
  '承認済み資産配信処理を取得できません'
);

const pruneBlock = extractBetween(
  serviceWorker,
  'const pruneClientServingCaches = async () => {',
  '\nconst cleanupStaleCaches = async',
  '終了済み画面の整理処理を取得できません'
);

test('YOSナビは配信先を画面IDごとに保持し全画面の共有状態へ広げない', () => {
  assert.match(serviceWorker, /const CLIENT_SERVING_CACHES = new Map\(\)/);
  assert.doesNotMatch(serviceWorker, /let\s+(?:SERVING_CACHE|NETWORK_SERVING_PIN|preferredCache)\s*=/);
  assert.doesNotMatch(serviceWorker, /localStorage|indexedDB/);
});

test('ナビゲーションは新しい画面IDを優先し既存画面IDだけを代替に使う', () => {
  assert.match(navigationBlock, /const clientId = event\.resultingClientId \|\| event\.clientId \|\| null/);
  assert.match(navigationBlock, /CLIENT_SERVING_CACHES\.get\(clientId\)/);
  assert.match(navigationBlock, /CLIENT_SERVING_CACHES\.set\(clientId, result\.servingCache\)/);
  assert.match(navigationBlock, /CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/);
  assert.doesNotMatch(navigationBlock, /CLIENT_SERVING_CACHES\.(?:clear|forEach)/);
});

test('承認済み資産は要求元画面の固定だけを参照・更新する', () => {
  assert.match(assetBlock, /const clientId = event\.clientId \|\| null/);
  assert.match(assetBlock, /CLIENT_SERVING_CACHES\.get\(clientId\)/);
  assert.match(assetBlock, /CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/);
  assert.match(assetBlock, /CLIENT_SERVING_CACHES\.set\(clientId, result\.servingCache\)/);
  assert.doesNotMatch(assetBlock, /resultingClientId|CLIENT_SERVING_CACHES\.(?:clear|forEach)/);
});

test('終了済み画面の固定だけを削除し利用中画面の固定を保持する', () => {
  assert.match(pruneBlock, /self\.clients\.matchAll\(\{type: 'window', includeUncontrolled: true\}\)/);
  assert.match(pruneBlock, /const activeIds = new Set\(activeClients\.map\(client => client\.id\)\)/);
  assert.match(pruneBlock, /if \(!activeIds\.has\(clientId\)\) CLIENT_SERVING_CACHES\.delete\(clientId\)/);
  assert.doesNotMatch(pruneBlock, /CLIENT_SERVING_CACHES\.clear\(\)/);
  assert.doesNotMatch(pruneBlock, /caches\.(?:open|delete)|localStorage|indexedDB|sessionStorage/);
});

test('画面単位の固定処理から担当外機能へ介入しない', () => {
  const scope = `${navigationBlock}\n${assetBlock}\n${pruneBlock}`;
  assert.doesNotMatch(scope, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
  assert.doesNotMatch(scope, /location\.(?:assign|replace|reload)|window\.open/);
});
