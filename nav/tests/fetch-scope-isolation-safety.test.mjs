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

const indexOfOrFail = (token, message) => {
  const index = fetchBlock.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビはGET以外のリクエストへ介入しない', () => {
  assert.match(fetchBlock, /if \(event\.request\.method !== 'GET'\) return;/);
  assert.doesNotMatch(fetchBlock, /(?:POST|PUT|PATCH|DELETE)/);
});

test('YOSナビ専用画面だけをナビゲーション処理へ渡す', () => {
  assert.match(fetchBlock, /const relativePath = toNavRelativePath\(requestUrl\);/);
  assert.match(fetchBlock, /event\.request\.mode === 'navigate'/);
  assert.match(fetchBlock, /relativePath === '\.\/' \|\| relativePath === '\.\/index\.html'/);
  assert.match(fetchBlock, /event\.respondWith\(serveNavigation\(event\)/);

  const resolveScope = indexOfOrFail('toNavRelativePath(requestUrl)', 'YOSナビ範囲の判定がありません');
  const classifyPage = indexOfOrFail("event.request.mode === 'navigate'", 'ナビゲーション判定がありません');
  const servePage = indexOfOrFail('serveNavigation(event)', 'YOSナビ画面配信がありません');
  assert.ok(resolveScope < classifyPage && classifyPage < servePage, '範囲判定前にYOSナビ画面を処理しています');
});

test('承認済み資産だけをYOSナビのキャッシュ配信対象にする', () => {
  assert.match(fetchBlock, /if \(isApprovedRuntimeAsset\(relativePath\)\)/);
  assert.match(fetchBlock, /serveApprovedAsset\(event, relativePath, forceNetwork\)/);
  assert.doesNotMatch(fetchBlock, /STATIC\.push|CRITICAL_ASSETS\.push/);

  const approveAsset = indexOfOrFail('isApprovedRuntimeAsset(relativePath)', '承認済み資産判定がありません');
  const serveAsset = indexOfOrFail('serveApprovedAsset(event, relativePath, forceNetwork)', '承認済み資産配信がありません');
  assert.ok(approveAsset < serveAsset, '承認前に資産をYOSナビのキャッシュ配信へ渡しています');
});

test('担当外リクエストは保存・削除せず通常のネットワーク取得へ委譲する', () => {
  assert.match(fetchBlock, /event\.respondWith\(fetch\(event\.request, \{cache: 'no-cache'\}\)\);/);
  assert.doesNotMatch(fetchBlock, /caches\.(?:open|delete|keys)|cache\.(?:put|add|addAll|delete)/);
  assert.doesNotMatch(fetchBlock, /CLIENT_SERVING_CACHES\.(?:set|delete|clear)/);
  assert.doesNotMatch(fetchBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
});
