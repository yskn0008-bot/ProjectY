import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorkerSource = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const capture = (pattern, message) => {
  const match = serviceWorkerSource.match(pattern);
  assert.ok(match, message);
  return match[1];
};

const build = capture(/const BUILD = ['"](v\d+)['"];/, 'Service WorkerのBUILDを取得できません');
const runtimeDiagnostics = capture(/const RUNTIME_DIAGNOSTICS = ['"](\.\/[^'"]+\.js)['"];/, '実行時診断ファイルを取得できません');
const staticBlock = capture(/const STATIC = \[([\s\S]*?)\n\];/, 'STATICマニフェストを取得できません');
const literalAssets = [...staticBlock.matchAll(/['"](\.\/[^'"]+)['"]/g)].map(match => match[1]);
const assets = [...literalAssets, runtimeDiagnostics];

const toAbsolutePath = asset => resolve(navRoot, asset.replace(/^\.\//, ''));

test('YOSナビのSTATICマニフェストに重複がない', () => {
  const duplicates = assets.filter((asset, index) => assets.indexOf(asset) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `STATICマニフェストに重複があります: ${duplicates.join(', ')}`);
});

test('YOSナビのSTATICマニフェスト資産がすべて/nav/内に存在する', async () => {
  const missing = [];
  for (const asset of assets) {
    assert.match(asset, /^\.\/[a-zA-Z0-9._-]+$/, `STATIC資産が/nav/直下の安全な相対パスではありません: ${asset}`);
    try {
      await access(toAbsolutePath(asset), constants.R_OK);
    } catch (error) {
      missing.push(asset);
    }
  }
  assert.deepEqual(missing, [], `STATICマニフェストに存在しない資産があります: ${missing.join(', ')}`);
});

test('YOSナビの必須HTMLが正式な画面識別子を維持する', async () => {
  assert.ok(assets.includes('./index.html'), 'STATICマニフェストにindex.htmlがありません');
  const html = await readFile(resolve(navRoot, 'index.html'), 'utf8');
  assert.match(html, /<title>\s*YOSナビ\s*<\/title>/i, 'index.htmlの正式画面名がYOSナビではありません');
  assert.match(html, /<main\s+class=["']app["']/i, 'index.htmlにYOSナビのアプリルートがありません');
});

test('実行時診断ファイルの世代がService Workerと一致する', async () => {
  assert.ok(assets.includes(runtimeDiagnostics), '実行時診断ファイルがSTATICマニフェストに含まれていません');
  const diagnosticsSource = await readFile(toAbsolutePath(runtimeDiagnostics), 'utf8');
  assert.match(diagnosticsSource, new RegExp(`const\\s+BUILD\\s*=\\s*['"]${build}['"]\\s*;`), `実行時診断のBUILDが${build}と一致しません`);
  assert.match(diagnosticsSource, new RegExp(`window\\.__yosNavRuntimeDiagnosticsV${build.slice(1)}\\b`), `実行時診断の公開識別子が${build}と一致しません`);
});

test('STATICマニフェストのJavaScriptは承認済み必須資産へ自動反映される', () => {
  assert.match(serviceWorkerSource, /const REQUIRED_SCRIPTS = STATIC\.filter\(src => src\.endsWith\('\.js'\)\);/, 'REQUIRED_SCRIPTSがSTATICから自動生成されていません');
  assert.match(serviceWorkerSource, /const CRITICAL_ASSETS = \['\.\/index\.html', \.\.\.REQUIRED_SCRIPTS\];/, 'CRITICAL_ASSETSがindex.htmlと全必須JavaScriptを含んでいません');
});
