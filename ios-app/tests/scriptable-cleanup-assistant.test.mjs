import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Scriptable Cleanup Assistant.js', import.meta.url), 'utf8');

test('keeps only the known current scripts as automatic keep targets', () => {
  for (const name of [
    'リモコン.js','リモコン更新.js','テレビリモコン.js','エアコンリモコン.js','照明リモコン.js',
    'リモコン整理.js','スクリプト整理.js','MY_WAY_5_WIDGETS_v1.js','YOS Battery Widget.js'
  ]) assert.ok(source.includes(name));
  assert.match(source, /REVIEW_OLD_MYWAY/);
  assert.match(source, /MY WAY Widgets\.js/);
  assert.match(source, /MY WAY Widget\.js/);
});

test('never physically deletes and automatically archives only safe candidates as js.bak', () => {
  assert.doesNotMatch(source, /\.remove\(/);
  assert.match(source, /\.js\.bak/);
  assert.match(source, /archiveSafe\(store,result\.safe/);
  assert.doesNotMatch(source, /addAction\('安全候補を保管'\)/);
});

test('classifies exact duplicate contents across all scripts as safe while keeping a preferred owner', () => {
  assert.match(source, /function buildContentOwners/);
  assert.match(source, /group\.count>1/);
  assert.match(source, /内容が完全一致する重複/);
  assert.match(source, /function preferenceScore/);
});

test('archives blank/default Untitled scripts but keeps unknown Untitled for review', () => {
  assert.match(source, /function isDefaultUntitled/);
  assert.match(source, /空またはScriptable初期テンプレート/);
  assert.match(source, /Untitledのため中身確認が必要/);
  assert.match(source, /旧MY WAY NOW候補/);
});

test('writes a Japanese report and does not auto-archive old MY WAY names', () => {
  assert.match(source, /分類レポート\.txt/);
  assert.match(source, /旧MY WAY候補。ホーム画面参照の可能性があるため確認必要/);
  assert.match(source, /要確認には触れていません/);
});
