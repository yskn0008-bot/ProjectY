// YOS Home Bridge — fixed local executor for Clarity Next.
// Input: args.shortcutParameter (one explicit home-control phrase).
// Reuses existing MY REMOTE Keychain/Tapo assets. No credentials are embedded.

function inputText() {
  const value = args.shortcutParameter;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String(value.command || value.text || '');
  if (Array.isArray(args.plainTexts) && args.plainTexts.length) return String(args.plainTexts[0] || '');
  return '';
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[、。．，,.!！?？]/g, '').replace(/\s+/g, '').trim();
}
function command(device, action, value = null) { return { device, action, value }; }

function parseHomeCommand(raw) {
  const s = normalize(raw);
  if (!s) throw new Error('家電操作の内容がありません。');
  if (/全部.*消/.test(s) || /^(暑い|寒い|暗い|明るい|寝る|おやすみ)$/.test(s)) {
    throw new Error('家電操作が曖昧なので実行しませんでした。');
  }

  if (/エアコン/.test(s)) {
    if (/(消して|切って|オフ|停止)/.test(s)) return command('ac', 'power_off');
    if (/(つけて|付けて|オン|入れて|運転)/.test(s) && !/度/.test(s)) return command('ac', 'power_on');
    const temp = s.match(/(1[89]|2\d|30)度/);
    if (temp) return command('ac', 'set_temperature', Number(temp[1]));
    if (/(1度|一度).*(上げて|あげて)/.test(s) || /温度.*(上げて|あげて)/.test(s)) return command('ac', 'temperature_up');
    if (/(1度|一度).*(下げて|さげて)/.test(s) || /温度.*(下げて|さげて)/.test(s)) return command('ac', 'temperature_down');
    throw new Error('そのエアコン操作にはまだ対応していません。');
  }
  const bareTemp = s.match(/^(1[89]|2\d|30)度(?:に)?(?:して|設定して|設定)?$/);
  if (bareTemp) return command('ac', 'set_temperature', Number(bareTemp[1]));
  if (/^(1度|一度)(上げて|あげて)$/.test(s)) return command('ac', 'temperature_up');
  if (/^(1度|一度)(下げて|さげて)$/.test(s)) return command('ac', 'temperature_down');

  if (/(電気|照明|ライト)/.test(s)) {
    if (/(消して|切って|オフ)/.test(s)) return command('light', 'power_off');
    if (/(つけて|付けて|オン|点けて|点灯)/.test(s)) return command('light', 'power_on');
    if (/(明るく|明るめ)/.test(s)) return command('light', 'brightness_up');
    if (/(暗く|暗め)/.test(s)) return command('light', 'brightness_down');
    throw new Error('その照明操作にはまだ対応していません。');
  }
  if (/^(明るくして|もっと明るくして)$/.test(s)) return command('light', 'brightness_up');
  if (/^(暗くして|もっと暗くして)$/.test(s)) return command('light', 'brightness_down');

  if (/(テレビ|tv)/.test(s)) {
    if (/(つけて|付けて|オン|電源入れて)/.test(s)) return command('tv', 'power_on');
    if (/(消して|切って|オフ|電源切って)/.test(s)) return command('tv', 'power_off');
    if (/入力/.test(s)) return command('tv', 'input');
    if (/ホーム/.test(s)) return command('tv', 'home');
    if (/戻/.test(s)) return command('tv', 'back');
  }
  if (/ミュート|消音/.test(s)) return command('tv', 'mute');
  if (/音量.*(上げ|あげ|大きく)/.test(s)) return command('tv', 'volume_up');
  if (/音量.*(下げ|さげ|小さく)/.test(s)) return command('tv', 'volume_down');
  if (/^(ホーム|ホーム開いて)$/.test(s)) return command('tv', 'home');
  if (/^(戻って|戻る|バック)$/.test(s)) return command('tv', 'back');
  if (/^(入力|入力切り替えて|入力変えて)$/.test(s)) return command('tv', 'input');
  if (/^(上|上に|上へ)$/.test(s)) return command('tv', 'up');
  if (/^(下|下に|下へ)$/.test(s)) return command('tv', 'down');
  if (/^(左|左に|左へ)$/.test(s)) return command('tv', 'left');
  if (/^(右|右に|右へ)$/.test(s)) return command('tv', 'right');
  if (/^(決定|ok|オーケー)$/.test(s)) return command('tv', 'ok');
  if (/^(再生|再生して)$/.test(s)) return command('tv', 'play');
  if (/^(一時停止|止めて|ポーズ)$/.test(s)) return command('tv', 'pause');
  throw new Error('その家電操作にはまだ対応していません。');
}

