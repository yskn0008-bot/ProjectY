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

const markerSource = capture(/const networkSourceMarker = requestUrl =>([\s\S]*?);\nconst isNetworkMarker/, 'networkSourceMarker条件を取得できません');
const staleSource = capture(/const isStaleNetworkMarker = marker =>([\s\S]*?);\nconst createStaleMarkerRecoveryResponse/, 'isStaleNetworkMarker条件を取得できません');
const recoverySource = capture(/const createStaleMarkerRecoveryResponse = marker => \{([\s\S]*?)\n\};\nconst expectedAssetUrl/, '復旧応答生成処理を取得できません');

test('YOSナビのネットワーク由来マーカーは専用query parameterだけを読む', () => {
  assert.match(serviceWorker, /const NETWORK_SOURCE_PARAM = 'yos-nav-source';/);
  assert.match(markerSource, /requestUrl\.searchParams\.get\(NETWORK_SOURCE_PARAM\)/);
});

test('古いネットワーク由来マーカーだけを復旧対象にする', () => {
  assert.match(serviceWorker, /const NETWORK_SOURCE_VALUE = `network-\$\{BUILD\}`;/);
  assert.match(serviceWorker, /const isNetworkMarker = marker => \/\^network-v\\d\+\$\//);
  assert.match(staleSource, /isNetworkMarker\(marker\)/);
  assert.match(staleSource, /!isCurrentNetworkMarker\(marker\)/);
});

test('復旧は1セッション1回に制限し無限再読込を防ぐ', () => {
  assert.match(serviceWorker, /const STALE_MARKER_RECOVERY_KEY = 'yos-nav-stale-marker-recovery-v106';/);
  assert.match(recoverySource, /sessionStorage\.getItem\(key\) === current/);
  assert.match(recoverySource, /sessionStorage\.setItem\(key, current\)/);
  assert.match(recoverySource, /location\.reload\(\)/);
});

test('復旧応答はJavaScript・no-store・専用ヘッダーを固定する', () => {
  assert.match(recoverySource, /'Content-Type': 'application\/javascript; charset=utf-8'/);
  assert.match(recoverySource, /'Cache-Control': 'no-store, max-age=0'/);
  assert.match(recoverySource, /'X-YOS-Nav-Recovery': 'stale-network-marker'/);
});

test('復旧イベント名はYOSナビ専用名称を維持する', () => {
  assert.match(recoverySource, /new CustomEvent\('yos-nav-stale-marker-recovery'/);
  assert.doesNotMatch(recoverySource, /taxi|life/i);
});
