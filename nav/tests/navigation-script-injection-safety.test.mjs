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

const structureSource = capture(
  /const inspectNavigationStructure = html => \{([\s\S]*?)\n\};/,
  'inspectNavigationStructure関数を取得できません'
);
const injectionSource = capture(
  /const injectRequiredScripts = async response => \{([\s\S]*?)\n\};/,
  'injectRequiredScripts関数を取得できません'
);
const markerSource = capture(
  /const markNetworkScriptRequests = async response => \{([\s\S]*?)\n\};/,
  'markNetworkScriptRequests関数を取得できません'
);

const indexOfOrFail = (source, token, message) => {
  const index = source.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビは必須スクリプトの重複を注入前に拒否する', () => {
  assert.match(structureSource, /countScriptReferences\(html, src\) > 1/);
  assert.match(structureSource, /navigation-script-reference-duplicated:/);

  const inspectBeforeMissing = indexOfOrFail(
    injectionSource,
    'const structureIssue = inspectNavigationStructure(html);',
    '注入前の構造検査がありません'
  );
  const calculateMissing = indexOfOrFail(
    injectionSource,
    'const missing = REQUIRED_SCRIPTS.filter',
    '不足スクリプト算出がありません'
  );
  assert.ok(inspectBeforeMissing < calculateMissing, '不足スクリプト算出より前に重複検査していません');
});

test('必須スクリプト不足時はbody終了タグがあるHTMLだけへ注入する', () => {
  assert.match(structureSource, /missing\.length && !\/<\\\/body\\s\*>\/i\.test\(html\)/);
  assert.match(structureSource, /navigation-body-close-missing/);
  assert.match(injectionSource, /html\.replace\(\/<\\\/body\\s\*>\/i,/);
});

test('注入後は未解決と重複を再検査して不完全なHTMLを返さない', () => {
  assert.match(injectionSource, /navigation-script-injection-incomplete:/);
  assert.match(injectionSource, /const postInjectionIssue = inspectNavigationStructure\(html\)/);

  const inject = indexOfOrFail(injectionSource, 'missing.forEach', 'スクリプト注入処理がありません');
  const unresolved = indexOfOrFail(injectionSource, 'const unresolved = REQUIRED_SCRIPTS.filter', '注入後の不足検査がありません');
  const postInspection = indexOfOrFail(injectionSource, 'const postInjectionIssue = inspectNavigationStructure(html);', '注入後の構造検査がありません');
  assert.ok(inject < unresolved && unresolved < postInspection, '注入後検査の実行順序が崩れています');
});

test('ネットワーク配信マーカーは全必須スクリプトへ付与できた場合だけ返す', () => {
  assert.match(markerSource, /for \(const src of REQUIRED_SCRIPTS\)/);
  assert.match(markerSource, /NETWORK_SOURCE_PARAM/);
  assert.match(markerSource, /NETWORK_SOURCE_VALUE/);
  assert.match(markerSource, /navigation-network-marker-incomplete:/);
});

test('スクリプト注入安全処理は担当外パスへ依存しない', () => {
  const combined = `${structureSource}\n${injectionSource}\n${markerSource}`;
  assert.doesNotMatch(combined, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
});
