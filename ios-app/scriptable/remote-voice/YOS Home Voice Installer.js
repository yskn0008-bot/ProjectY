// YOS Home Voice Installer v0.3
// Installs the pinned Home Voice adapter + parser without touching existing MY REMOTE files.

const SOURCE_SHA = 'af0e21df207990799487108c1a75dc2ced4ba63d';
const BASE = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/' + SOURCE_SHA + '/ios-app/scriptable/remote-voice/';
const FILES = ['YOS Home Voice Parser.js', 'YOS Home Voice.js'];
const REQUIRED_EXISTING = ['YOS Tapo H110 Core.js'];
const BACKUP_PREFIX = 'YOS Home Voice Backup ';

const fm = FileManager.iCloud();
const docs = fm.documentsDirectory();

function path(name) { return fm.joinPath(docs, name); }
function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function rawURL(name) { return BASE + name.split('/').map(encodeURIComponent).join('/'); }

async function ensureLocal(p) {
  if (!fm.fileExists(p)) return;
  try {
    if (fm.isFileStoredIniCloud(p)) await fm.downloadFileFromiCloud(p);
  } catch (_) {}
}

async function download(name) {
  const r = new Request(rawURL(name));
  r.timeoutInterval = 20;
  const text = await r.loadString();
  const status = r.response ? r.response.statusCode : 0;
  if (status < 200 || status >= 300 || !text || text.length < 100) {
    throw new Error(name + ' の取得に失敗しました（HTTP ' + status + '）');
  }
  return text;
}

async function run() {
  for (const name of REQUIRED_EXISTING) {
    if (!fm.fileExists(path(name))) {
      throw new Error(name + ' がありません。先にMY REMOTEの更新を1回実行してください。');
    }
  }

  const downloaded = {};
  for (const name of FILES) downloaded[name] = await download(name);

  const backupDir = fm.joinPath(docs, BACKUP_PREFIX + stamp());
  let hasBackup = false;
  for (const name of FILES) {
    const target = path(name);
    if (!fm.fileExists(target)) continue;
    if (!hasBackup) {
      fm.createDirectory(backupDir, true);
      hasBackup = true;
    }
    await ensureLocal(target);
    fm.writeString(fm.joinPath(backupDir, name), fm.readString(target));
  }

  const written = [];
  try {
    for (const name of FILES) {
      const target = path(name);
      fm.writeString(target, downloaded[name]);
      if (fm.readString(target) !== downloaded[name]) throw new Error(name + ' の保存確認に失敗しました。');
      written.push(name);
    }
  } catch (error) {
    for (const name of written.reverse()) {
      const target = path(name);
      const backup = hasBackup ? fm.joinPath(backupDir, name) : null;
      if (backup && fm.fileExists(backup)) fm.writeString(target, fm.readString(backup));
      else if (fm.fileExists(target)) fm.remove(target);
    }
    throw error;
  }

  const a = new Alert();
  a.title = '家の音声操作 準備完了';
  a.message = '音声操作の本体を入れました。すぐ試すなら Scriptable で YOS Home Voice を実行して話してください。';
  a.addAction('OK');
  await a.presentAlert();
}

try {
  await run();
} catch (error) {
  const a = new Alert();
  a.title = '家の音声操作 インストール失敗';
  a.message = error && error.message ? error.message : String(error);
  a.addAction('OK');
  await a.presentAlert();
}
Script.complete();
