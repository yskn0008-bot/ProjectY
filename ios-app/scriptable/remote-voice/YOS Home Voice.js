// YOS Home Voice — voice command adapter for existing MY REMOTE assets.
// Shortcut input: Dictate Text -> Run Script in Scriptable -> pass dictated text as Shortcut Parameter.

const parser = importModule('YOS Home Voice Parser');
const tapo = importModule('YOS Tapo H110 Core');

const BRAVIA = Object.freeze({
  host: 'yos.bravia.scriptable.host',
  psk: 'yos.bravia.scriptable.psk'
});

const TV_ALIASES = Object.freeze({
  power: ['poweroff', 'power'],
  input: ['input'],
  home: ['home'],
  back: ['return', 'back'],
  up: ['up'],
  down: ['down'],
  left: ['left'],
  right: ['right'],
  ok: ['confirm', 'enter'],
  volume_up: ['volumeup'],
  volume_down: ['volumedown'],
  mute: ['mute'],
  play: ['play'],
  pause: ['pause']
});

function shortcutInput() {
  const value = args.shortcutParameter;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String(value.text || value.command || '');
  if (Array.isArray(args.plainTexts) && args.plainTexts.length) return String(args.plainTexts[0] || '');
  return '';
}

function secure(key) {
  return Keychain.contains(key) ? Keychain.get(key) : '';
}

