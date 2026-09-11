// YOS Remote Update Installer v0.1
// One-run updater for MY REMOTE UX v2. Existing Scriptable files are backed up first.

const BRANCH = 'work/issue-297-remote-ux-v2';
const BASE = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/' + encodeURIComponent(BRANCH).replace(/%2F/g,'/') + '/ios-app/scriptable/remote-widgets/';
const FILES = [
  'YOS Tapo H110 Core.js',
  'YOS AC Remote.js',
  'YOS AC Widget.js',
  'YOS BRAVIA Remote.js',
  'YOS Light Remote.js',
  'YOS Light Widget.js',
  'YOS Remote Hub.js'
];

const fm = FileManager.iCloud();
const docs = fm.documentsDirectory();
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backupDir = fm.joinPath(docs, 'YOS Remote Backup ' + stamp);

function rawURL(name) {
  return BASE + name.split('/').map(encodeURIComponent).join('/');
}

async function downloadText(name) {
  const req = new Request(rawURL(name));
  req.timeoutInterval = 20;
  const text = await req.loadString();
  const status = req.response ? req.response.statusCode : 0;
  if (status < 200 || status >= 300 || !text || text.length < 20) {
    throw new Error(name + ' の取得に失敗しました（HTTP ' + status + '）');
  }
  return text;
}

async function main() {
  const payloads = [];
  for (const name of FILES) payloads.push([name, await downloadText(name)]);

  if (!fm.fileExists(backupDir)) fm.createDirectory(backupDir, true);

  for (const [name, text] of payloads) {
    const target = fm.joinPath(docs, name);
    if (fm.fileExists(target)) {
      try {
        if (fm.isFileStoredIniCloud(target)) await fm.downloadFileFromiCloud(target);
      } catch (_) {}
      const backup = fm.joinPath(backupDir, name);
      fm.writeString(backup, fm.readString(target));
    }
    fm.writeString(target, text);
  }

  const a = new Alert();
  a.title = 'MY REMOTE 更新完了';
  a.message = '7ファイルを更新しました。\n\n既存ファイルは「' + backupDir.split('/').pop() + '」へバックアップ済みです。\n\n次に「YOS Remote Hub」を開いて実機確認してください。';
  a.addAction('OK');
  await a.presentAlert();
}

try {
  await main();
} catch (e) {
  const a = new Alert();
  a.title = 'MY REMOTE 更新失敗';
  a.message = e && e.message ? e.message : String(e);
  a.addAction('OK');
  await a.presentAlert();
}
Script.complete();