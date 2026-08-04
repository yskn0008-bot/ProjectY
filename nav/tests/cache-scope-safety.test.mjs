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

const cleanupSource = capture(
  /const cleanupStaleCaches = async \(\) => \{([\s\S]*?)\n\};/,
  'cleanupStaleCaches関数を取得できません'
);

test('YOSナビのキャッシュ名前空間は専用prefixに固定される', () => {
  assert.match(
    serviceWorker,
    /const CACHE_PREFIX = 'yos-navi-strategy-';/,
    'YOSナビ専用のCACHE_PREFIXが維持されていません'
  );
  assert.match(
    serviceWorker,
    /const CACHE = 'yos-navi-strategy-v\d+-[^']+';/,
    '現在のYOSナビキャッシュ名が専用prefix配下ではありません'
  );
});

test('古いキャッシュ削除はYOSナビ専用prefixだけを対象にする', () => {
  assert.match(
    cleanupSource,
    /keys\.filter\(key => key\.startsWith\(CACHE_PREFIX\) && key !== CACHE && key !== previousCache\)\.map\(key => caches\.delete\(key\)\)/,
    '削除対象がYOSナビ専用prefix・現行キャッシュ除外・退避キャッシュ除外に限定されていません'
  );
});

test('Taxi・Life・YOS・無関係キャッシュを一括削除する処理を持たない', () => {
  assert.doesNotMatch(
    cleanupSource,
    /keys\.map\(key => caches\.delete\(key\)\)/,
    '全キャッシュを一括削除する処理があります'
  );
  assert.doesNotMatch(
    cleanupSource,
    /keys\.filter\(key => key !== CACHE(?: && key !== previousCache)?\)\.map\(key => caches\.delete\(key\)\)/,
    '専用prefix判定なしで他機能のキャッシュを削除できる処理があります'
  );
  assert.doesNotMatch(
    cleanupSource,
    /caches\.delete\((?:'|")?(?:taxi|life|yos)(?:'|")?\)/i,
    '担当外機能のキャッシュ名を直接削除する処理があります'
  );
});

test('現行と直前の有効キャッシュを削除対象から除外する', () => {
  assert.match(cleanupSource, /key !== CACHE/, '現行キャッシュの除外条件がありません');
  assert.match(cleanupSource, /key !== previousCache/, '直前の有効キャッシュの除外条件がありません');
  assert.match(cleanupSource, /return previousCache;/, '退避キャッシュの選択結果を返していません');
});
