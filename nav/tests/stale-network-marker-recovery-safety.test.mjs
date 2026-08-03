import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const navRoot = resolve(here, '..');
const serviceWorker = await readFile(resolve(navRoot, 'service-worker.js'), 'utf8');

const recoveryMatch = serviceWorker.match(
  /const createStaleMarkerRecoveryResponse = marker => \{([\s\S]*?)\n\};\nconst expectedAssetUrl/
);
assert.ok(recoveryMatch, '旧ネットワークマーカー復旧処理を取得できません');
const recoveryBlock = recoveryMatch[1];

const fetchMatch = serviceWorker.match(
  /self\.addEventListener\('fetch', event => \{([\s\S]*?)\n\}\);\s*$/
);
assert.ok(fetchMatch, 'fetchイベント処理を取得できません');
const fetchBlock = fetchMatch[1];

const indexOfOrFail = (source, token, message) => {
  const index = source.indexOf(token);
  assert.ok(index >= 0, message);
  return index;
};

test('YOSナビは形式が正しい旧世代ネットワークマーカーだけを復旧対象にする', () => {
  assert.match(serviceWorker, /const isNetworkMarker = marker => \/\^network-v\\d\+\$\/.test\(marker\);/);
  assert.match(serviceWorker, /const isStaleNetworkMarker = marker => isNetworkMarker\(marker\) && !isCurrentNetworkMarker\(marker\);/);
  assert.match(fetchBlock, /if \(isStaleNetworkMarker\(marker\)\) \{/);
  assert.doesNotMatch(fetchBlock, /includes\(['"]network-|startsWith\(['"]network-/);
});

test('旧マーカー復旧はYOSナビの承認済み実行資産にだけ適用する', () => {
  const resolveScope = indexOfOrFail(fetchBlock, 'toNavRelativePath(requestUrl)', 'YOSナビ範囲判定がありません');
  const approveAsset = indexOfOrFail(fetchBlock, 'isApprovedRuntimeAsset(relativePath)', '承認済み資産判定がありません');
  const detectStale = indexOfOrFail(fetchBlock, 'isStaleNetworkMarker(marker)', '旧マーカー判定がありません');
  const respondRecovery = indexOfOrFail(fetchBlock, 'createStaleMarkerRecoveryResponse(marker)', '復旧応答がありません');
  assert.ok(resolveScope < approveAsset && approveAsset < detectStale && detectStale < respondRecovery,
    '範囲・承認済み資産確認前に旧マーカー復旧へ進んでいます');
  assert.doesNotMatch(fetchBlock, /\/taxi\/|\/life\/|\/yos\/|\/server\//i);
});

test('復旧スクリプトは同一画面で一度だけ再読込し無限再読込を防ぐ', () => {
  assert.match(recoveryBlock, /sessionStorage\.getItem\(key\) === current/);
  assert.match(recoveryBlock, /sessionStorage\.setItem\(key, current\)/);
  assert.match(recoveryBlock, /location\.reload\(\)/);

  const guard = indexOfOrFail(recoveryBlock, 'sessionStorage.getItem(key) === current', '再読込済み判定がありません');
  const mark = indexOfOrFail(recoveryBlock, 'sessionStorage.setItem(key, current)', '再読込済み記録がありません');
  const reload = indexOfOrFail(recoveryBlock, 'location.reload()', '再読込処理がありません');
  assert.ok(guard < mark && mark < reload, '再読込済み記録前に再読込しています');
});

test('復旧応答は実行資産として固定しブラウザと中間キャッシュへ保存させない', () => {
  assert.match(recoveryBlock, /status: 200/);
  assert.match(recoveryBlock, /'Content-Type': 'application\/javascript; charset=utf-8'/);
  assert.match(recoveryBlock, /'Cache-Control': 'no-store, max-age=0'/);
  assert.match(recoveryBlock, /'X-YOS-Nav-Recovery': 'stale-network-marker'/);
  assert.doesNotMatch(recoveryBlock, /caches\.|cache\.(?:put|add|delete)|fetch\(/);
});

test('復旧スクリプトは固定イベントだけを通知し担当外状態を変更しない', () => {
  assert.match(recoveryBlock, /new CustomEvent\('yos-nav-stale-marker-recovery'/);
  assert.match(recoveryBlock, /detail: \{stale, current\}/);
  assert.doesNotMatch(recoveryBlock, /localStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(recoveryBlock, /taxi|life|hero|journey|\/yos\//i);
});
