import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const fetchMatch = serviceWorker.match(
  /self\.addEventListener\('fetch', event => \{([\s\S]*?)\n\}\);\s*$/
);
assert.ok(fetchMatch, 'fetchイベント処理を取得できません');
const fetchBlock = fetchMatch[1];

const approvedAssetStartToken = 'if (isApprovedRuntimeAsset(relativePath)) {';
const approvedAssetEndToken = "event.respondWith(fetch(event.request, {cache: 'no-cache'}));";
const approvedAssetStart = fetchBlock.indexOf(approvedAssetStartToken);
const approvedAssetEnd = fetchBlock.indexOf(approvedAssetEndToken, approvedAssetStart);
assert.ok(approvedAssetStart >= 0, '承認済み資産処理の開始位置を取得できません');
assert.ok(approvedAssetEnd > approvedAssetStart, '承認済み資産処理の終了位置を取得できません');
const approvedAssetBlock = fetchBlock.slice(approvedAssetStart, approvedAssetEnd);

const indexOfOrFail = (source, token, message) => {
  const index = source.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビはネットワークマーカーを専用query parameterからだけ取得する', () => {
  assert.match(serviceWorker, /const NETWORK_SOURCE_PARAM = 'yos-nav-source';/);
  assert.match(serviceWorker, /const networkSourceMarker = requestUrl => String\(requestUrl\.searchParams\.get\(NETWORK_SOURCE_PARAM\) \|\| ''\);/);
  assert.doesNotMatch(serviceWorker, /location\.(?:hash|pathname).*network|headers\.get\([^)]*network/i);
});

test('現行ネットワークマーカーは完全一致の場合だけ強制ネットワーク取得にする', () => {
  assert.match(serviceWorker, /const NETWORK_SOURCE_VALUE = `network-\$\{BUILD\}`;/);
  assert.match(serviceWorker, /const isCurrentNetworkMarker = marker => marker === NETWORK_SOURCE_VALUE;/);
  assert.match(approvedAssetBlock, /const forceNetwork = isCurrentNetworkMarker\(marker\);/);
  assert.match(approvedAssetBlock, /serveApprovedAsset\(event, relativePath, forceNetwork\)/);
  assert.doesNotMatch(approvedAssetBlock, /forceNetwork\s*=\s*Boolean\(marker\)|includes\(['"]network-|startsWith\(['"]network-/);
});

test('旧世代マーカーの復旧判定を強制ネットワーク判定より先に行う', () => {
  const readMarker = indexOfOrFail(approvedAssetBlock, 'networkSourceMarker(requestUrl)', 'マーカー取得がありません');
  const detectStale = indexOfOrFail(approvedAssetBlock, 'isStaleNetworkMarker(marker)', '旧世代判定がありません');
  const recoverStale = indexOfOrFail(approvedAssetBlock, 'createStaleMarkerRecoveryResponse(marker)', '旧世代復旧がありません');
  const detectCurrent = indexOfOrFail(approvedAssetBlock, 'isCurrentNetworkMarker(marker)', '現行世代判定がありません');
  const serveAsset = indexOfOrFail(approvedAssetBlock, 'serveApprovedAsset(event, relativePath, forceNetwork)', '資産配信がありません');
  assert.ok(readMarker < detectStale && detectStale < recoverStale && recoverStale < detectCurrent && detectCurrent < serveAsset,
    '旧世代復旧と現行マーカー判定の順序が安全条件と一致しません');
});

test('空・不正形式・未来形式のマーカーを強制ネットワークへ拡張しない', () => {
  assert.match(serviceWorker, /const isNetworkMarker = marker => \/\^network-v\\d\+\$\/.test\(marker\);/);
  assert.doesNotMatch(serviceWorker, /decodeURIComponent\(marker\)|JSON\.parse\(marker\)|eval\(marker\)/);
  assert.doesNotMatch(approvedAssetBlock, /marker\s*!==\s*''|marker\.length|\/\^network\//);
});

test('ネットワークマーカー処理はYOSナビの承認済み資産内だけに留まる', () => {
  const approveAsset = indexOfOrFail(fetchBlock, 'isApprovedRuntimeAsset(relativePath)', '承認済み資産判定がありません');
  const readMarker = indexOfOrFail(fetchBlock, 'networkSourceMarker(requestUrl)', 'マーカー取得がありません');
  assert.ok(approveAsset < readMarker, '承認済み資産判定前にマーカーを処理しています');
  assert.doesNotMatch(approvedAssetBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
  assert.doesNotMatch(approvedAssetBlock, /cache\.(?:put|add|delete)|caches\.delete|indexedDB|localStorage/);
});
