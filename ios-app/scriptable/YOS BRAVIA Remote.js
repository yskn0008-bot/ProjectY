// YOS BRAVIA Remote — Scriptable fallback for Issue #292.
// Reuses the Sony runtime-command discovery and IRCC safety boundary from Issue #254 / PR #255.
// Requires Scriptable on iPhone and BRAVIA IP Control + Pre-Shared Key enabled on the TV.

const STORAGE = Object.freeze({
  host: 'yos.bravia.scriptable.host',
  psk: 'yos.bravia.scriptable.psk',
  quick: 'yos.bravia.scriptable.quick-command'
});

const ACTION_ALIASES = Object.freeze({
  power: ['poweroff', 'power'],
  input: ['input'],
  home: ['home'],
  back: ['return', 'back'],
  up: ['up'],
  left: ['left'],
  confirm: ['confirm', 'enter'],
  right: ['right'],
  down: ['down'],
  volumeDown: ['volumedown'],
  mute: ['mute'],
  volumeUp: ['volumeup'],
  channelDown: ['channeldown'],
  channelUp: ['channelup'],
  play: ['play'],
  pause: ['pause'],
  stop: ['stop'],
  flashMinus: ['flashminus'],
  flashPlus: ['flashplus'],
  prev: ['prev'],
  next: ['next']
});

const JAPANESE_REMOTE_LABELS = Object.freeze({
  power: '電源',
  poweroff: '電源OFF',
  input: '入力',
  home: 'ホーム',
  return: '戻る',
  back: '戻る',
  up: '上',
  down: '下',
  left: '左',
  right: '右',
  confirm: 'OK',
  enter: 'OK',
  volumedown: '音量−',
  volumeup: '音量＋',
  mute: 'ミュート',
  channeldown: 'CH−',
  channelup: 'CH＋',
  play: '再生',
  pause: '一時停止',
  stop: '停止',
  flashminus: '10秒戻し',
  flashplus: '15秒送り',
  prev: '前',
  next: '次',
  options: 'オプション',
  actionmenu: 'アクションメニュー',
  quick: 'クイック設定',
  settings: '設定',
  syncmenu: 'BRAVIA Sync',
  display: '画面表示',
  androidmenu: 'Androidメニュー',
  jump: '直前へ戻る',
  caption: '字幕',
  epg: '番組表',
  red: '赤',
  blue: '青',
  yellow: '黄',
  green: '緑',
  hdmi1: 'HDMI1',
  hdmi2: 'HDMI2',
  hdmi3: 'HDMI3',
  hdmi4: 'HDMI4',
  tendigital: '10キー',
  tenkey: '10キー',
  geodigital: '地デジ',
  pap: '2画面',
  ddata: 'dデータ',
  help: 'ヘルプ',
  bscs: 'BS/CS',
  advancedbscs: 'BS/CS 4K',
  cs: 'CS',
  bs: 'BS'
});

let host = readSecure(STORAGE.host);
let psk = readSecure(STORAGE.psk);
let remoteMap = new Map();
let remoteIndex = new Map();
let quickCandidates = [];
let table = new UITable();
table.showSeparators = false;

function readSecure(key) {
  return Keychain.contains(key) ? Keychain.get(key) : '';
}

function normalizeHost(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/:\d+$/, '');
  if (!normalized || /[\s/?#]/.test(normalized)) {
    throw new Error('テレビのIPアドレスまたはホスト名を確認してください。');
  }
  return normalized;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function irccEnvelope(code) {
  if (!code) throw new Error('未対応のコマンドです。');
  return '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
    '<IRCCCode>' + escapeXml(code) + '</IRCCCode>' +
    '</u:X_SendIRCC></s:Body></s:Envelope>';
}

async function requestText(url, options) {
  const request = new Request(url);
  request.method = options.method || 'GET';
  request.headers = options.headers || {};
  if (typeof options.body === 'string') request.body = options.body;
  const text = await request.loadString();
  const status = request.response ? request.response.statusCode : 0;
  if (status === 403) throw new Error('PSK認証に失敗しました。BRAVIA側と設定を確認してください。');
  if (status < 200 || status >= 300) throw new Error('BRAVIA通信に失敗しました（HTTP ' + status + '）。');
  return text;
}

async function discoverRemote() {
  host = normalizeHost(host);
  const text = await requestText('http://' + host + '/sony/system', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-PSK': psk
    },
    body: JSON.stringify({
      method: 'getRemoteControllerInfo',
      params: [],
      id: 1,
      version: '1.0'
    })
  });

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    throw new Error('テレビの対応コマンド一覧を読み取れませんでした。');
  }

  const list = payload && payload.result && payload.result[1];
  if (!Array.isArray(list)) throw new Error('テレビの対応コマンド一覧を読み取れませんでした。');

  remoteMap = new Map(
    list
      .filter(item => item && typeof item.name === 'string' && typeof item.value === 'string')
      .map(item => [item.name, item.value])
  );
  remoteIndex = new Map(
    [...remoteMap].map(([name, code]) => [name.toLowerCase(), { name, code }])
  );
  quickCandidates = [...remoteMap]
    .filter(([name]) => /option|actionmenu|quick|setting/i.test(name))
    .map(([name, code]) => ({ name, code }));
}