function normalizeHost(value) {
  const host = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
  if (!host || /[\s/?#]/.test(host)) throw new Error('テレビの接続設定を確認してください。');
  return host;
}

async function sonyJSON(host, psk, service, method, params = []) {
  const r = new Request(`http://${host}/sony/${service}`);
  r.method = 'POST';
  r.timeoutInterval = 8;
  r.headers = { 'Content-Type': 'application/json', 'X-Auth-PSK': psk };
  r.body = JSON.stringify({ method, params, id: 1, version: '1.0' });
  const text = await r.loadString();
  const status = r.response ? r.response.statusCode : 0;
  if (status < 200 || status >= 300) throw new Error(`テレビ通信エラー HTTP ${status}`);
  const data = JSON.parse(text);
  if (data && data.error) throw new Error('テレビが操作を受け付けませんでした。');
  return data;
}

async function braviaIndex(host, psk) {
  const data = await sonyJSON(host, psk, 'system', 'getRemoteControllerInfo');
  const commands = data && data.result && data.result[1];
  if (!Array.isArray(commands)) throw new Error('テレビの操作一覧を取得できませんでした。');
  const index = new Map();
  commands.forEach(item => {
    if (item && item.name && item.value) index.set(String(item.name).toLowerCase(), String(item.value));
  });
  return index;
}

function resolveTV(index, action) {
  for (const alias of TV_ALIASES[action] || []) {
    if (index.has(alias)) return index.get(alias);
  }
  return null;
}

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

async function sendIRCC(host, psk, code) {
  const r = new Request(`http://${host}/sony/ircc`);
  r.method = 'POST';
  r.timeoutInterval = 8;
  r.headers = {
    'Content-Type': 'text/xml; charset=UTF-8',
    'X-Auth-PSK': psk,
    SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'
  };
  r.body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>${xmlEscape(code)}</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>`;
  await r.loadString();
  const status = r.response ? r.response.statusCode : 0;
  if (status < 200 || status >= 300) throw new Error(`テレビ操作エラー HTTP ${status}`);
}

async function performTV(command) {
  const host = normalizeHost(secure(BRAVIA.host));
  const psk = secure(BRAVIA.psk);
  if (!psk) throw new Error('テレビの接続設定がありません。MY REMOTEで先に設定してください。');
  const index = await braviaIndex(host, psk);

  if (command.action === 'power_on' || command.action === 'power_off') {
    const state = await sonyJSON(host, psk, 'system', 'getPowerStatus');
    const status = String(state && state.result && state.result[0] && state.result[0].status || '').toLowerCase();
    const isOn = status === 'active';
    const wantOn = command.action === 'power_on';
    if (isOn === wantOn) return wantOn ? 'テレビはすでについています' : 'テレビはすでに消えています';
    const code = resolveTV(index, 'power');
    if (!code) throw new Error('このテレビでは電源操作を確認できません。');
    await sendIRCC(host, psk, code);
    return wantOn ? 'テレビをつけました' : 'テレビを消しました';
  }

  const code = resolveTV(index, command.action);
  if (!code) throw new Error('このテレビではその操作に対応していません。');
  await sendIRCC(host, psk, code);
  const labels = {
    volume_up: '音量を上げました', volume_down: '音量を下げました', mute: 'ミュートしました',
    home: 'ホームを開きました', back: '戻りました', input: '入力を切り替えました',
    up: '上へ移動しました', down: '下へ移動しました', left: '左へ移動しました', right: '右へ移動しました',
    ok: '決定しました', play: '再生しました', pause: '一時停止しました'
  };
  return labels[command.action] || 'テレビを操作しました';
}

function walk(value, out = []) {
  if (Array.isArray(value)) for (const v of value) walk(v, out);
  else if (value && typeof value === 'object') {
    out.push(value);
    for (const v of Object.values(value)) walk(v, out);
  }
  return out;
}

async function readAcState(client, remote) {
  const raw = await client.query({ method: 'control_child', params: { device_id: remote.device_id, requestData: { method: 'get_device_info', params: null } } });
  const info = walk(raw, []).find(x => typeof x.ac_status === 'string') || {};
  const s = {};
  if (typeof info.ac_status === 'string') {
    for (const part of info.ac_status.split('_')) {
      const m = String(part).match(/^([PMTSD])(-?\d+)$/);
      if (m) s[m[1]] = Number(m[2]);
    }
  }
  if (s.P == null && info.on != null) s.P = Number(info.on);
  if (s.M == null && info.ac_mode != null) s.M = Number(info.ac_mode);
  if (s.T == null && info.current_temp != null) s.T = Number(info.current_temp);
  if (s.S == null && info.wind_speed != null) s.S = Number(info.wind_speed);
  if (s.D == null && info.wind_direct != null) s.D = Number(info.wind_direct);
  if (!Number.isFinite(s.P)) s.P = 0;
  if (!Number.isFinite(s.M)) s.M = 0;
  if (!Number.isFinite(s.T)) s.T = 26;
  if (!Number.isFinite(s.S)) s.S = 0;
  if (!Number.isFinite(s.D)) s.D = 6;
  return s;
}

function acPayload(s) {
  return {
    power: !!s.P,
    on: !!s.P,
    mode: Number(s.M),
    temp: Math.max(18, Math.min(30, Number(s.T) || 26)),
    wind_speed: Math.max(0, Math.min(4, Number(s.S) || 0)),
    wind_direct: Math.max(0, Math.min(6, Number(s.D) || 0))
  };
}

async function performAC(command) {
  const remote = tapo.findRemote(r => String(r.model || '').toUpperCase() === 'AC' || /エアコン|air.?con/i.test(String(r.nickname || '')));
  if (!remote) throw new Error('エアコンが見つかりません。MY REMOTEの設定を確認してください。');
  const client = await tapo.client();
  const state = await readAcState(client, remote);

  if (command.action === 'power_on') state.P = 1;
  else if (command.action === 'power_off') state.P = 0;
  else if (command.action === 'set_temperature') {
    if (state.M === 4) throw new Error('除湿中は温度指定を変更しません。');
    state.P = 1;
    state.T = Number(command.value);
  } else if (command.action === 'temperature_up') {
    if (state.M === 4) throw new Error('除湿中は温度を変更しません。');
    state.P = 1;
    state.T = Math.min(30, state.T + 1);
  } else if (command.action === 'temperature_down') {
    if (state.M === 4) throw new Error('除湿中は温度を変更しません。');
    state.P = 1;
    state.T = Math.max(18, state.T - 1);
  } else throw new Error('そのエアコン操作にはまだ対応していません。');

  await client.controlAc(remote.device_id, acPayload(state));
  if (command.action === 'power_on') return 'エアコンをつけました';
  if (command.action === 'power_off') return 'エアコンを消しました';
  return `エアコンを${state.T}度にしました`;
}

async function performLight(command) {
  const predicate = r => /ライト|light/i.test(String(r.nickname || '')) || String(r.model || '').toLowerCase() === 'light';
  const candidates = {
    power_on: ['POWER ON', '点灯'],
    power_off: ['POWER OFF', '消灯'],
    brightness_up: ['BRIGHTNESS+', '明るくする', '明るい'],
    brightness_down: ['BRIGHTNESS-', '暗くする', '暗い']
  }[command.action];
  if (!candidates) throw new Error('その照明操作にはまだ対応していません。');
  await tapo.fireFriendly(predicate, candidates);
  const labels = {
    power_on: '電気をつけました', power_off: '電気を消しました',
    brightness_up: '電気を明るくしました', brightness_down: '電気を暗くしました'
  };
  return labels[command.action];
}

async function run() {
  const raw = shortcutInput();
  const command = parser.parseHomeVoice(raw);
  if (!command.ok) {
    Script.setShortcutOutput('わからなかったので、何も操作していません');
    Script.complete();
    return;
  }

  let message;
  if (command.device === 'tv') message = await performTV(command);
  else if (command.device === 'ac') message = await performAC(command);
  else if (command.device === 'light') message = await performLight(command);
  else throw new Error('対象の家電がわかりません。');

  Script.setShortcutOutput(message);
  Script.complete();
}

try {
  await run();
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  Script.setShortcutOutput(`操作できませんでした：${message}`);
  console.error(message);
  Script.complete();
}
