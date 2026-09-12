// YOS Life AUTO Remote v0.1
// Purpose: bridge life-state automations to the existing MY REMOTE controls.
// Reuses YOS Light Widget / YOS AC Widget and BRAVIA Keychain settings.
// Shortcut input examples: 帰宅 / くつろぐ / 就寝 / 外出 (or home / relax / sleep / away)

const VERSION = '0.1';

const CONFIG = Object.freeze({
  lightActionScript: 'YOS Light Widget',
  acActionScript: 'YOS AC Widget',
  stepDelayMs: 180,
});

// Conservative defaults:
// - 帰宅: light on + AC cooling while preserving the current set temperature.
// - くつろぐ: brightness one step darker. TV/AC state is preserved.
// - 就寝: BRAVIA OFF (PowerOff only; generic toggle is never used) + light off. AC state is preserved.
// - 外出: BRAVIA OFF + light off + AC stop.
// Exact sleep AC behavior is intentionally not fixed until the preferred sleep setting is confirmed.
const SCENES = Object.freeze({
  home: Object.freeze({
    label: '帰宅',
    aliases: Object.freeze(['home', 'return', 'arrive', '帰宅', '帰る']),
    steps: Object.freeze([
      Object.freeze({ device: 'light', action: 'on', label: '照明ON' }),
      Object.freeze({ device: 'ac', action: 'cool', label: 'エアコン冷房' }),
    ]),
  }),
  relax: Object.freeze({
    label: 'くつろぐ',
    aliases: Object.freeze(['relax', 'chill', 'くつろぐ', 'くつろぎ', 'リラックス']),
    steps: Object.freeze([
      Object.freeze({ device: 'light', action: 'dark', label: '照明を1段暗く' }),
    ]),
  }),
  sleep: Object.freeze({
    label: '就寝',
    aliases: Object.freeze(['sleep', 'night', 'bed', '寝る', '就寝', 'おやすみ']),
    steps: Object.freeze([
      Object.freeze({ device: 'tv', action: 'powerOffSafe', label: 'BRAVIA OFF' }),
      Object.freeze({ device: 'light', action: 'off', label: '照明OFF' }),
    ]),
  }),
  away: Object.freeze({
    label: '外出',
    aliases: Object.freeze(['away', 'leave', 'out', '外出', '出発']),
    steps: Object.freeze([
      Object.freeze({ device: 'tv', action: 'powerOffSafe', label: 'BRAVIA OFF' }),
      Object.freeze({ device: 'light', action: 'off', label: '照明OFF' }),
      Object.freeze({ device: 'ac', action: 'stop', label: 'エアコン停止' }),
    ]),
  }),
});

function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function sleep(ms) {
  return new Promise(resolve => Timer.schedule(ms, false, resolve));
}

function extractSceneInput() {
  const qp = args.queryParameters || {};
  if (qp.scene || qp.mode || qp.state) return qp.scene || qp.mode || qp.state;

  const sp = args.shortcutParameter;
  if (typeof sp === 'string' || typeof sp === 'number') return String(sp);
  if (sp && typeof sp === 'object') {
    return sp.scene || sp.mode || sp.state || sp.status || sp.name || '';
  }

  return args.plainTexts && args.plainTexts.length ? args.plainTexts[0] : '';
}

function resolveScene(value) {
  const target = normalize(value);
  if (!target) return null;
  for (const [key, scene] of Object.entries(SCENES)) {
    if (key === target) return { key, scene };
    if (scene.aliases.some(alias => normalize(alias) === target)) return { key, scene };
  }
  return null;
}

class SilentActionAlert {
  constructor() {
    this.title = '';
    this.message = '';
  }
  addAction() {}
  addCancelAction() {}
  addDestructiveAction() {}
  addTextField() {}
  addSecureTextField() {}
  textFieldValue() { return ''; }
  async presentAlert() {
    throw new Error(this.message || this.title || '既存リモコン操作に失敗しました。');
  }
  async presentSheet() {
    throw new Error(this.message || this.title || '既存リモコン操作に失敗しました。');
  }
}

