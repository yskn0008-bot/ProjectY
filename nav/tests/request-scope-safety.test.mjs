import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const capture = (pattern, message) => {
  const match = serviceWorker.match(pattern);
  assert.ok(match, message);
  return match[1];
};

const relativePathSource = capture(/const toNavRelativePath = requestUrl => \{([\s\S]*?)\n\};/, 'toNavRelativePath関数を取得できません');
const fetchHandlerSource = capture(/self\.addEventListener\('fetch', event => \{([\s\S]*?)\n\}\);/, 'fetchイベント処理を取得できません');

test('YOSナビのService Workerスコープは自身の配置先から算出する', () => {
  assert.match(serviceWorker, /const NAV_SCOPE_PATH = new URL\('\.\/', self\.location\.href\)\.pathname;/);
});

test('別originとYOSナビ配下外のリクエストを対象外にする', () => {
  assert.match(relativePathSource, /requestUrl\.origin !== self\.location\.origin/);
  assert.match(relativePathSource, /!requestUrl\.pathname\.startsWith\(NAV_SCOPE_PATH\)/);
  assert.match(relativePathSource, /return null;/);
});

test('承認済みYOSナビ資産だけをキャッシュ応答対象にする', () => {
  assert.match(fetchHandlerSource, /const relativePath = toNavRelativePath\(requestUrl\);/);
  assert.match(fetchHandlerSource, /if \(isApprovedRuntimeAsset\(relativePath\)\)/);
  assert.match(fetchHandlerSource, /event\.respondWith\(fetch\(event\.request, \{cache: 'no-cache'\}\)\);/);
});

test('Taxi・Life・YOSのパスを直接処理対象へ追加しない', () => {
  assert.doesNotMatch(fetchHandlerSource, /(?:\/taxi\/|\/life\/|\/yos\/)/i);
});

test('GET以外の通信をYOSナビのService Workerが処理しない', () => {
  assert.match(fetchHandlerSource, /event\.request\.method !== 'GET'/);
});