function loadTapo() {
  for (const name of ['リモコン/内部/Tapo共通', 'YOS Tapo H110 Core']) {
    try { return importModule(name); } catch (_) {}
  }
  throw new Error('MY REMOTEのTapo共通部品が見つかりません。');
}
const tapo = loadTapo();

const BRAVIA = Object.freeze({ host: 'yos.bravia.scriptable.host', psk: 'yos.bravia.scriptable.psk' });
const TV_ALIASES = Object.freeze({
  power: ['poweroff', 'power'], input: ['input'], home: ['home'], back: ['return', 'back'],
  up: ['up'], down: ['down'], left: ['left'], right: ['right'], ok: ['confirm', 'enter'],
  volume_up: ['volumeup'], volume_down: ['volumedown'], mute: ['mute'], play: ['play'], pause: ['pause']
});
function secure(key) { return Keychain.contains(key) ? Keychain.get(key) : ''; }
function normalizeHost(value) {
  const host = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
  if (!host || /[\s/?#]/.test(host)) throw new Error('テレビの接続設定を確認してください。');
  return host;
}
async function sonyJSON(host, psk, service, method, params = []) {
  const r = new Request(`http://${host}/sony/${service}`);
  r.method = 'POST'; r.timeoutInterval = 8;
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
  commands.forEach(item => { if (item && item.name && item.value) index.set(String(item.name).toLowerCase(), String(item.value)); });
  return index;
}
function resolveTV(index, action) {
  for (const alias of TV_ALIASES[action] || []) if (index.has(alias)) return index.get(alias);
  return null;
}
function xmlEscape(value) {
  return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
async function sendIRCC(host, psk, code) {
  const r = new Request(`http://${host}/sony/ircc`);
  r.method = 'POST'; r.timeoutInterval = 8;
  r.headers = { 'Content-Type':'text/xml; charset=UTF-8', 'X-Auth-PSK':psk, SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"' };
  r.body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>${xmlEscape(code)}</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>`;
  await r.loadString();
  const status = r.response ? r.response.statusCode : 0;
  if (status < 200 || status >= 300) throw new Error(`テレビ操作エラー HTTP ${status}`);
}
async function performTV(c) {
  const host = normalizeHost(secure(BRAVIA.host));
  const psk = secure(BRAVIA.psk);
  if (!psk) throw new Error('テレビの接続設定がありません。');

  if (c.action === 'power_on' || c.action === 'power_off') {
    const wantOn = c.action === 'power_on';
    try {
      const state = await sonyJSON(host, psk, 'system', 'getPowerStatus');
      const status = String(state && state.result && state.result[0] && state.result[0].status || '').toLowerCase();
      if ((status === 'active') === wantOn) return wantOn ? 'テレビはすでについています' : 'テレビはすでに消えています';
    } catch (_) {}
    if (wantOn) {
      try {
        await sonyJSON(host, psk, 'system', 'setPowerStatus', [{ status: true }]);
        return 'テレビをつけました';
      } catch (_) {}
    }
    const index = await braviaIndex(host, psk);
    const code = resolveTV(index, 'power');
    if (!code) throw new Error('このテレビでは電源操作を確認できません。');
    await sendIRCC(host, psk, code);
    return wantOn ? 'テレビをつけました' : 'テレビを消しました';
  }

  const index = await braviaIndex(host, psk);
  const code = resolveTV(index, c.action);
  if (!code) throw new Error('このテレビではその操作に対応していません。');
  await sendIRCC(host, psk, code);
  const labels = {
    volume_up:'音量を上げました', volume_down:'音量を下げました', mute:'ミュートしました',
    home:'ホームを開きました', back:'戻りました', input:'入力を切り替えました',
    up:'上へ移動しました', down:'下へ移動しました', left:'左へ移動しました', right:'右へ移動しました',
    ok:'決定しました', play:'再生しました', pause:'一時停止しました'
  };
  return labels[c.action] || 'テレビを操作しました';
}

function walk(value, out = []) {
  if (Array.isArray(value)) for (const v of value) walk(v, out);
  else if (value && typeof value === 'object') { out.push(value); for (const v of Object.values(value)) walk(v, out); }
  return out;
}
async function readAcState(client, remote) {
  const raw = await client.query({ method:'control_child', params:{ device_id:remote.device_id, requestData:{ method:'get_device_info', params:null } } });
  const info = walk(raw, []).find(x => typeof x.ac_status === 'string') || {};
  const s = {};
  if (typeof info.ac_status === 'string') for (const part of info.ac_status.split('_')) {
    const m = String(part).match(/^([PMTSD])(-?\d+)$/); if (m) s[m[1]] = Number(m[2]);
  }
  if (s.P == null && info.on != null) s.P = Number(info.on);
  if (s.M == null && info.ac_mode != null) s.M = Number(info.ac_mode);
  if (s.T == null && info.current_temp != null) s.T = Number(info.current_temp);
  if (s.S == null && info.wind_speed != null) s.S = Number(info.wind_speed);
  if (s.D == null && info.wind_direct != null) s.D = Number(info.wind_direct);
  if (!Number.isFinite(s.P)) s.P=0; if (!Number.isFinite(s.M)) s.M=0; if (!Number.isFinite(s.T)) s.T=26;
  if (!Number.isFinite(s.S)) s.S=0; if (!Number.isFinite(s.D)) s.D=6;
  return s;
}
function acPayload(s) {
  return { power:!!s.P, on:!!s.P, mode:Number(s.M), temp:Math.max(18,Math.min(30,Number(s.T)||26)),
    wind_speed:Math.max(0,Math.min(4,Number(s.S)||0)), wind_direct:Math.max(0,Math.min(6,Number(s.D)||0)) };
}
async function performAC(c) {
  const remote = tapo.findRemote(r => String(r.model || '').toUpperCase()==='AC' || /エアコン|air.?con/i.test(String(r.nickname || '')));
  if (!remote) throw new Error('エアコンが見つかりません。');
  const client = await tapo.client();
  const s = await readAcState(client, remote);
  if (c.action==='power_on') s.P=1;
  else if (c.action==='power_off') s.P=0;
  else if (c.action==='set_temperature') { if (s.M===4) throw new Error('除湿中は温度指定を変更しません。'); s.P=1; s.T=Number(c.value); }
  else if (c.action==='temperature_up') { if (s.M===4) throw new Error('除湿中は温度を変更しません。'); s.P=1; s.T=Math.min(30,s.T+1); }
  else if (c.action==='temperature_down') { if (s.M===4) throw new Error('除湿中は温度を変更しません。'); s.P=1; s.T=Math.max(18,s.T-1); }
  else throw new Error('そのエアコン操作にはまだ対応していません。');
  await client.controlAc(remote.device_id, acPayload(s));
  if (c.action==='power_on') return 'エアコンをつけました';
  if (c.action==='power_off') return 'エアコンを消しました';
  return `エアコンを${s.T}度にしました`;
}
async function performLight(c) {
  const predicate = r => /ライト|light/i.test(String(r.nickname || '')) || String(r.model || '').toLowerCase()==='light';
  const candidates = {
    power_on:['POWER ON','点灯'], power_off:['POWER OFF','消灯'],
    brightness_up:['BRIGHTNESS+','明るくする','明るい'], brightness_down:['BRIGHTNESS-','暗くする','暗い']
  }[c.action];
  if (!candidates) throw new Error('その照明操作にはまだ対応していません。');
  await tapo.fireFriendly(predicate, candidates);
  return ({power_on:'電気をつけました',power_off:'電気を消しました',brightness_up:'電気を明るくしました',brightness_down:'電気を暗くしました'})[c.action];
}

const parsed = parseHomeCommand(inputText());
let result;
if (parsed.device==='tv') result=await performTV(parsed);
else if (parsed.device==='ac') result=await performAC(parsed);
else if (parsed.device==='light') result=await performLight(parsed);
else throw new Error('対象の家電がわかりません。');
Script.setShortcutOutput(result);
Script.complete();
