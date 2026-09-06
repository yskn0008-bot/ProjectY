import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(here, '..', 'scriptable', 'YOS BRAVIA Remote.js');
const source = readFileSync(scriptPath, 'utf8');

test('Scriptable BRAVIA source is syntactically valid', () => {
  const result = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Scriptable BRAVIA keeps Sony runtime command discovery boundary', () => {
  assert.match(source, /getRemoteControllerInfo/);
  assert.match(source, /\/sony\/system/);
  assert.match(source, /\/sony\/ircc/);
  assert.match(source, /X-Auth-PSK/);
  assert.match(source, /remoteMap = new Map/);
  assert.match(source, /quickCandidates/);
});

test('Scriptable BRAVIA keeps credentials on device and does not hardcode TV secrets', () => {
  assert.match(source, /Keychain\.set\(STORAGE\.psk/);
  assert.match(source, /addSecureTextField/);
  assert.doesNotMatch(source, /192\.168\.\d{1,3}\.\d{1,3}/);
  assert.doesNotMatch(source, /AAAAAQAAAAE/);
});

test('Scriptable BRAVIA exposes touchpad mode', () => {
  assert.match(source, /new WebView\(\)/);
  assert.match(source, /タッチパッド/);
  assert.match(source, /touchstart/);
  assert.match(source, /touchend/);
  assert.match(source, /yosRemoteAction/);
  assert.match(source, /completion\(event\.detail\)/);
});

test('Scriptable BRAVIA uses transport symbols for media controls', () => {
  for (const symbol of ['⏪', '▶︎', '⏩', '⏸︎', '⏹︎']) {
    assert.match(source, new RegExp(symbol));
  }
  assert.match(source, /rewind: \['rewind'\]/);
  assert.match(source, /forward: \['forward'\]/);
});

test('Scriptable BRAVIA retains one-screen primary controls and updater', () => {
  for (const label of ['電源', '入力', 'クイック', '戻る', 'ホーム', '音量−', 'ミュート', '音量＋', '最新版へ更新']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /new UITable\(\)/);
  assert.match(source, /UPDATE_URL/);
});
