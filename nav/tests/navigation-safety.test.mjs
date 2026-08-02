import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const html = await readFile(resolve(navRoot, 'index.html'), 'utf8');

const capture = (pattern, message) => {
  const match = html.match(pattern);
  assert.ok(match, message);
  return match[1];
};

const openMapsSource = capture(/function openMaps\(destination\)\{([\s\S]*?)\n  \}/, 'openMaps関数を取得できません');

test('YOSナビはオフライン時にGoogleマップ遷移を開始しない', () => {
  const offlineGuard = openMapsSource.indexOf("if(!navigator.onLine)");
  const urlCreation = openMapsSource.indexOf("new URL('https://www.google.com/maps/dir/')");
  assert.ok(offlineGuard >= 0, 'オフラインガードがありません');
  assert.ok(urlCreation >= 0, 'GoogleマップURL生成がありません');
  assert.ok(offlineGuard < urlCreation, 'オフライン判定より先に外部ナビURLを生成しています');
  assert.match(openMapsSource, /if\(!navigator\.onLine\)\{alert\([^}]+\);return;\}/, 'オフライン時にreturnしていません');
});

test('YOSナビは現在地を新鮮かつ精度200m以内のときだけ出発地に使う', () => {
  assert.match(openMapsSource, /Date\.now\(\)-acquiredAt<=5\*60\*1000/, '現在地の5分有効期限が維持されていません');
  assert.match(openMapsSource, /Number\.isFinite\(accuracy\)&&accuracy<=200/, '現在地の精度200m上限が維持されていません');
  assert.match(openMapsSource, /if\(latitude&&longitude&&locationIsFresh&&locationIsAccurate\)url\.searchParams\.set\('origin',`\$\{latitude\},\$\{longitude\}`\)/, '有効な現在地だけをoriginへ設定する条件が崩れています');
});

test('YOSナビの外部案内先はHTTPSのGoogleマップ自動車ナビに固定される', () => {
  assert.match(openMapsSource, /new URL\('https:\/\/www\.google\.com\/maps\/dir\/'\)/, 'GoogleマップのHTTPS固定URLが維持されていません');
  assert.match(openMapsSource, /url\.searchParams\.set\('travelmode','driving'\)/, '移動手段が自動車に固定されていません');
  assert.match(openMapsSource, /url\.searchParams\.set\('dir_action','navigate'\)/, 'ナビ開始指定が維持されていません');
  assert.match(openMapsSource, /location\.href=url\.toString\(\)/, '検証済みURLによる遷移が維持されていません');
});

test('回避先ボタンはナビを開始しない', () => {
  const avoidHandler = capture(/document\.querySelector\('\[data-target="avoid"\]'\)\.onclick=\(\)=>\{?([^\n]+)\}?;/, '回避先ボタン処理を取得できません');
  assert.doesNotMatch(avoidHandler, /openMaps\s*\(/, '回避先ボタンがナビを開始します');
  assert.match(avoidHandler, /alert\(/, '回避先であることを通知していません');
});

test('運転中操作禁止の安全表示を維持する', () => {
  assert.match(html, /運転中は操作しない。停車後に確認。/, '運転中操作禁止の表示がありません');
});
