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

test('Scriptable BRAVIA exposes Japanese one-screen primary controls', () => {
  for (const label of [
    '電源', '入力', 'クイック', '戻る', 'ホーム', 'OK',
    '音量−', 'ミュート', '音量＋', '10秒戻し', '再生', '15秒送り'
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /new UITable\(\)/);
});