function resolveAction(action) {
  const aliases = ACTION_ALIASES[action] || [];
  for (const alias of aliases) {
    const command = remoteIndex.get(alias.toLowerCase());
    if (command) return command;
  }
  return null;
}

function commandByName(name) {
  return remoteIndex.get(String(name || '').toLowerCase()) || null;
}

async function sendCommand(command) {
  if (!command || !command.code) throw new Error('このテレビでは未対応です。');
  await requestText('http://' + host + '/sony/ircc', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'X-Auth-PSK': psk,
      SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'
    },
    body: irccEnvelope(command.code)
  });
}

async function sendAction(action) {
  try {
    await sendCommand(resolveAction(action));
  } catch (error) {
    await showError(error);
  }
}

async function showError(error) {
  const alert = new Alert();
  alert.title = 'BRAVIA';
  alert.message = error && error.message ? error.message : String(error);
  alert.addAction('OK');
  await alert.presentAlert();
}

async function configureConnection() {
  const alert = new Alert();
  alert.title = 'BRAVIA設定';
  alert.message = '初回だけテレビのIP/ホスト名とPSKを保存します。PSKはScriptableのKeychainへ保存されます。';
  alert.addTextField('テレビのIPまたはホスト名', host || '');
  alert.addSecureTextField(psk ? 'PSK（変更しないなら空欄）' : 'PSK', '');
  alert.addAction('保存して接続');
  alert.addCancelAction('キャンセル');
  const choice = await alert.presentAlert();
  if (choice < 0) return false;

  const nextHost = normalizeHost(alert.textFieldValue(0));
  const enteredPsk = alert.textFieldValue(1).trim();
  const nextPsk = enteredPsk || psk;
  if (!nextPsk) throw new Error('PSKを入力してください。');

  host = nextHost;
  psk = nextPsk;
  Keychain.set(STORAGE.host, host);
  Keychain.set(STORAGE.psk, psk);
  return true;
}

async function ensureConnectionSettings() {
  if (host && psk) return true;
  try {
    return await configureConnection();
  } catch (error) {
    await showError(error);
    return false;
  }
}

async function reconnect() {
  try {
    await discoverRemote();
    renderMain();
  } catch (error) {
    await showError(error);
  }
}

function storedQuickCommand() {
  if (!Keychain.contains(STORAGE.quick)) return null;
  return commandByName(Keychain.get(STORAGE.quick));
}

async function chooseQuickCandidate(sendAfterSelection) {
  if (quickCandidates.length === 0) {
    await showError(new Error('このテレビからクイック設定候補が返りませんでした。'));
    return null;
  }

  const alert = new Alert();
  alert.title = 'クイック設定候補';
  alert.message = '物理リモコンのクイック設定と同じ画面を開く候補を選んでください。最初は実機確認が必要です。';
  for (const candidate of quickCandidates) {
    const label = japaneseLabel(candidate.name);
    alert.addAction(label === candidate.name ? candidate.name : label + '｜' + candidate.name);
  }
  alert.addCancelAction('キャンセル');
  const choice = await alert.presentSheet();
  if (choice < 0) return null;

  const selected = quickCandidates[choice];
  Keychain.set(STORAGE.quick, selected.name);
  if (sendAfterSelection) {
    try {
      await sendCommand(selected);
    } catch (error) {
      await showError(error);
    }
  }
  return selected;
}

async function sendQuick() {
  const saved = storedQuickCommand();
  if (saved) {
    try {
      await sendCommand(saved);
    } catch (error) {
      await showError(error);
    }
    return;
  }
  await chooseQuickCandidate(true);
}

function japaneseLabel(remoteName) {
  const key = String(remoteName || '').toLowerCase();
  return JAPANESE_REMOTE_LABELS[key] || remoteName;
}

function isActionSupported(action) {
  return Boolean(resolveAction(action));
}

function buttonCell(title, handler, supported = true) {
  const cell = UITableCell.button(title);
  cell.widthWeight = 1;
  cell.centerAligned();
  cell.dismissOnTap = false;
  if (supported) {
    cell.onTap = handler;
  } else {
    cell.titleColor = new Color('#8E8E93');
  }
  return cell;
}

function spacerCell() {
  const cell = UITableCell.text('');
  cell.widthWeight = 1;
  return cell;
}

function addGridRow(items, height = 54) {
  const row = new UITableRow();
  row.height = height;
  row.cellSpacing = 4;
  for (const item of items) {
    if (!item) {
      row.addCell(spacerCell());
      continue;
    }
    row.addCell(buttonCell(item.title, item.onTap, item.supported !== false));
  }
  table.addRow(row);
}

function addTitle(title, subtitle) {
  const row = new UITableRow();
  row.height = 62;
  const cell = row.addText(title, subtitle || '');
  cell.titleFont = Font.boldSystemFont(22);
  cell.subtitleFont = Font.systemFont(12);
  table.addRow(row);
}