function normalizeScriptName(value) {
  return String(value).replace(/\.js$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function readScript(scriptName) {
  for (const fm of [FileManager.iCloud(), FileManager.local()]) {
    const dir = fm.documentsDirectory();
    let files = [];
    try { files = fm.listContents(dir); } catch (_) {}

    for (const file of files) {
      const actual = normalizeScriptName(file);
      const wanted = normalizeScriptName(scriptName);
      if (actual !== wanted && actual !== normalizeScriptName(scriptName + '.js')) continue;

      const path = fm.joinPath(dir, file);
      try {
        if (fm.isFileStoredIniCloud(path)) await fm.downloadFileFromiCloud(path);
      } catch (_) {}
      return fm.readString(path);
    }
  }
  throw new Error(scriptName + ' がScriptableに見つかりません。');
}

async function runExistingAction(scriptName, action) {
  const source = await readScript(scriptName);
  const fakeArgs = {
    queryParameters: { action },
    shortcutParameter: null,
    widgetParameter: null,
    plainTexts: [],
    urls: [],
    fileURLs: [],
    images: [],
    notification: null,
  };
  const fakeScript = {
    name: () => scriptName,
    complete: () => {},
    setShortcutOutput: () => {},
    setWidget: () => {},
  };
  const fakeConfig = {
    runsInApp: true,
    runsInWidget: false,
    runsWithSiri: false,
    runsInNotification: false,
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runner = new AsyncFunction('args', 'Script', 'config', 'Alert', source);
  await runner(fakeArgs, fakeScript, fakeConfig, SilentActionAlert);
}

const SONY_STORAGE = Object.freeze({
  host: 'yos.bravia.scriptable.host',
  psk: 'yos.bravia.scriptable.psk',
});

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sonyHost() {
  if (!Keychain.contains(SONY_STORAGE.host)) throw new Error('BRAVIA IP設定がありません。');
  const host = Keychain.get(SONY_STORAGE.host).trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
  if (!host || /[\s/?#]/.test(host)) throw new Error('BRAVIA IP設定を確認してください。');
  return host;
}

function sonyPSK() {
  if (!Keychain.contains(SONY_STORAGE.psk)) throw new Error('BRAVIA PSK設定がありません。');
  return Keychain.get(SONY_STORAGE.psk);
}

async function sonyPowerOffSafe() {
  const host = sonyHost();
  const psk = sonyPSK();

  const discover = new Request('http://' + host + '/sony/system');
  discover.method = 'POST';
  discover.headers = {
    'Content-Type': 'application/json',
    'X-Auth-PSK': psk,
  };
  discover.body = JSON.stringify({
    method: 'getRemoteControllerInfo',
    params: [],
    id: 1,
    version: '1.0',
  });
  const raw = await discover.loadString();
  const status = discover.response ? discover.response.statusCode : 0;
  if (status < 200 || status >= 300) throw new Error('BRAVIAコマンド取得失敗（HTTP ' + status + '）');

  const payload = JSON.parse(raw);
  const list = payload && payload.result && payload.result[1];
  if (!Array.isArray(list)) throw new Error('BRAVIAコマンド一覧を取得できません。');

  // Important: automation never falls back to generic "Power", because that could toggle ON.
  const powerOff = list.find(item => item && String(item.name || '').toLowerCase() === 'poweroff');
  if (!powerOff || !powerOff.value) {
    throw new Error('BRAVIAにPowerOff専用コマンドがないため、安全のため自動OFFをスキップしました。');
  }

  const req = new Request('http://' + host + '/sony/ircc');
  req.method = 'POST';
  req.headers = {
    'Content-Type': 'text/xml; charset=UTF-8',
    'X-Auth-PSK': psk,
    SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
  };
  req.body = '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><u:X_SendIRCC xmlns:u="urn:schemas-com:service:IRCC:1#X_SendIRCC">' +
    '<IRCCCode>' + xmlEscape(powerOff.value) + '</IRCCCode>' +
    '</u:X_SendIRCC></s:Body></s:Envelope>';
  await req.loadString();
  const sendStatus = req.response ? req.response.statusCode : 0;
  if (sendStatus < 200 || sendStatus >= 300) throw new Error('BRAVIA OFF失敗（HTTP ' + sendStatus + '）');
}

async function executeStep(step) {
  if (step.device === 'light') {
    await runExistingAction(CONFIG.lightActionScript, step.action);
    return;
  }
  if (step.device === 'ac') {
    await runExistingAction(CONFIG.acActionScript, step.action);
    return;
  }
  if (step.device === 'tv' && step.action === 'powerOffSafe') {
    await sonyPowerOffSafe();
    return;
  }
  throw new Error('未対応のAUTO操作: ' + step.device + '/' + step.action);
}

async function runScene(key, scene) {
  const results = [];
  for (const step of scene.steps) {
    try {
      await executeStep(step);
      results.push({ ok: true, device: step.device, action: step.action, label: step.label });
    } catch (error) {
      results.push({
        ok: false,
        device: step.device,
        action: step.action,
        label: step.label,
        error: error && error.message ? error.message : String(error),
      });
    }
    if (CONFIG.stepDelayMs > 0) await sleep(CONFIG.stepDelayMs);
  }

  return {
    ok: results.every(item => item.ok),
    version: VERSION,
    scene: key,
    label: scene.label,
    results,
    executedAt: new Date().toISOString(),
  };
}

async function chooseSceneManually() {
  const keys = Object.keys(SCENES);
  const alert = new Alert();
  alert.title = '生活AUTO × MY REMOTE';
  alert.message = '実機テストするシーンを選択';
  for (const key of keys) alert.addAction(SCENES[key].label);
  alert.addCancelAction('キャンセル');
  const index = await alert.presentSheet();
  if (index < 0) return null;
  return { key: keys[index], scene: SCENES[keys[index]] };
}

async function main() {
  let selected = resolveScene(extractSceneInput());
  if (!selected && config.runsInApp && !config.runsWithSiri) selected = await chooseSceneManually();

  if (!selected) {
    const output = {
      ok: false,
      version: VERSION,
      error: 'scene_required',
      supported: Object.entries(SCENES).map(([key, scene]) => ({ key, label: scene.label })),
    };
    Script.setShortcutOutput(output);
    Script.complete();
    return;
  }

  const output = await runScene(selected.key, selected.scene);
  Script.setShortcutOutput(output);
  Script.complete();
}

await main();