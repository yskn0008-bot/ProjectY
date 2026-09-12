import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseHomeVoice } = require('../scriptable/remote-voice/YOS Home Voice Parser.js');

test('routes the first physical acceptance phrases', () => {
  assert.deepEqual(parseHomeVoice('テレビつけて'), {ok:true,device:'tv',action:'power_on',value:null});
  assert.deepEqual(parseHomeVoice('テレビ消して'), {ok:true,device:'tv',action:'power_off',value:null});
  assert.deepEqual(parseHomeVoice('音量下げて'), {ok:true,device:'tv',action:'volume_down',value:null});
  assert.deepEqual(parseHomeVoice('エアコンつけて'), {ok:true,device:'ac',action:'power_on',value:null});
  assert.deepEqual(parseHomeVoice('エアコン24度にして'), {ok:true,device:'ac',action:'set_temperature',value:24});
  assert.deepEqual(parseHomeVoice('電気つけて'), {ok:true,device:'light',action:'power_on',value:null});
  assert.deepEqual(parseHomeVoice('電気消して'), {ok:true,device:'light',action:'power_off',value:null});
});

test('rejects broad scene or ambiguous phrases', () => {
  for (const phrase of ['暑い','暗い','寝る','全部消して','なんかいい感じにして']) {
    assert.equal(parseHomeVoice(phrase).ok, false, phrase);
  }
});

test('supports safe explicit secondary controls', () => {
  assert.equal(parseHomeVoice('ミュート').action, 'mute');
  assert.equal(parseHomeVoice('右').action, 'right');
  assert.equal(parseHomeVoice('再生して').action, 'play');
  assert.equal(parseHomeVoice('エアコン1度下げて').action, 'temperature_down');
  assert.equal(parseHomeVoice('もっと明るくして').action, 'brightness_up');
});

test('temperature is bounded to supported 18-30C parsing', () => {
  assert.equal(parseHomeVoice('エアコン18度にして').value, 18);
  assert.equal(parseHomeVoice('エアコン30度にして').value, 30);
  assert.equal(parseHomeVoice('エアコン17度にして').ok, false);
  assert.equal(parseHomeVoice('エアコン31度にして').ok, false);
});

test('runtime adapter reuses secure existing boundaries and no hardcoded home secrets', () => {
  const source = fs.readFileSync(new URL('../scriptable/remote-voice/YOS Home Voice.js', import.meta.url), 'utf8');
  assert.match(source, /importModule\('YOS Tapo H110 Core'\)/);
  assert.match(source, /yos\.bravia\.scriptable\.host/);
  assert.match(source, /yos\.bravia\.scriptable\.psk/);
  assert.match(source, /getRemoteControllerInfo/);
  assert.match(source, /getPowerStatus/);
  assert.doesNotMatch(source, /192\.168\./);
  assert.doesNotMatch(source, /xox[baprs]-|sk-[A-Za-z0-9_-]{20,}|BEGIN [A-Z ]*PRIVATE KEY/);
});
