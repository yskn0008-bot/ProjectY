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

const recoveryBlock = extractBetween(
  serviceWorker,
  'const createStaleMarkerRecoveryResponse = marker => {',
  '\nconst expectedAssetUrl = src =>',
  '旧世代マーカー復旧応答処理を取得できません'
);

const fetchBlock = extractBetween(
  serviceWorker,
  "self.addEventListener('fetch'",
  '\n});',
  'fetch処理を取得できません'
);

test('旧世代マーカー復旧応答は専用イベントと1回限りの再読込だけを実行する', () => {
  assert.match(recoveryBlock, /const key = \$\{JSON\.stringify\(STALE_MARKER_RECOVERY_KEY\)\}/);
  assert.match(recoveryBlock, /if \(sessionStorage\.getItem\(key\) === current\) return/);
  assert.match(recoveryBlock, /sessionStorage\.setItem\(key, current\)/);
  assert.match(recoveryBlock, /new CustomEvent\('yos-nav-stale-marker-recovery', \{detail: \{stale, current\}\}\)/);
  assert.match(recoveryBlock, /location\.reload\(\)/);
  assert.doesNotMatch(recoveryBlock, /location\.(?:assign|replace)|window\.open|history\.(?:pushState|replaceState)/);
});

test('sessionStorageが利用不能でも内部例外を公開せず復旧処理を継続する', () => {
  assert.match(recoveryBlock, /try \{/);
  assert.match(recoveryBlock, /\} catch \(error\) \{\}/);
  assert.doesNotMatch(recoveryBlock, /error\.message|error\.stack|String\(error\)|console\./);
});

test('復旧JavaScriptは保存・再利用されない専用応答として返す', () => {
  assert.match(recoveryBlock, /status: 200/);
  assert.match(recoveryBlock, /'Content-Type': 'application\/javascript; charset=utf-8'/);
  assert.match(recoveryBlock, /'Cache-Control': 'no-store, max-age=0'/);
  assert.match(recoveryBlock, /'X-YOS-Nav-Recovery': 'stale-network-marker'/);
  assert.doesNotMatch(recoveryBlock, /ETag|Content-Length|Content-Encoding/);
});

test('旧世代マーカー分岐は専用復旧応答で終了し通常資産配信へ流さない', () => {
  const staleStart = fetchBlock.indexOf('if (isStaleNetworkMarker(marker))');
  const forceNetworkStart = fetchBlock.indexOf('const forceNetwork', staleStart);
  assert.ok(staleStart >= 0 && forceNetworkStart > staleStart, '旧世代マーカー分岐を取得できません');
  const staleBranch = fetchBlock.slice(staleStart, forceNetworkStart);
  assert.match(staleBranch, /createStaleMarkerRecoveryResponse\(marker\)/);
  assert.match(staleBranch, /return;/);
  assert.doesNotMatch(staleBranch, /serveApprovedAsset|getValidatedRuntimeResponse|getValidatedServingCacheResponse|cache\.match|caches\.open/);
});

test('旧世代マーカー復旧処理は担当外機能や永続データへ介入しない', () => {
  assert.doesNotMatch(recoveryBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\/|乗車履歴|同期API/i);
  assert.doesNotMatch(recoveryBlock, /localStorage|indexedDB|caches\.(?:open|delete)|cache\.(?:put|add|delete)|fetch\(/);
  assert.doesNotMatch(recoveryBlock, /CLIENT_SERVING_CACHES\.(?:set|delete|clear)/);
});
