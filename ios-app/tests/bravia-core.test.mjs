import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeHost,
  parseRemoteControllerInfo,
  resolveCommands,
  quickSettingsCandidates,
  irccEnvelope,
  cursorPlan,
  tapAction,
  SonyRemote,
  GoogleTvTextAdapter,
  defaultButtonOrder
} from '../shell/bravia-core.js';
import {
  layoutKey,
  loadLayout,
  saveLayout,
  resetLayout,
  loadCursorMode,
  saveCursorMode
} from '../shell/bravia-preferences.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

test('host validation accepts dynamic hosts and rejects paths', () => {
  assert.equal(normalizeHost('living-room-tv.local'), 'living-room-tv.local');
  assert.throws(() => normalizeHost('tv.local/path'));
});

test('Sony response maps only runtime commands', () => {
  const map = parseRemoteControllerInfo({
    result: [{}, [{ name: 'Home', value: 'runtime-code' }, { name: 'ActionMenu', value: 'candidate' }]]
  });
  assert.equal(resolveCommands(map).home.code, 'runtime-code');
  assert.equal(resolveCommands(map).mute, null);
  assert.deepEqual(quickSettingsCandidates(map), [{ name: 'ActionMenu', code: 'candidate' }]);
});

test('IRCC envelope escapes runtime values', () => {
  assert.match(irccEnvelope('a&b'), /<IRCCCode>a&amp;b<\/IRCCCode>/);
});

test('swipe dead zone and acceleration are bounded', () => {
  assert.equal(cursorPlan(4, 3, 10), null);
  assert.deepEqual(cursorPlan(1000, 1, 1), { action: 'right', repeats: 8 });
});

test('tap maps center and four directions', () => {
  assert.equal(tapAction(50, 50, 100, 100), 'confirm');
  assert.equal(tapAction(5, 50, 100, 100), 'left');
  assert.equal(tapAction(50, 95, 100, 100), 'down');
});

test('authentication failure does not expose credentials', async () => {
  const client = new SonyRemote(
    'tv.local',
    { get: async () => 'runtime-value' },
    async () => ({ ok: false, status: 403 })
  );
  await assert.rejects(client.discover(), /PSK認証/);
});

test('layout order, hidden buttons and reset persist safely', () => {
  const local = storage();
  const value = { order: [...defaultButtonOrder].reverse(), hidden: ['mute'] };
  saveLayout(local, value);
  assert.deepEqual(loadLayout(local), value);
  assert.deepEqual(resetLayout(local).order, defaultButtonOrder);
});

test('invalid and duplicate layout data is normalized or rejected', () => {
  const local = storage();
  local.setItem(layoutKey, JSON.stringify({ order: ['home', 'home'], hidden: ['mute', 'mute'] }));
  const loaded = loadLayout(local);
  assert.equal(loaded.order.filter(item => item === 'home').length, 1);
  assert.equal(loaded.hidden.filter(item => item === 'mute').length, 1);
  local.setItem(layoutKey, JSON.stringify({ order: ['unverified-command'], hidden: [] }));
  assert.deepEqual(loadLayout(local).order, defaultButtonOrder);
});

test('cursor mode persists and invalid modes fail closed', () => {
  const local = storage();
  saveCursorMode(local, 'tap');
  assert.equal(loadCursorMode(local), 'tap');
  assert.throws(() => saveCursorMode(local, 'mouse'));
});

test('Google TV text delegates only to a registered native adapter', async () => {
  const missing = new GoogleTvTextAdapter(null);
  assert.equal(missing.available, false);
  await assert.rejects(missing.sendText('hello'), /利用できません/);
  const calls = [];
  const available = new GoogleTvTextAdapter({ sendText: value => calls.push(value) });
  await available.sendText('hello');
  assert.deepEqual(calls, [{ text: 'hello' }]);
});

test('web layer never persists BRAVIA credentials', async () => {
  const sources = await Promise.all([
    readFile(new URL('../shell/bravia.js', import.meta.url), 'utf8'),
    readFile(new URL('../shell/bravia-preferences.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(sources.join('\n'), /localStorage\.(setItem|getItem)\([^\n]*(psk|secret|credential)/i);
  assert.doesNotMatch(sources.join('\n'), /console\.(log|debug)/);
});

test('local Capacitor plugin is the only Keychain credential boundary', async () => {
  const [appPackage, pluginPackage, swift] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../plugins/yos-secure-credentials/package.json', import.meta.url), 'utf8'),
    readFile(new URL('../plugins/yos-secure-credentials/ios/Sources/YOSSecureCredentialsPlugin/YOSSecureCredentialsPlugin.swift', import.meta.url), 'utf8')
  ]);
  assert.match(appPackage, /"@yos\/secure-credentials": "file:plugins\/yos-secure-credentials"/);
  assert.match(pluginPackage, /"capacitor"/);
  assert.match(swift, /allowedKey = "braviaPSK"/);
  assert.match(swift, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.doesNotMatch(swift, /UserDefaults|localStorage/);
});
