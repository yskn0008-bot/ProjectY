import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Scriptable Cleanup Assistant.js', import.meta.url), 'utf8');

test('keeps the known current Japanese/user-facing scripts', () => {
  for (const name of [
    'リモコン.js','リモコン更新.js','テレビリモコン.js','エアコンリモコン.js','照明リモコン.js',
    'リモコン整理.js','スクリプト整理.js','MY WAY Widgets.js','MY WAY Widget.js','MY_WAY_5_WIDGETS_v1.js','YOS Battery Widget.js'
  ]) assert.ok(source.includes(name));
});

test('never deletes and archives safe candidates as js.bak after confirmation', () => {
  assert.doesNotMatch(source, /\.remove\(/);
  assert.match(source, /\.js\.bak/);
  assert.match(source, /addAction\('安全候補を保管'\)/);
  assert.match(source, /addCancelAction\('見るだけ'\)/);
  assert.match(source, /if\(choice!==0\) return/);
});

test('classifies exact current-content duplicates as safe', () => {
  assert.match(source, /buildContentOwners/);
  assert.match(source, /owners\.get\(text\)/);
  assert.match(source, /内容が完全一致/);
});

test('treats unknown Untitled scripts as review-needed unless positively identified', () => {
  assert.match(source, /function isUntitled/);
  assert.match(source, /Untitledのため中身確認が必要/);
  assert.match(source, /旧MY REMOTE内容と確定/);
});

test('writes a Japanese classification report and preserves unknown scripts', () => {
  assert.match(source, /分類レポート\.txt/);
  assert.match(source, /【残す】/);
  assert.match(source, /【安全に保管可能】/);
  assert.match(source, /【要確認】/);
  assert.match(source, /用途を自動確定できない/);
});
