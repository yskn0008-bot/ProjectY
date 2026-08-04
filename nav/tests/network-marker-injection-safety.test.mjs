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

const markerBlock = extractBetween(
  serviceWorker,
  'const markNetworkScriptRequests = async response => {',
  'const getValidatedNavigationResponse = async () => {',
  'ネットワークマーカー付与処理を取得できません'
);

const headerBlock = extractBetween(
  serviceWorker,
  'const createNavigationHeaders = response => {',
  'const injectRequiredScripts = async response => {',
  'ナビゲーション応答ヘッダー処理を取得できません'
);

test('YOSナビは承認済み必須スクリプトだけへ現行ネットワークマーカーを付与する', () => {
  assert.match(serviceWorker, /const NETWORK_SOURCE_PARAM = 'yos-nav-source';/);
  assert.match(serviceWorker, /const NETWORK_SOURCE_VALUE = `network-\$\{BUILD\}`;/);
  assert.match(markerBlock, /for \(const src of REQUIRED_SCRIPTS\)/);
  assert.match(markerBlock, /html\.replace\(scriptReferenceCapturePattern\(src\), `\$1\$\{src\}\?\$\{NETWORK_SOURCE_PARAM\}=\$\{NETWORK_SOURCE_VALUE\}\$2`\)/);
  assert.doesNotMatch(markerBlock, /STATIC\.forEach|document\.|querySelector|innerHTML/);
});

test('既存queryまたはhashを残して世代混在させず専用マーカーへ正規化する', () => {
  assert.match(serviceWorker, /const scriptReferenceCapturePattern = src => new RegExp\(`\(<script\\\\b\[\^>\]\*\\\\bsrc=\["'\]\)\$\{escapeRegExp\(src\)\}\(\?:\[\?#\]\[\^"'\]\*\)\?\(\["'\]\[\^>\]\*>\)`/);
  assert.doesNotMatch(markerBlock, /append\(|searchParams\.set|[&]yos-nav-source/);
});

test('全必須スクリプトへの付与完了を検査し未完了なら応答を返さない', () => {
  assert.match(markerBlock, /const unresolved = REQUIRED_SCRIPTS\.filter/);
  assert.match(markerBlock, /navigation-network-marker-incomplete:/);
  const unresolvedIndex = markerBlock.indexOf('const unresolved = REQUIRED_SCRIPTS.filter');
  const throwIndex = markerBlock.indexOf('throw new Error(`navigation-network-marker-incomplete:');
  const responseIndex = markerBlock.indexOf('return new Response(html');
  assert.ok(unresolvedIndex >= 0 && throwIndex > unresolvedIndex && responseIndex > throwIndex,
    '未完了検査より前に応答を返しています');
});

test('マーカー付与後のHTMLは再利用可能なキャッシュ固定情報を除去する', () => {
  assert.match(markerBlock, /createNavigationHeaders\(response\)/);
  assert.match(headerBlock, /headers\.set\('Content-Type', 'text\/html; charset=utf-8'\)/);
  assert.match(headerBlock, /headers\.set\('Cache-Control', 'no-cache'\)/);
  assert.match(headerBlock, /headers\.delete\('Content-Length'\)/);
  assert.match(headerBlock, /headers\.delete\('Content-Encoding'\)/);
  assert.match(headerBlock, /headers\.delete\('ETag'\)/);
});

test('マーカー付与処理は保存領域・通信・担当外機能を変更しない', () => {
  assert.doesNotMatch(markerBlock, /fetch\(|cache\.(?:put|add|delete)|caches\.|indexedDB|localStorage|sessionStorage|location\.reload/);
  assert.doesNotMatch(markerBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
});
