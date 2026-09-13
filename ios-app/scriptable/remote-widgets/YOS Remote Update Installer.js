// YOS Remote Update Installer v0.3
// Transactional updater for MY REMOTE UX v2.
// Downloads from a fixed verified commit, stages every file, snapshots the old set,
// then switches live files. Any caught failure rolls back; interrupted commits recover on next run.

const SOURCE_SHA = '71d6832551d63a1b0f0eda2e9f1d67b1d012369a';
const BASE = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/' + SOURCE_SHA + '/ios-app/scriptable/remote-widgets/';
const FILES = [
  'YOS Tapo H110 Core.js',
  'YOS AC Remote.js',
  'YOS AC Widget.js',
  'YOS BRAVIA Remote.js',
  'YOS Light Remote.js',
  'YOS Light Widget.js',
  'YOS Remote Hub.js'
];
const HUB = 'YOS Remote Hub';
const RECOVERY_NAME = 'YOS Remote Update Recovery';
const BACKUP_PREFIX = 'YOS Remote Backup ';
const FAILED_PREFIX = 'YOS Remote Failed Update ';

const fm = FileManager.iCloud();
const docs = fm.documentsDirectory();
const recoveryDir = fm.joinPath(docs, RECOVERY_NAME);
const stageDir = fm.joinPath(recoveryDir, 'stage');
const backupDir = fm.joinPath(recoveryDir, 'backup');
const manifestPath = fm.joinPath(recoveryDir, 'manifest.json');

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function join(dir, name) { return fm.joinPath(dir, name); }
function livePath(name) { return join(docs, name); }
function stagedPath(name) { return join(stageDir, name); }
function backedUpPath(name) { return join(backupDir, name); }
function rawURL(name) { return BASE + name.split('/').map(encodeURIComponent).join('/'); }
function hook(name, detail) {
  const hooks = globalThis.__YOS_INSTALLER_TEST_HOOKS__;
  if (hooks && typeof hooks[name] === 'function') hooks[name](detail);
}

async function ensureLocal(path) {
  if (!fm.fileExists(path)) return;
  try {
    if (fm.isFileStoredIniCloud(path)) await fm.downloadFileFromiCloud(path);
  } catch (_) {}
}

function writeJSON(path, value) {
  fm.writeString(path, JSON.stringify(value));
  const check = JSON.parse(fm.readString(path));
  if (!check || check.phase !== value.phase) throw new Error('復旧情報の保存検証に失敗しました。');
}

function readManifest(dir = recoveryDir) {
  const path = join(dir, 'manifest.json');
  if (!fm.fileExists(path)) return null;
  try { return JSON.parse(fm.readString(path)); }
  catch (_) { throw new Error('復旧情報が破損しています。Recoveryフォルダを保持したまま停止します。'); }
}

function removeIfExists(path) {
  if (fm.fileExists(path)) fm.remove(path);
}

