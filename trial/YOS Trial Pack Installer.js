// YOS Trial Pack Installer v1.2
// Installs only isolated, currently testable Scriptable prototypes.
// Existing files are backed up before replacement. No secrets are embedded.

const SOURCES = [
  {
    name: 'YOS Home Voice Parser.js',
    url: 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/530f8122f00c75143487a3ab95f67f3c6da22985/ios-app/scriptable/remote-voice/YOS%20Home%20Voice%20Parser.js',
  },
  {
    name: 'YOS Home Voice.js',
    url: 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/530f8122f00c75143487a3ab95f67f3c6da22985/ios-app/scriptable/remote-voice/YOS%20Home%20Voice.js',
  },
  {
    name: 'YOS Departure Guard.js',
    url: 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/038599e5aaf6dd12fc1e972a65b6678f28f0fd2e/tools/departure-guard/YOS%20Departure%20Guard.js',
  },
  {
    name: 'MY_WAY_NOW_WIDGET_v1.js',
    url: 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/bd194474ab2b9602064a0ebab19a51d7af395fe2/widgets/MY_WAY_NOW_WIDGET_v1.js',
  },
  {
    name: 'YOS Trial Launcher.js',
    url: 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/b54072218c9a3954306f918e0fc098baa02db640/trial/YOS%20Trial%20Launcher.js',
  },
];

const fm = FileManager.iCloud();
const docs = fm.documentsDirectory();
const backupRoot = fm.joinPath(docs, 'YOS Trial Pack Backups');

function targetPath(name) { return fm.joinPath(docs, name); }
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }

async function ensureLocal(path) {
  if (!fm.fileExists(path)) return;
  try {
    if (fm.isFileStoredIniCloud(path)) await fm.downloadFileFromiCloud(path);
  } catch (_) {}
}

async function fetchText(source) {
  const request = new Request(source.url);
  request.timeoutInterval = 25;
  const text = await request.loadString();
  const status = Number(request.response?.statusCode || 0);
  if (status < 200 || status >= 300 || !text || text.length < 80) {
    throw new Error(`${source.name} の取得に失敗しました（HTTP ${status}）`);
  }
  return patchForTrial(source.name, text);
}

function patchForTrial(name, text) {
  if (name === 'YOS Home Voice Parser.js') {
    const marker = "  if (/(テレビ|tv)/.test(s)) {";
    const youtubeRule = "  if (/(youtube|ユーチューブ)/.test(s) && /(見せて|みせて|開いて|ひらいて|つけて|付けて|起動)/.test(s)) return ok('tv', 'youtube');\n\n";
    if (!text.includes(marker)) throw new Error('Home Voice Parserの修正対象を確認できませんでした');
    text = text.replace(marker, youtubeRule + marker);
  }

  if (name === 'YOS Home Voice.js') {
    const oldLine = "  return String(await Dictation.start('ja-JP') || '').trim();";
    const inputReplacement = [
      "  const a = new Alert();",
      "  a.title = '家の音声操作';",
      "  a.message = '入力欄をタップして、キーボードのマイクで話してください。';",
      "  a.addTextField('例：テレビをつけて');",
      "  a.addAction('実行');",
      "  a.addCancelAction('やめる');",
      "  const choice = await a.presentAlert();",
      "  if (choice < 0) return '';",
      "  return String(a.textFieldValue(0) || '').trim();",
    ].join('\n');
    if (!text.includes(oldLine)) throw new Error('Home Voice入力の修正対象を確認できませんでした');
    text = text.replace(oldLine, inputReplacement);

    const powerBlock = [
      "  if (command.action === 'power_on' || command.action === 'power_off') {",
      "    const state = await sonyJSON(host, psk, 'system', 'getPowerStatus');",
      "    const status = String(state && state.result && state.result[0] && state.result[0].status || '').toLowerCase();",
      "    const isOn = status === 'active';",
      "    const wantOn = command.action === 'power_on';",
      "    if (isOn === wantOn) return wantOn ? 'テレビはすでについています' : 'テレビはすでに消えています';",
      "    const code = resolveTV(index, 'power');",
      "    if (!code) throw new Error('このテレビでは電源操作を確認できません。');",
      "    await sendIRCC(host, psk, code);",
      "    return wantOn ? 'テレビをつけました' : 'テレビを消しました';",
      "  }",
    ].join('\n');

    const enhancedTvBlock = [
      "  if (command.action === 'youtube') {",
      "    const data = await sonyJSON(host, psk, 'appControl', 'getApplicationList');",
      "    const apps = walk(data, []).filter(x => x && typeof x.uri === 'string');",
      "    const app = apps.find(x => /youtube/i.test(String(x.title || x.name || '')));",
      "    if (!app) throw new Error('テレビのYouTubeアプリを見つけられませんでした。');",
      "    await sonyJSON(host, psk, 'appControl', 'setActiveApp', [{ uri: app.uri }]);",
      "    return 'YouTubeを開きました';",
      "  }",
      "",
      "  if (command.action === 'power_on' || command.action === 'power_off') {",
      "    const wantOn = command.action === 'power_on';",
      "    let isOn = null;",
      "    try {",
      "      const state = await sonyJSON(host, psk, 'system', 'getPowerStatus');",
      "      const status = String(state && state.result && state.result[0] && state.result[0].status || '').toLowerCase();",
      "      isOn = status === 'active';",
      "    } catch (_) {}",
      "    if (isOn === wantOn) return wantOn ? 'テレビはすでについています' : 'テレビはすでに消えています';",
      "    if (wantOn) {",
      "      try {",
      "        await sonyJSON(host, psk, 'system', 'setPowerStatus', [{ status: true }]);",
      "        return 'テレビをつけました';",
      "      } catch (_) {}",
      "    }",
      "    const code = resolveTV(index, 'power');",
      "    if (!code) throw new Error('このテレビでは電源操作を確認できません。');",
      "    try {",
      "      await sendIRCC(host, psk, code);",
      "    } catch (error) {",
      "      if (wantOn) throw new Error('テレビを起動できません。テレビ側のリモート起動／ネットワークスタンバイ設定を確認してください。');",
      "      throw error;",
      "    }",
      "    return wantOn ? 'テレビをつけました' : 'テレビを消しました';",
      "  }",
    ].join('\n');
    if (!text.includes(powerBlock)) throw new Error('Home Voiceテレビ操作の修正対象を確認できませんでした');
    text = text.replace(powerBlock, enhancedTvBlock);

    const successMarker = "  Script.setShortcutOutput(message);\n  Script.complete();";
    const successReplacement = [
      "  if (config.runsInApp) {",
      "    const a = new Alert();",
      "    a.title = '家の音声操作';",
      "    a.message = message;",
      "    a.addAction('OK');",
      "    await a.presentAlert();",
      "  }",
      "  Script.setShortcutOutput(message);",
      "  Script.complete();",
    ].join('\n');
    if (!text.includes(successMarker)) throw new Error('Home Voice成功表示の修正対象を確認できませんでした');
    text = text.replace(successMarker, successReplacement);

    const errorMarker = "  Script.setShortcutOutput(`操作できませんでした：${message}`);\n  console.error(message);\n  Script.complete();";
    const errorReplacement = [
      "  if (config.runsInApp) {",
      "    const a = new Alert();",
      "    a.title = '操作できませんでした';",
      "    a.message = message;",
      "    a.addAction('OK');",
      "    await a.presentAlert();",
      "  }",
      "  Script.setShortcutOutput(`操作できませんでした：${message}`);",
      "  console.error(message);",
      "  Script.complete();",
    ].join('\n');
    if (!text.includes(errorMarker)) throw new Error('Home Voiceエラー表示の修正対象を確認できませんでした');
    text = text.replace(errorMarker, errorReplacement);
  }

  if (name === 'YOS Departure Guard.js') {
    const marker = "  Script.complete()\n}\n\nasync function findNextEvent";
    const replacement = [
      "  if (config.runsInApp) {",
      "    const a = new Alert();",
      "    a.title = '出発チェック';",
      "    const lines = [];",
      "    if (nextEvent) lines.push(`次: ${formatTime(nextEvent.startDate)} ${nextEvent.title || '予定'}`);",
      "    if (decision.departureAt) lines.push(`出発目安: ${formatTime(decision.departureAt)}`);",
      "    if (decision.warningLines.length) lines.push(...decision.warningLines.map(x => `⚠︎ ${x}`));",
      "    if (!lines.length) lines.push('今は対応が必要な項目はありません。');",
      "    a.message = lines.join('\\n');",
      "    a.addAction('OK');",
      "    await a.presentAlert();",
      "  }",
      "  Script.complete()",
      "}",
      "",
      "async function findNextEvent",
    ].join('\n');
    if (!text.includes(marker)) throw new Error('Departure Guardの修正対象を確認できませんでした');
    text = text.replace(marker, replacement);
  }

  return text;
}

