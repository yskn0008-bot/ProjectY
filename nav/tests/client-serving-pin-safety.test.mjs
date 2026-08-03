import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const block = (start, end) => {
  const from = serviceWorker.indexOf(start);
  const to = serviceWorker.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} の処理範囲を取得できません`);
  return serviceWorker.slice(from, to);
};

const navigationBlock = block('const serveNavigation = async event => {', 'const serveApprovedAsset = async');
const assetBlock = block('const serveApprovedAsset = async', "self.addEventListener('install'");
const pruneBlock = block('const pruneClientServingCaches = async () => {', 'const cleanupStaleCaches = async');
const cleanupBlock = block('const cleanupStaleCaches = async () => {', 'const serveNavigation = async');

test('YOSナビは画面ごとのclientIdで配信世代を分離する', () => {
  assert.match(navigationBlock, /event\.resultingClientId \|\| event\.clientId \|\| null/);
  assert.match(assetBlock, /event\.clientId \|\| null/);
  assert.match(navigationBlock, /CLIENT_SERVING_CACHES\.get\(clientId\)/);
  assert.match(assetBlock, /CLIENT_SERVING_CACHES\.get\(clientId\)/);
  assert.doesNotMatch(navigationBlock, /CLIENT_SERVING_CACHES\.clear\(/);
  assert.doesNotMatch(assetBlock, /CLIENT_SERVING_CACHES\.clear\(/);
});

test('ナビ画面と承認済み資産は同じclientIdへ同じ配信先を固定する', () => {
  assert.match(navigationBlock, /CLIENT_SERVING_CACHES\.set\(clientId, result\.servingCache\)/);
  assert.match(navigationBlock, /CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/);
  assert.match(assetBlock, /CLIENT_SERVING_CACHES\.set\(clientId, result\.servingCache\)/);
  assert.match(assetBlock, /CLIENT_SERVING_CACHES\.set\(clientId, NETWORK_SERVING_PIN\)/);
});

test('現在存在しない画面の固定情報だけを削除する', () => {
  assert.match(pruneBlock, /self\.clients\.matchAll\(\{type: 'window', includeUncontrolled: true\}\)/);
  assert.match(pruneBlock, /activeIds = new Set\(activeClients\.map\(client => client\.id\)\)/);
  assert.match(pruneBlock, /if \(!activeIds\.has\(clientId\)\) CLIENT_SERVING_CACHES\.delete\(clientId\)/);
  assert.doesNotMatch(pruneBlock, /CLIENT_SERVING_CACHES\.clear\(/);
});

test('キャッシュ整理後も現行・直前有効・ネットワーク固定だけを保持する', () => {
  assert.match(cleanupBlock, /key !== CACHE && key !== previousCache/);
  assert.match(cleanupBlock, /!isNetworkServingPin\(key\) && key !== CACHE && key !== previousCache/);
  assert.doesNotMatch(cleanupBlock, /\/taxi\/|\/life\/|\/yos\//i);
});
