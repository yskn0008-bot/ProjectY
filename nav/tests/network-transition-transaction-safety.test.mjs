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

const validatedNavigationBlock = extractBetween(
  serviceWorker,
  'const getValidatedNavigationResponse = async () => {',
  'const inspectCachedAsset = async',
  '検証済みナビゲーション応答処理を取得できません'
);

const navigationBlock = extractBetween(
  serviceWorker,
  'const serveNavigation = async event => {',
  'const serveApprovedAsset = async',
  'ナビゲーション配信処理を取得できません'
);

const approvedAssetBlock = extractBetween(
  serviceWorker,
  'const serveApprovedAsset = async',
  "self.addEventListener('install'",
  '承認済み資産配信処理を取得できません'
);

test('YOSナビはネットワークHTMLを検証してから必須スクリプトを注入し、最後に現行マーカーを付与する', () => {
  assert.match(validatedNavigationBlock, /fetch\('\.\/index\.html', \{cache: 'no-cache'\}\)/);
  assert.match(validatedNavigationBlock, /if \(!\(await isCacheableResponse\(response, '\.\/index\.html'\)\)\) throw new Error\('invalid-navigation-response'\)/);
  assert.match(validatedNavigationBlock, /return markNetworkScriptRequests\(await injectRequiredScripts\(response\)\)/);

  const validateIndex = validatedNavigationBlock.indexOf('isCacheableResponse');
  const injectIndex = validatedNavigationBlock.indexOf('injectRequiredScripts');
  const markerIndex = validatedNavigationBlock.indexOf('markNetworkScriptRequests');
  assert.ok(validateIndex >= 0 && injectIndex > validateIndex && markerIndex > validateIndex,
    '検証前にHTML注入またはマーカー付与が行われています');
});

test('キャッシュ配信不能時だけ要求元画面をネットワーク配信へ固定してから検証済みHTMLを返す', () => {
  assert.match(navigationBlock, /const clientId = event\.resultingClientId \|\| event\.clientId \|\| null/);
  assert.match(navigationBlock, /if \(isNetworkServingPin\(preferredCache\)\) return getValidatedNavigationResponse\(\)/);
  assert.match(navigationBlock, /if \(clientId\) CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/);
  assert.match(navigationBlock, /return getValidatedNavigationResponse\(\)/);

  const cachedResponseIndex = navigationBlock.indexOf('if (result.response)');
  const networkPinIndex = navigationBlock.lastIndexOf('CLIENT_SERVING_CACHES.set(clientId, NETWORK_SERVING_PIN)');
  const networkResponseIndex = navigationBlock.lastIndexOf('return getValidatedNavigationResponse()');
  assert.ok(cachedResponseIndex >= 0 && networkPinIndex > cachedResponseIndex && networkResponseIndex > networkPinIndex,
    'キャッシュ利用可能時までネットワーク固定するか、固定前にネットワークHTMLを返しています');
});

test('現行マーカー付き承認済み資産だけが要求元画面をネットワーク配信へ固定する', () => {
  assert.match(approvedAssetBlock, /if \(forceNetwork\) \{/);
  assert.match(approvedAssetBlock, /if \(clientId\) CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/);
  assert.match(approvedAssetBlock, /return getValidatedRuntimeResponse\(event\.request, relativePath\)/);
  assert.doesNotMatch(approvedAssetBlock, /CLIENT_SERVING_CACHES\.clear\(|caches\.delete|localStorage|indexedDB/);
});

test('ネットワーク移行処理は担当外機能・保存データ・外部遷移を変更しない', () => {
  const transaction = `${validatedNavigationBlock}\n${navigationBlock}\n${approvedAssetBlock}`;
  assert.doesNotMatch(transaction, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
  assert.doesNotMatch(transaction, /window\.open|location\.href|location\.assign|location\.replace|postMessage\(/);
  assert.doesNotMatch(transaction, /cache\.(?:put|add|delete)|caches\.delete|indexedDB|localStorage|sessionStorage/);
});
