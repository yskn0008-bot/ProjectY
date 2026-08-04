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

const fetchBlock = extractBetween(
  serviceWorker,
  "self.addEventListener('fetch'",
  '\n});',
  'fetch処理を取得できません'
);

test('YOSナビはGET以外の要求へ介入しない', () => {
  assert.match(fetchBlock, /if \(event\.request\.method !== 'GET'\) return/);
  const methodIndex = fetchBlock.indexOf("event.request.method !== 'GET'");
  const urlIndex = fetchBlock.indexOf('new URL(event.request.url)');
  assert.ok(methodIndex >= 0 && urlIndex > methodIndex,
    'GET判定より先に要求URLや配信処理へ介入しています');
});

test('ナビゲーション失敗時は未検証キャッシュへ戻さず検証済みネットワーク応答か明示エラーだけを返す', () => {
  assert.match(fetchBlock, /event\.respondWith\(serveNavigation\(event\)\.catch\(\(\) => getValidatedNavigationResponse\(\)\.catch\(\(\) => Response\.error\(\)\)\)\)/);
  const navStart = fetchBlock.indexOf('if (isNavPage)');
  const navEnd = fetchBlock.indexOf('if (isApprovedRuntimeAsset', navStart);
  const navBranch = fetchBlock.slice(navStart, navEnd);
  assert.doesNotMatch(navBranch, /caches\.open|cache\.match|selectPreviousCache|CLIENT_SERVING_CACHES\.set/);
});

test('現行ネットワークマーカー付き資産は失敗時に旧キャッシュへフォールバックしない', () => {
  assert.match(fetchBlock, /const forceNetwork = isCurrentNetworkMarker\(marker\)/);
  assert.match(fetchBlock, /\.catch\(\(\) => forceNetwork \? Response\.error\(\) : getValidatedRuntimeResponse\(event\.request, relativePath\)\.catch\(\(\) => Response\.error\(\)\)\)/);
  const approvedStart = fetchBlock.indexOf('if (isApprovedRuntimeAsset');
  const approvedEnd = fetchBlock.indexOf('event.respondWith(fetch(event.request', approvedStart);
  const approvedBranch = fetchBlock.slice(approvedStart, approvedEnd);
  assert.doesNotMatch(approvedBranch, /forceNetwork\s*\?[^:]*(?:cache|selectPreviousCache|serveNavigation)/i);
});

test('旧世代マーカーは専用復旧応答で終了し通常資産配信へ流さない', () => {
  assert.match(fetchBlock, /if \(isStaleNetworkMarker\(marker\)\) \{/);
  assert.match(fetchBlock, /event\.respondWith\(Promise\.resolve\(createStaleMarkerRecoveryResponse\(marker\)\)\)/);
  const staleStart = fetchBlock.indexOf('if (isStaleNetworkMarker(marker))');
  const forceIndex = fetchBlock.indexOf('const forceNetwork', staleStart);
  const staleBranch = fetchBlock.slice(staleStart, forceIndex);
  assert.match(staleBranch, /return;/);
  assert.doesNotMatch(staleBranch, /serveApprovedAsset|getValidatedRuntimeResponse|caches\.open|cache\.match/);
});

test('担当外要求は保存領域や画面固定を変更せず通常fetchへ委譲する', () => {
  const passthroughStart = fetchBlock.lastIndexOf('event.respondWith(fetch(event.request');
  const passthrough = fetchBlock.slice(passthroughStart);
  assert.match(passthrough, /event\.respondWith\(fetch\(event\.request, \{cache: 'no-cache'\}\)\)/);
  assert.doesNotMatch(passthrough, /CLIENT_SERVING_CACHES|caches\.(?:open|delete)|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(fetchBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
});
