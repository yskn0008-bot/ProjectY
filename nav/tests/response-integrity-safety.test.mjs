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

const finalUrlSource = capture(/const hasExpectedFinalUrl = \(response, src\) => \{([\s\S]*?)\n\};/, 'hasExpectedFinalUrl関数を取得できません');
const contentTypeSource = capture(/const hasExpectedContentType = \(response, src\) => \{([\s\S]*?)\n\};/, 'hasExpectedContentType関数を取得できません');
const bodyInspectionSource = capture(/const inspectResponseBody = async \(response, src, build = BUILD\) => \{([\s\S]*?)\n\};/, 'inspectResponseBody関数を取得できません');
const cacheableSource = capture(/const isCacheableResponse = async \(response, src\) => ([\s\S]*?);\nconst escapeRegExp/, 'isCacheableResponse条件を取得できません');

test('YOSナビ資産は要求先と同じorigin・pathnameの最終URLだけを受け入れる', () => {
  assert.match(finalUrlSource, /actual\.origin === expected\.origin/);
  assert.match(finalUrlSource, /actual\.pathname === expected\.pathname/);
  assert.match(finalUrlSource, /catch \(error\) \{\s*return false;/);
});

test('HTMLとJavaScriptは期待するContent-Typeだけを受け入れる', () => {
  assert.match(contentTypeSource, /response\.headers\.get\('Content-Type'\)/);
  assert.match(contentTypeSource, /contentType\.includes\('javascript'\)/);
  assert.match(contentTypeSource, /contentType\.includes\(expected\)/);
});

test('空応答とHTMLへ化けたJavaScriptを拒否する', () => {
  assert.match(bodyInspectionSource, /if \(!text\.trim\(\)\) return 'empty';/);
  assert.match(bodyInspectionSource, /src\.endsWith\('\.js'\)/);
  assert.match(bodyInspectionSource, /return 'html-content';/);
});

test('YOSナビHTMLの正式名称とアプリルートを検証する', () => {
  assert.match(bodyInspectionSource, /<title>\\s\*YOSナビ/);
  assert.match(bodyInspectionSource, /<main\\s\+class=\["'\]app/);
  assert.match(bodyInspectionSource, /return 'html-identity';/);
});

test('実行時診断資産は現在ビルドの識別子がなければ拒否する', () => {
  assert.match(serviceWorker, /const hasExpectedRuntimeBuildMarker/);
  assert.ok(
    serviceWorker.includes('window\\\\.__yosNavRuntimeDiagnosticsV'),
    '実行時診断資産のビルド識別子検査を確認できません'
  );
  assert.match(bodyInspectionSource, /return 'runtime-build-marker';/);
});

test('キャッシュ採用条件はHTTP成功・URL・Content-Type・本文検証をすべて必須にする', () => {
  assert.match(cacheableSource, /response\.ok/);
  assert.match(cacheableSource, /hasExpectedFinalUrl\(response, src\)/);
  assert.match(cacheableSource, /hasExpectedContentType\(response, src\)/);
  assert.match(cacheableSource, /inspectResponseBody\(response, src\)/);
});
