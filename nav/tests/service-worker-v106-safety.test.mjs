import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serviceWorkerPath = resolve(here, '..', 'service-worker.js');
const source = await readFile(serviceWorkerPath, 'utf8');

const expectSource = (pattern, message) => {
  assert.match(source, pattern, message);
};

test('YOSナビ v106 の正式な世代識別子を維持する', () => {
  expectSource(/const BUILD = 'v106';/, 'Service WorkerのBUILDがv106ではありません');
  expectSource(/const CACHE = 'yos-navi-strategy-v106-stale-marker-recovery';/, 'v106キャッシュ名が一致しません');
  expectSource(/const NETWORK_SOURCE_VALUE = `network-\$\{BUILD\}`;/, 'ネットワーク取得元マーカーがBUILD連動ではありません');
});

test('新しいキャッシュの完全性確認前にService Workerを有効化しない', () => {
  expectSource(/cacheCriticalAssets\(cache\)/, '必須資産のキャッシュ処理がありません');
  expectSource(/getOfflineCacheStatus\(\)[\s\S]*if \(!status\.offlineReady\) throw new Error\('offline-cache-incomplete'\)[\s\S]*self\.skipWaiting\(\)/, '完全性確認後にskipWaitingする順序が維持されていません');
  expectSource(/getOfflineCacheStatus\(\)[\s\S]*offline-cache-invalid-before-activate[\s\S]*self\.clients\.claim\(\)[\s\S]*cleanupStaleCaches\(\)/, 'activate時の検査・claim・旧キャッシュ整理の順序が維持されていません');
});

test('保持対象は現行より古い検証済みキャッシュだけに限定する', () => {
  expectSource(/cacheBuildNumber\(key\) < CURRENT_BUILD_NUMBER/, '現行より新しいキャッシュを除外する条件がありません');
  expectSource(/if \(await isValidRetainedCache\(key\)\) return key;/, '保持前の完全性検査がありません');
  expectSource(/key !== CACHE && key !== previousCache/, '現行と直前の検証済みキャッシュ以外を整理する条件がありません');
});

test('同一画面の表示元をキャッシュまたはネットワークへ固定する', () => {
  expectSource(/const CLIENT_SERVING_CACHES = new Map\(\);/, '画面単位の表示元固定Mapがありません');
  expectSource(/const NETWORK_SERVING_PIN = '__YOS_NAV_NETWORK__';/, 'ネットワーク固定値がありません');
  expectSource(/CLIENT_SERVING_CACHES\.set\(clientId, result\.servingCache\)/, '検証済みキャッシュへの固定処理がありません');
  expectSource(/CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/, 'ネットワークへの固定処理がありません');
});

test('ネットワーク版HTMLとJavaScriptを同じ世代へ固定する', () => {
  expectSource(/markNetworkScriptRequests\(await injectRequiredScripts\(response\)\)/, 'ネットワーク版HTMLへの世代マーカー付与がありません');
  expectSource(/isCurrentNetworkMarker\(marker\)/, '現行ネットワークマーカー判定がありません');
  expectSource(/serveApprovedAsset\(event, relativePath, forceNetwork\)/, 'マーカー付きJavaScriptの強制ネットワーク取得がありません');
});

test('古いネットワークマーカーを通常資産へ迂回させず一度だけ復旧する', () => {
  expectSource(/isStaleNetworkMarker\(marker\)/, '古いネットワークマーカー判定がありません');
  expectSource(/createStaleMarkerRecoveryResponse\(marker\)/, '古い画面の復旧応答がありません');
  expectSource(/sessionStorage\.getItem\(key\) === current/, '再読込ループ防止ガードがありません');
  expectSource(/location\.reload\(\)/, '現行世代へ揃える再読込処理がありません');
  expectSource(/'Cache-Control': 'no-store, max-age=0'/, '復旧応答がno-storeではありません');
});

test('承認済み資産以外をYOSナビのキャッシュ経路へ混入させない', () => {
  expectSource(/const isApprovedRuntimeAsset = relativePath => Boolean\(relativePath && STATIC\.includes\(relativePath\)\);/, '承認済み資産の限定条件がありません');
  expectSource(/if \(isApprovedRuntimeAsset\(relativePath\)\)/, '承認済み資産だけを専用処理へ送る分岐がありません');
  expectSource(/event\.respondWith\(fetch\(event\.request, \{cache: 'no-cache'\}\)\);/, 'その他の要求を通常ネットワークへ送る処理がありません');
});
