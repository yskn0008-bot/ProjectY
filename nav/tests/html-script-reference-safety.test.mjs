import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const [html, serviceWorkerSource] = await Promise.all([
  readFile(resolve(navRoot, 'index.html'), 'utf8'),
  readFile(resolve(navRoot, 'service-worker.js'), 'utf8')
]);

const staticMatch = serviceWorkerSource.match(/const STATIC = \[([\s\S]*?)\n\];/);
assert.ok(staticMatch, 'Service WorkerのSTATICマニフェストを取得できません');

const runtimeMatch = serviceWorkerSource.match(/const RUNTIME_DIAGNOSTICS = ['"](\.\/[^'"]+\.js)['"];/);
assert.ok(runtimeMatch, '実行時診断ファイルを取得できません');

const literalAssets = [...staticMatch[1].matchAll(/['"](\.\/[^'"]+)['"]/g)].map(match => match[1]);
const approvedScripts = [...literalAssets, runtimeMatch[1]].filter(src => src.endsWith('.js'));
const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
const localScripts = externalScripts.filter(src => src.startsWith('./'));
const withoutQueryOrHash = src => src.split(/[?#]/, 1)[0];

test('index.htmlのローカル外部JavaScript参照に重複がない', () => {
  const normalized = localScripts.map(withoutQueryOrHash);
  const duplicates = normalized.filter((src, index) => normalized.indexOf(src) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `index.htmlに重複したJavaScript参照があります: ${duplicates.join(', ')}`);
});

test('index.htmlのローカル外部JavaScriptはすべてSTATIC承認済み資産である', () => {
  const unapproved = localScripts
    .map(withoutQueryOrHash)
    .filter(src => !approvedScripts.includes(src));
  assert.deepEqual(unapproved, [], `STATIC未承認のJavaScript参照があります: ${unapproved.join(', ')}`);
});

test('index.htmlのローカル外部JavaScript参照は安全な相対パスである', () => {
  for (const src of localScripts) {
    assert.match(src, /^\.\/[a-zA-Z0-9._-]+\.js$/, `安全でないJavaScript参照です: ${src}`);
  }
});

test('index.htmlに直書きされた承認済みJavaScriptの順序はSTATIC順序と一致する', () => {
  const normalized = localScripts.map(withoutQueryOrHash);
  const positions = normalized.map(src => approvedScripts.indexOf(src));
  assert.ok(positions.every(position => position >= 0), 'STATIC未承認のJavaScript参照があります');
  const sorted = [...positions].sort((a, b) => a - b);
  assert.deepEqual(positions, sorted, 'index.htmlのJavaScript読込順序がSTATICマニフェストと一致しません');
});

test('Service Worker登録先がYOSナビ直下の正式ファイルを維持する', () => {
  assert.match(
    html,
    /navigator\.serviceWorker\.register\(\s*['"]\.\/service-worker\.js['"]\s*\)/,
    'Service Worker登録先が./service-worker.jsではありません'
  );
});