function addSection(title) {
  const row = new UITableRow();
  row.isHeader = true;
  row.height = 34;
  const cell = row.addText(title);
  cell.titleFont = Font.semiboldSystemFont(13);
  table.addRow(row);
}

function actionButton(title, action) {
  return {
    title,
    supported: isActionSupported(action),
    onTap: async () => sendAction(action)
  };
}

function renderMain() {
  table.removeAllRows();
  addTitle('BRAVIA', '接続済み · ' + remoteMap.size + 'コマンド · ' + host);

  addGridRow([
    actionButton('⏻ 電源', 'power'),
    actionButton('入力', 'input'),
    {
      title: 'クイック',
      supported: quickCandidates.length > 0,
      onTap: sendQuick
    }
  ]);

  addGridRow([
    actionButton('戻る', 'back'),
    actionButton('ホーム', 'home')
  ]);

  addSection('方向キー');
  addGridRow([null, actionButton('▲', 'up'), null], 50);
  addGridRow([actionButton('◀', 'left'), actionButton('OK', 'confirm'), actionButton('▶', 'right')], 58);
  addGridRow([null, actionButton('▼', 'down'), null], 50);

  addSection('音量・チャンネル');
  addGridRow([
    actionButton('音量−', 'volumeDown'),
    actionButton('ミュート', 'mute'),
    actionButton('音量＋', 'volumeUp')
  ]);
  addGridRow([
    actionButton('CH−', 'channelDown'),
    actionButton('CH＋', 'channelUp')
  ], 48);

  addSection('再生');
  addGridRow([
    actionButton('10秒戻し', 'flashMinus'),
    actionButton('再生', 'play'),
    actionButton('15秒送り', 'flashPlus')
  ]);
  addGridRow([
    actionButton('前', 'prev'),
    actionButton('一時停止', 'pause'),
    actionButton('次', 'next')
  ], 48);

  addGridRow([
    { title: 'その他', onTap: renderAllCommands },
    { title: '設定', onTap: renderSettings }
  ], 48);

  table.reload();
}

function renderAllCommands() {
  table.removeAllRows();
  addTitle('その他のボタン', 'テレビが実際に返したコマンドだけ表示');
  addGridRow([{ title: '‹ 戻る', onTap: renderMain }], 44);

  const commands = [...remoteMap]
    .map(([name, code]) => ({ name, code, label: japaneseLabel(name) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));

  for (let index = 0; index < commands.length; index += 2) {
    const pair = commands.slice(index, index + 2).map(command => ({
      title: command.label,
      onTap: async () => {
        try {
          await sendCommand(command);
        } catch (error) {
          await showError(error);
        }
      }
    }));
    addGridRow(pair, 48);
  }
  table.reload();
}

function renderSettings() {
  table.removeAllRows();
  addTitle('BRAVIA設定', host);
  addGridRow([{ title: '‹ 戻る', onTap: renderMain }], 44);

  addGridRow([{
    title: '接続し直す',
    onTap: reconnect
  }]);

  addGridRow([{
    title: 'TV / PSKを変更',
    onTap: async () => {
      try {
        const saved = await configureConnection();
        if (!saved) return;
        await discoverRemote();
        renderMain();
      } catch (error) {
        await showError(error);
      }
    }
  }]);

  addGridRow([{
    title: 'クイック候補を選び直す',
    supported: quickCandidates.length > 0,
    onTap: async () => {
      if (Keychain.contains(STORAGE.quick)) Keychain.remove(STORAGE.quick);
      await chooseQuickCandidate(false);
      renderSettings();
    }
  }]);

  addGridRow([{
    title: '保存設定を削除',
    onTap: async () => {
      const confirm = new Alert();
      confirm.title = '保存設定を削除';
      confirm.message = 'TV host・PSK・クイック候補をこのiPhoneのScriptableから削除します。';
      confirm.addDestructiveAction('削除');
      confirm.addCancelAction('キャンセル');
      if (await confirm.presentAlert() !== 0) return;
      for (const key of Object.values(STORAGE)) {
        if (Keychain.contains(key)) Keychain.remove(key);
      }
      host = '';
      psk = '';
      remoteMap = new Map();
      remoteIndex = new Map();
      quickCandidates = [];
      const ready = await ensureConnectionSettings();
      if (!ready) return;
      try {
        await discoverRemote();
        renderMain();
      } catch (error) {
        await showError(error);
      }
    }
  }]);

  table.reload();
}

async function start() {
  const ready = await ensureConnectionSettings();
  if (!ready) return;

  try {
    await discoverRemote();
  } catch (error) {
    const alert = new Alert();
    alert.title = 'BRAVIAへ接続できません';
    alert.message = error && error.message ? error.message : String(error);
    alert.addAction('設定を変更');
    alert.addAction('再試行');
    alert.addCancelAction('終了');
    const choice = await alert.presentAlert();
    if (choice < 0) return;
    if (choice === 0) {
      try {
        const saved = await configureConnection();
        if (!saved) return;
      } catch (configError) {
        await showError(configError);
        return;
      }
    }
    try {
      await discoverRemote();
    } catch (retryError) {
      await showError(retryError);
      return;
    }
  }

  renderMain();
  await table.present(true);
}

await start();
Script.complete();
