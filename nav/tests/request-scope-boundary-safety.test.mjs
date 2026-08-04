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

const scopeBlock = extractBetween(
  serviceWorker,
  'const toNavRelativePath = requestUrl => {',
  '\nconst isApprovedRuntimeAsset =',
  'YOSナビ要求スコープ判定を取得できません'
);

const markerBlock = extractBetween(
  serviceWorker,
  'const networkSourceMarker = requestUrl =>',
  '\nconst createStaleMarkerRecoveryResponse =',
  'YOSナビネットワークマーカー判定を取得できません'
);

const fetchBlock = extractBetween(
  serviceWorker,
  "self.addEventListener('fetch'",
  '\n});',
  'fetch処理を取得できません'
);

test('YOSナビ要求は同一originかつNAV_SCOPE_PATH配下だけを相対パス化する', () => {
  assert.match(scopeBlock, /requestUrl\.origin !== self\.location\.origin/);
  assert.match(scopeBlock, /!requestUrl\.pathname\.startsWith\(NAV_SCOPE_PATH\)/);
  assert.match(scopeBlock, /return null/);
  assert.match(scopeBlock, /requestUrl\.pathname\.slice\(NAV_SCOPE_PATH\.length\)/);
  assert.match(scopeBlock, /return path \? `\.\/\$\{path\}` : '\.\/'/);
  assert.doesNotMatch(scopeBlock, /decodeURIComponent|replace\(|\.search|\.hash/);
});

test('実行資産の承認対象はSTATIC完全一致だけに限定する', () => {
  assert.match(serviceWorker, /const isApprovedRuntimeAsset = relativePath => Boolean\(relativePath && STATIC\.includes\(relativePath\)\)/);
  assert.doesNotMatch(serviceWorker, /isApprovedRuntimeAsset[^;]*(?:startsWith|endsWith|includes\(['"]\.\/)/);
});

test('ネットワークマーカーは専用query parameterの厳格な世代形式だけを受理する', () => {
  assert.match(markerBlock, /requestUrl\.searchParams\.get\(NETWORK_SOURCE_PARAM\)/);
  assert.match(markerBlock, /\^network-v\\d\+\$/);
  assert.match(markerBlock, /marker === NETWORK_SOURCE_VALUE/);
  assert.match(markerBlock, /isNetworkMarker\(marker\) && !isCurrentNetworkMarker\(marker\)/);
  assert.doesNotMatch(markerBlock, /requestUrl\.hash|Object\.fromEntries|searchParams\.getAll/);
});

test('fetch処理はスコープ判定後にナビゲーションと承認資産だけを専用配信する', () => {
  assert.match(fetchBlock, /const relativePath = toNavRelativePath\(url\)/);
  assert.match(fetchBlock, /const isNavPage = relativePath === '\.\/' \|\| relativePath === '\.\/index\.html'/);
  assert.match(fetchBlock, /isApprovedRuntimeAsset\(relativePath\)/);

  const scopeIndex = fetchBlock.indexOf('toNavRelativePath(url)');
  const navIndex = fetchBlock.indexOf("relativePath === './'");
  const approvedIndex = fetchBlock.indexOf('isApprovedRuntimeAsset(relativePath)');
  assert.ok(scopeIndex >= 0 && navIndex > scopeIndex && approvedIndex > scopeIndex,
    '要求スコープ判定より先に専用配信判定を行っています');
});

test('担当外要求の判定は保存領域・画面固定・外部遷移を変更しない', () => {
  const scope = `${scopeBlock}\n${markerBlock}`;
  assert.doesNotMatch(scope, /CLIENT_SERVING_CACHES\.(?:set|delete|clear)|caches\.(?:open|delete)|cache\.(?:put|add|delete)/);
  assert.doesNotMatch(scope, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(scope, /location\.(?:assign|replace|reload)|window\.open/);
  assert.doesNotMatch(scope, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
});
