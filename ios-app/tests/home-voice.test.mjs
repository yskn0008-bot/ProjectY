import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const parserUrl = new URL('../scriptable/remote-voice/YOS Home Voice Parser.js', import.meta.url);
const parserSource = fs.readFileSync(parserUrl, 'utf8');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(parserSource, sandbox, { filename: parserUrl.pathname });
const { parseHomeVoice } = sandbox.module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

test('routes the first physical acceptance phrases', () => {
  assert.deepEqual(plain(parseHomeVoice('テレビつけて')), {ok:true,device:'tv',action:'power_on',value:null});
  assert.deepEqual(plain(parseHomeVoice('テレビ消して')), {ok:true,device:'tv',action:'power_off',value:null});
  assert.deepEqual(plain(parseHomeVoice('音量下げて')), {ok:true,device:'tv',action:'volume_down',value:null});
  assert.deepEqual(plain(parseHomeVoice('エアコンつけて')), {ok:true,device:'ac',action:'power_on',value:null});
  assert.deepEqual(plain(parseHomeVoice('エアコン24度にして')), {ok:true,device:'ac',action:'set_temperature',value:24});
  assert.deepEqual(plain(parseHomeVoice('24度にして')), {ok:true,device:'ac',action:'set_temperature',value:24});
  assert.deepEqual(plain(parseHomeVoice('電気つけて')), {ok:true,device:'light',action:'power_on',value:null});
  assert.deepEqual(plain(parseHomeVoice('電気消して')), {ok:true,device:'light',action:'power_off',value:null});
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
  assert.equal(parseHomeVoice('1度下げて').action, 'temperature_down');
  assert.equal(parseHomeVoice('もっと明るくして').action, 'brightness_up');
});

test('temperature is bounded to supported 18-30C parsing', () => {
  assert.equal(parseHomeVoice('エアコン18度にして').value, 18);
  assert.equal(parseHomeVoice('エアコン30度にして').value, 30);
  assert.equal(parseHomeVoice('18度にして').value, 18);
  assert.equal(parseHomeVoice('30度にして').value, 30);
  assert.equal(parseHomeVoice('エアコン17度にして').ok, false);
  assert.equal(parseHomeVoice('エアコン31度にして').ok, false);
  assert.equal(parseHomeVoice('17度にして').ok, false);
  assert.equal(parseHomeVoice('31度にして').ok, false);
});

test('runtime adapter reuses secure existing boundaries and supports direct Japanese dictation', () => {
  const source = fs.readFileSync(new URL('../scriptable/remote-voice/YOS Home Voice.js', import.meta.url), 'utf8');
  assert.match(source, /importModule\('YOS Tapo H110 Core'\)/);
  assert.match(source, /yos\.bravia\.scriptable\.host/);
  assert.match(source, /yos\.bravia\.scriptable\.psk/);
  assert.match(source, /getRemoteControllerInfo/);
  assert.match(source, /getPowerStatus/);
  assert.match(source, /Dictation\.start\('ja-JP'\)/);
  assert.doesNotMatch(source, /192\.168\./);
  assert.doesNotMatch(source, /xox[baprs]-|sk-[A-Za-z0-9_-]{20,}|BEGIN [A-Z ]*PRIVATE KEY/);
});

test('installer pins the voice build and leaves existing MY REMOTE files untouched', () => {
  const source = fs.readFileSync(new URL('../scriptable/remote-voice/YOS Home Voice Installer.js', import.meta.url), 'utf8');
  assert.match(source, /55e76fb268a1471583be1ba9116fff59b482e401/);
  assert.match(source, /YOS Home Voice Parser\.js/);
  assert.match(source, /YOS Home Voice\.js/);
  assert.match(source, /REQUIRED_EXISTING = \['YOS Tapo H110 Core\.js'\]/);
  assert.doesNotMatch(source, /YOS Remote Hub\.js|YOS AC Remote\.js|YOS Light Remote\.js/);
  assert.doesNotMatch(source, /192\.168\.|xox[baprs]-|sk-[A-Za-z0-9_-]{20,}|BEGIN [A-Z ]*PRIVATE KEY/);
});