function existingRemoteCore() {
  const names = ['YOS Tapo H110 Core.js'];
  const local = FileManager.local();
  for (const name of names) {
    if (fm.fileExists(targetPath(name))) return true;
    if (local.fileExists(local.joinPath(local.documentsDirectory(), name))) return true;
  }
  return false;
}

async function run() {
  const downloaded = {};
  for (const source of SOURCES) downloaded[source.name] = await fetchText(source);

  if (!fm.fileExists(backupRoot)) fm.createDirectory(backupRoot, true);
  const backupDir = fm.joinPath(backupRoot, stamp());
  let backupCreated = false;

  for (const source of SOURCES) {
    const target = targetPath(source.name);
    if (!fm.fileExists(target)) continue;
    if (!backupCreated) {
      fm.createDirectory(backupDir, true);
      backupCreated = true;
    }
    await ensureLocal(target);
    fm.writeString(fm.joinPath(backupDir, source.name), fm.readString(target));
  }

  const written = [];
  try {
    for (const source of SOURCES) {
      const target = targetPath(source.name);
      const text = downloaded[source.name];
      fm.writeString(target, text);
      if (fm.readString(target) !== text) throw new Error(`${source.name} の保存確認に失敗しました`);
      written.push(source.name);
    }
  } catch (error) {
    for (const name of [...written].reverse()) {
      const target = targetPath(name);
      const backup = backupCreated ? fm.joinPath(backupDir, name) : null;
      if (backup && fm.fileExists(backup)) fm.writeString(target, fm.readString(backup));
      else if (fm.fileExists(target)) fm.remove(target);
    }
    throw error;
  }

  const lines = [
    '✓ 家の音声操作',
    '✓ 出発チェック',
    '✓ MY WAY NOW Widget',
    '✓ Trial Launcher',
  ];
  if (!existingRemoteCore()) lines.push('', '※ 家の音声操作だけ、先にMY REMOTE更新が必要です');
  lines.push('', '次は Trial Launcher を開けば、試せるものを1画面から順番に試せます。');

  const alert = new Alert();
  alert.title = '試用セット 準備完了';
  alert.message = lines.join('\n');
  alert.addAction('試す');
  alert.addCancelAction('あとで');
  const choice = await alert.presentAlert();
  if (choice === 0) Safari.open('scriptable:///run/YOS%20Trial%20Launcher');
}

try {
  await run();
} catch (error) {
  const alert = new Alert();
  alert.title = '試用セットの準備に失敗';
  alert.message = error?.message || String(error);
  alert.addAction('OK');
  await alert.presentAlert();
}

Script.complete();
