import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const navigationMatch = serviceWorker.match(
  /const serveNavigation = async event => \{([\s\S]*?)\n\};\nconst serveApprovedAsset/
);
assert.ok(navigationMatch, 'serveNavigation関数を取得できません');
const navigationBlock = navigationMatch[1];

const assetMatch = serviceWorker.match(
  /const serveApprovedAsset = async \(event, relativePath, forceNetwork = false\) => \{([\s\S]*?)\n\};\n\nself\.addEventListener/
);
assert.ok(assetMatch, 'serveApprovedAsset関数を取得できません');
const assetBlock = assetMatch[1];

const cleanupMatch = serviceWorker.match(
  /const cleanupStaleCaches = async \(\) => \{([\s\S]*?)\n\};\nconst serveNavigation/
);
assert.ok(cleanupMatch, 'cleanupStaleCaches関数を取得できません');
const cleanupBlock = cleanupMatch[1];

test('YOSナビのネットワーク固定は専用定数で識別する', () => {
  assert.match(serviceWorker, /const NETWORK_SERVING_PIN = '__YOS_NAV_NETWORK__';/);
  assert.match(serviceWorker, /const isNetworkServingPin = key => key === NETWORK_SERVING_PIN;/);
});

test('画面ごとのclientIdだけにネットワーク固定を保存する', () => {
  assert.match(navigationBlock, /const clientId = event\.resultingClientId \|\| event\.clientId \|\| null;/);
  assert.match(navigationBlock, /CLIENT_SERVING_CACHES\.get\(clientId\)/);
  assert.match(navigationBlock, /CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/);
  assert.doesNotMatch(navigationBlock, /CLIENT_SERVING_CACHES\.clear\(\)/);

  assert.match(assetBlock, /const clientId = event\.clientId \|\| null;/);
  assert.match(assetBlock, /CLIENT_SERVING_CACHES\.get\(clientId\)/);
  assert.match(assetBlock, /CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/);
  assert.doesNotMatch(assetBlock, /CLIENT_SERVING_CACHES\.clear\(\)/);
});

test('ネットワーク固定中の画面はキャッシュ世代へ途中で戻さない', () => {
  assert.match(navigationBlock, /if \(isNetworkServingPin\(preferredCache\)\) return getValidatedNavigationResponse\(\);/);
  assert.match(assetBlock, /if \(isNetworkServingPin\(preferredCache\)\) return getValidatedRuntimeResponse\(event\.request, relativePath\);/);
});

test('強制ネットワーク取得は要求元画面だけを固定する', () => {
  assert.match(assetBlock, /if \(forceNetwork\) \{[\s\S]*?if \(clientId\) CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\);[\s\S]*?return getValidatedRuntimeResponse\(event\.request, relativePath\);[\s\S]*?\}/);
  assert.doesNotMatch(assetBlock, /for \(|forEach\(|CLIENT_SERVING_CACHES\.clear\(\)/);
});

test('キャッシュ整理は稼働中画面のネットワーク固定を保持する', () => {
  assert.match(cleanupBlock, /if \(!isNetworkServingPin\(key\) && key !== CACHE && key !== previousCache\) CLIENT_SERVING_CACHES\.delete\(clientId\);/);
  assert.doesNotMatch(cleanupBlock, /CLIENT_SERVING_CACHES\.clear\(\)/);
});

test('ネットワーク固定処理は担当外機能を直接参照しない', () => {
  const combined = `${navigationBlock}\n${assetBlock}\n${cleanupBlock}`;
  assert.doesNotMatch(combined, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
  assert.doesNotMatch(combined, /taxi-|life-|hj-|hero/i);
});
