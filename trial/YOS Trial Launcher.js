// YOS Trial Launcher v1
// One screen for currently iPhone-testable ProjectY prototypes.

const fmCloud = FileManager.iCloud();
const cloudDocs = fmCloud.documentsDirectory();
const fmLocal = FileManager.local();
const localDocs = fmLocal.documentsDirectory();

const SCRIPTS = {
  homeVoice: 'YOS Home Voice.js',
  departureGuard: 'YOS Departure Guard.js',
  nowWidget: 'MY_WAY_NOW_WIDGET_v1.js',
  remoteCore: 'YOS Tapo H110 Core.js',
};

function exists(name) {
  return fmCloud.fileExists(fmCloud.joinPath(cloudDocs, name)) ||
    fmLocal.fileExists(fmLocal.joinPath(localDocs, name));
}

function runScript(name) {
  const encoded = encodeURIComponent(name.replace(/\.js$/i, ''));
  Safari.open(`scriptable:///run/${encoded}`);
}

async function showStatus() {
  const home = exists(SCRIPTS.homeVoice);
  const core = exists(SCRIPTS.remoteCore);
  const departure = exists(SCRIPTS.departureGuard);
  const widget = exists(SCRIPTS.nowWidget);
  const widgetToken = Keychain.contains('MY_WAY_WIDGET_TOKEN') && Keychain.get('MY_WAY_WIDGET_TOKEN').trim();

  const lines = [
    `家の音声操作: ${home && core ? '試せる' : home ? 'MY REMOTE更新が必要' : '未導入'}`,
    `出発チェック: ${departure ? '試せる' : '未導入'}`,
    `NOW Widget: ${widget ? (widgetToken ? '試せる' : '導入済み・接続設定待ち') : '未導入'}`,
    'MY WAY Home: ブラウザで試せる',
  ];

  const alert = new Alert();
  alert.title = '試せるもの';
  alert.message = lines.join('\n');
  alert.addAction('OK');
  await alert.presentAlert();
}

const menu = new Alert();
menu.title = 'YOS Trial Launcher';
menu.message = 'いま試せるものだけ並べています。';
menu.addAction('家の音声操作を試す');
menu.addAction('出発チェックを試す');
menu.addAction('NOW Widgetを試す');
menu.addAction('MY WAY Homeを開く');
menu.addAction('状態を見る');
menu.addCancelAction('閉じる');

const choice = await menu.presentSheet();

if (choice === 0) {
  if (!exists(SCRIPTS.homeVoice)) {
    const a = new Alert();
    a.title = '未導入';
    a.message = 'Trial Pack Installerをもう一度実行してください。';
    a.addAction('OK');
    await a.presentAlert();
  } else if (!exists(SCRIPTS.remoteCore)) {
    const a = new Alert();
    a.title = 'MY REMOTE更新が必要';
    a.message = 'YOS Remote Update Installerを1回実行してから、もう一度試してください。';
    a.addAction('OK');
    await a.presentAlert();
  } else {
    runScript(SCRIPTS.homeVoice);
  }
} else if (choice === 1) {
  if (exists(SCRIPTS.departureGuard)) runScript(SCRIPTS.departureGuard);
  else {
    const a = new Alert();
    a.title = '未導入';
    a.message = 'Trial Pack Installerをもう一度実行してください。';
    a.addAction('OK');
    await a.presentAlert();
  }
} else if (choice === 2) {
  if (exists(SCRIPTS.nowWidget)) runScript(SCRIPTS.nowWidget);
  else {
    const a = new Alert();
    a.title = '未導入';
    a.message = 'Trial Pack Installerをもう一度実行してください。';
    a.addAction('OK');
    await a.presentAlert();
  }
} else if (choice === 3) {
  Safari.open('https://yskn0008-bot.github.io/ProjectY/yos/');
} else if (choice === 4) {
  await showStatus();
}

Script.complete();
