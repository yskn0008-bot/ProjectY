// Variables used by Scriptable.
// YOS_SCRIPT_NAME: YOS Remote Power Toggle
// YOS Remote Power Toggle v1.0 — one shortcut each for light and AC.
// Shortcut parameters: "light" or "ac". Optional recovery: "light on", "light off", "ac on", "ac off", "light reset", "ac reset".
// This tracks commands / hub-side AC status only. Infrared cannot verify real appliance state.
'use strict';

const STATE_PREFIX = 'yos.remote.power-toggle.v1.';
const LOCK_PREFIX = 'yos.remote.power-toggle.lock.v1.';
const LOCK_MS = 45000;
const now = () => Date.now();
function stored(key) {
  if (!Keychain.contains(key)) return null;
  try { return JSON.parse(Keychain.get(key)); } catch (_) { return null; }
}
function fail(message) { throw new Error(message); }
function write(key, data) { Keychain.set(key, JSON.stringify(data)); }
function coreModule() {
  try { return importModule('YOS Tapo H110 Core'); }
  catch (_) { return importModule('リモコン/内部/Tapo共通'); }
}
function uniqueRemote(core, check) {
  const matches = core.getMap().filter(check);
  if (matches.length !== 1) fail('対象リモコンを一意に特定できません。既存YOS Remoteの設定を確認してください。');
  return matches[0];
}
async function chooseUnknown(label) {
  const a = new Alert();
  a.title = label + 'の状態合わせ（初回のみ）';
  a.message = '実際の状態は取得できません。今の状態を選んでください。次の操作を送ります。';
  a.addAction('現在OFF → ONにする');
  a.addAction('現在ON → OFFにする');
  a.addCancelAction('キャンセル');
  const index = await a.presentAlert();
  if (index === -1 || index === 2) fail('キャンセルしました。操作していません。');
  return index === 0;
}
function acquire(device) {
  const key = LOCK_PREFIX + device;
  const current = stored(key);
  if (current && Number.isFinite(current.at) && now() - current.at < LOCK_MS && now() >= current.at) {
    fail('直前の操作が処理中です。二重送信を防止しました。');
  }
  write(key, { at: now() });
  return () => { if (Keychain.contains(key)) Keychain.remove(key); };
}
function walk(x, out) {
  if (!x || typeof x !== 'object') return out;
  if (Array.isArray(x)) { for (const v of x) walk(v, out); }
  else { out.push(x); for (const v of Object.values(x)) walk(v, out); }
  return out;
}
function asInt(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}
function acHubState(raw) {
  const entries = walk(raw, []);
  const info = entries.find(x => typeof x.ac_status === 'string') ||
    entries.find(x => x && (x.on !== undefined || x.ac_mode !== undefined)) || {};
  const status = {};
  if (typeof info.ac_status === 'string') {
    for (const part of info.ac_status.split('_')) {
      const match = part.match(/^([PMTSD])(-?\d+)$/);
      if (match) status[match[1]] = Number(match[2]);
    }
  }
  const fields = { P: 'on', M: 'ac_mode', T: 'current_temp', S: 'wind_speed', D: 'wind_direct' };
  for (const [key, field] of Object.entries(fields)) {
    if (status[key] === undefined) status[key] = asInt(info[field]);
  }
  return status;
}
function clamp(n, min, max, fallback) {
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
async function toggleLight(core, action, history) {
  if (!['toggle', 'on', 'off'].includes(action)) fail('照明操作はtoggle/on/offのみ対応します。');
  const remote = uniqueRemote(core, r => /ライト|light/i.test(String(r.nickname || '')) || String(r.model || '').toLowerCase() === 'light');
  const wantOn = action === 'on' ? true : action === 'off' ? false :
    history && typeof history.on === 'boolean' ? !history.on : await chooseUnknown('照明');
  const key = core.findKey(remote, wantOn ? ['POWER ON', '点灯'] : ['POWER OFF', '消灯']);
  if (!key) fail('照明のON/OFFボタンが見つかりません。');
  const client = await core.client();
  await client.fire(remote.device_id, key.name);
  return { on: wantOn, source: 'last-sent-command' };
}
async function toggleAc(core, action, history) {
  if (!['toggle', 'on', 'off'].includes(action)) fail('エアコン操作はtoggle/on/offのみ対応します。');
  const remote = uniqueRemote(core, r => String(r.model || '').toUpperCase() === 'AC' || /エアコン|air.?con/i.test(String(r.nickname || '')));
  const client = await core.client();
  const raw = await client.query({ method: 'control_child', params: {
    device_id: remote.device_id, requestData: { method: 'get_device_info', params: null }
  } });
  const hub = acHubState(raw);
  const reported = hub.P === 0 ? false : hub.P === 1 ? true : null;
  const prior = history && typeof history.on === 'boolean' ? history.on : null;
  const wantOn = action === 'on' ? true : action === 'off' ? false :
    reported !== null ? !reported : prior !== null ? !prior : await chooseUnknown('エアコン');
  // Preserve the current mode/temperature when available; use the same safe
  // defaults as the existing YOS AC Widget for missing fields.
  const oldProfile = history && history.profile ? history.profile : {};
  const profile = {
    mode: clamp(hub.M, 0, 4, clamp(oldProfile.mode, 0, 4, 0)),
    temp: clamp(hub.T, 18, 30, clamp(oldProfile.temp, 18, 30, 26)),
    wind_speed: clamp(hub.S, 0, 4, clamp(oldProfile.wind_speed, 0, 4, 0)),
    wind_direct: clamp(hub.D, 0, 6, clamp(oldProfile.wind_direct, 0, 6, 6))
  };
  await client.controlAc(remote.device_id, { power: wantOn, on: wantOn, ...profile });
  return { on: wantOn, source: reported !== null ? 'hub-reported' : 'last-sent-command', profile };
}
async function main() {
  const input = String(args.shortcutParameter || (args.queryParameters && args.queryParameters.device) || '').trim().toLowerCase();
  const [device, rawAction, extra] = input.split(/\s+/);
  if (extra || !['light', 'ac'].includes(device)) fail('ショートカットの入力は light または ac にしてください。');
  const action = rawAction || 'toggle';
  if (!['toggle', 'on', 'off', 'reset'].includes(action)) fail('操作はtoggle/on/off/resetのみ対応します。');
  const stateKey = STATE_PREFIX + device;
  if (action === 'reset') {
    if (Keychain.contains(stateKey)) Keychain.remove(stateKey);
    Script.setShortcutOutput(device + ' の推定状態をリセットしました（家電の操作なし）');
    return;
  }
  const release = acquire(device);
  try {
    const core = coreModule();
    const history = stored(stateKey);
    const next = device === 'light' ? await toggleLight(core, action, history) : await toggleAc(core, action, history);
    write(stateKey, { ...next, at: now() });
    Script.setShortcutOutput((device === 'light' ? '照明' : 'エアコン') + (next.on ? ' ON' : ' OFF') + ' を送信（実機状態は未確認）');
  } finally { release(); }
}
await main();
Script.complete();