function sameText(path, expected) {
  return fm.fileExists(path) && fm.readString(path) === expected;
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

async function restoreOldSet(manifest) {
  const failures = [];
  for (const entry of manifest.entries || []) {
    const target = livePath(entry.name);
    try {
      if (entry.existed) {
        const backup = backedUpPath(entry.name);
        if (!fm.fileExists(backup)) throw new Error('backup missing');
        const oldText = fm.readString(backup);
        fm.writeString(target, oldText);
        if (!sameText(target, oldText)) throw new Error('restore verify failed');
      } else {
        removeIfExists(target);
        if (fm.fileExists(target)) throw new Error('remove verify failed');
      }
    } catch (e) {
      failures.push(entry.name + ': ' + (e && e.message ? e.message : String(e)));
    }
  }
  if (failures.length) throw new Error('rollback失敗: ' + failures.join(' / '));
}

function archiveRecovery(prefix, manifest) {
  manifest.archivedAt = new Date().toISOString();
  writeJSON(manifestPath, manifest);
  let destination = join(docs, prefix + manifest.id);
  let suffix = 2;
  while (fm.fileExists(destination)) destination = join(docs, prefix + manifest.id + '-' + suffix++);
  fm.move(recoveryDir, destination);
  return destination;
}

async function recoverInterrupted() {
  if (!fm.fileExists(recoveryDir)) return false;
  const manifest = readManifest();
  if (!manifest) {
    throw new Error('Recoveryフォルダにmanifestがありません。自動上書きを停止します。');
  }

  if (manifest.phase === 'prepared') {
    archiveRecovery(FAILED_PREFIX, { ...manifest, phase: 'abandoned_before_commit' });
    return true;
  }

  if (manifest.phase === 'committed') {
    let valid = true;
    for (const entry of manifest.entries || []) {
      const staged = stagedPath(entry.name);
      const live = livePath(entry.name);
      if (!fm.fileExists(staged) || !sameText(live, fm.readString(staged))) { valid = false; break; }
    }
    if (valid) {
      archiveRecovery(BACKUP_PREFIX, manifest);
      return true;
    }
  }

  if (manifest.phase === 'committing' || manifest.phase === 'rollback_failed' || manifest.phase === 'committed') {
    try {
      await restoreOldSet(manifest);
      manifest.phase = 'recovered';
      manifest.recoveredAt = new Date().toISOString();
      archiveRecovery(FAILED_PREFIX, manifest);
      return true;
    } catch (e) {
      manifest.phase = 'rollback_failed';
      manifest.lastError = e && e.message ? e.message : String(e);
      writeJSON(manifestPath, manifest);
      throw new Error('前回中断からの復旧に失敗しました。新しい更新は実行しません。' + manifest.lastError);
    }
  }

  if (manifest.phase === 'rolled_back' || manifest.phase === 'recovered' || manifest.phase === 'abandoned_before_commit') {
    archiveRecovery(FAILED_PREFIX, manifest);
    return true;
  }

  throw new Error('未知のRecovery状態です（' + String(manifest.phase) + '）。自動上書きを停止します。');
}

function latestSuccessfulBackup() {
  const names = fm.listContents(docs)
    .filter(name => name.startsWith(BACKUP_PREFIX))
    .sort().reverse();
  for (const name of names) {
    const dir = join(docs, name);
    try {
      const manifest = readManifest(dir);
      if (manifest && manifest.phase === 'committed' && !manifest.manualRollbackAt) return { dir, manifest };
    } catch (_) {}
  }
  return null;
}

async function manualRollback() {
  await recoverInterrupted();
  const latest = latestSuccessfulBackup();
  if (!latest) throw new Error('rollbackできる成功済みバックアップがありません。');
  fm.move(latest.dir, recoveryDir);
  const manifest = readManifest();
  try {
    await restoreOldSet(manifest);
    manifest.phase = 'manual_rollback';
    manifest.manualRollbackAt = new Date().toISOString();
    archiveRecovery(FAILED_PREFIX, manifest);
  } catch (e) {
    manifest.phase = 'rollback_failed';
    manifest.lastError = e && e.message ? e.message : String(e);
    writeJSON(manifestPath, manifest);
    throw e;
  }
}

async function prepareTransaction() {
  await recoverInterrupted();
  const id = stamp();
  fm.createDirectory(recoveryDir, true);
  fm.createDirectory(stageDir, true);
  fm.createDirectory(backupDir, true);

  const entries = [];
  try {
    for (const name of FILES) {
      const text = await downloadText(name);
      fm.writeString(stagedPath(name), text);
      if (!sameText(stagedPath(name), text)) throw new Error(name + ' のstage検証に失敗しました。');
    }

    for (const name of FILES) {
      const target = livePath(name);
      const existed = fm.fileExists(target);
      if (existed) {
        await ensureLocal(target);
        const oldText = fm.readString(target);
        fm.writeString(backedUpPath(name), oldText);
        if (!sameText(backedUpPath(name), oldText)) throw new Error(name + ' のbackup検証に失敗しました。');
      }
      entries.push({ name, existed });
    }

    const manifest = {
      version: 1,
      id,
      sourceSha: SOURCE_SHA,
      phase: 'prepared',
      createdAt: new Date().toISOString(),
      entries,
      applied: []
    };
    writeJSON(manifestPath, manifest);
    return manifest;
  } catch (e) {
    if (fm.fileExists(recoveryDir)) {
      try {
        const fallback = {
          version: 1, id, sourceSha: SOURCE_SHA, phase: 'abandoned_before_commit',
          createdAt: new Date().toISOString(), entries, applied: [],
          lastError: e && e.message ? e.message : String(e)
        };
        if (fm.fileExists(manifestPath)) writeJSON(manifestPath, fallback);
        else fm.writeString(manifestPath, JSON.stringify(fallback));
        archiveRecovery(FAILED_PREFIX, fallback);
      } catch (_) {}
    }
    throw e;
  }
}

async function commitTransaction(manifest) {
  manifest.phase = 'committing';
  writeJSON(manifestPath, manifest);

  try {
    for (const entry of manifest.entries) {
      hook('beforeLiveWrite', { name: entry.name, applied: manifest.applied.slice() });
      const text = fm.readString(stagedPath(entry.name));
      fm.writeString(livePath(entry.name), text);
      if (!sameText(livePath(entry.name), text)) throw new Error(entry.name + ' の切替検証に失敗しました。');
      manifest.applied.push(entry.name);
      writeJSON(manifestPath, manifest);
      hook('afterLiveWrite', { name: entry.name, applied: manifest.applied.slice() });
    }

    for (const entry of manifest.entries) {
      const staged = fm.readString(stagedPath(entry.name));
      if (!sameText(livePath(entry.name), staged)) throw new Error(entry.name + ' の最終整合検証に失敗しました。');
    }

    manifest.phase = 'committed';
    manifest.committedAt = new Date().toISOString();
    writeJSON(manifestPath, manifest);
    archiveRecovery(BACKUP_PREFIX, manifest);
  } catch (e) {
    const originalError = e && e.message ? e.message : String(e);
    try {
      await restoreOldSet(manifest);
      manifest.phase = 'rolled_back';
      manifest.lastError = originalError;
      manifest.rolledBackAt = new Date().toISOString();
      writeJSON(manifestPath, manifest);
      archiveRecovery(FAILED_PREFIX, manifest);
    } catch (rollbackError) {
      if (fm.fileExists(recoveryDir)) {
        manifest.phase = 'rollback_failed';
        manifest.lastError = rollbackError && rollbackError.message ? rollbackError.message : String(rollbackError);
        try { writeJSON(manifestPath, manifest); } catch (_) {}
      }
      throw rollbackError;
    }
    throw new Error('更新中に失敗したため旧版へ復旧しました。' + originalError);
  }
}

async function main() {
  const action = args && args.queryParameters ? args.queryParameters.action : null;
  if (action === 'recover') {
    await recoverInterrupted();
    return;
  }
  if (action === 'rollback') {
    await manualRollback();
    return;
  }
  const manifest = await prepareTransaction();
  await commitTransaction(manifest);
  Safari.open('scriptable:///run?scriptName=' + encodeURIComponent(HUB));
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
