// YOS Remote Update Installer v0.5
// Safe Japanese-name installer for MY REMOTE.
// New Japanese scripts are staged and verified before legacy English scripts are archived.
// Existing Keychain/settings are untouched. Any commit failure restores the previous Japanese targets.

const SOURCE_SHA = '477b02c49d5931eae2f6d75537567cc8a78c2448';
const BASE = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/' + SOURCE_SHA + '/ios-app/scriptable/remote-widgets/';
const PACKAGE = [
  { source: 'YOS Remote Hub.js', target: 'リモコン.js' },
  { source: 'YOS BRAVIA Remote.js', target: 'テレビリモコン.js' },
  { source: 'YOS AC Remote.js', target: 'エアコンリモコン.js' },
  { source: 'YOS AC Widget.js', target: 'エアコンウィジェット.js' },
  { source: 'YOS Light Remote.js', target: '照明リモコン.js' },
  { source: 'YOS Light Widget.js', target: '照明ウィジェット.js' },
  { source: 'YOS Tapo H110 Core.js', target: 'リモコン/内部/Tapo共通.js' },
];
const ORGANIZER_TARGET = 'リモコン整理.js';
const HUB = 'リモコン';
const RECOVERY_NAME = 'リモコン更新_復旧中';
const BACKUP_PREFIX = 'リモコン/保管/更新前 ';
const FAILED_PREFIX = 'リモコン/保管/更新失敗 ';
const LEGACY_ROOT = [
  'YOS Remote Hub.js',
  'YOS Remote Update Installer.js',
  'YOS Remote Script Organizer.js',
  'YOS BRAVIA Remote.js',
  'YOS AC Remote.js',
  'YOS AC Widget.js',
  'YOS Light Remote.js',
  'YOS Light Widget.js',
  'YOS Tapo H110 Core.js',
];
const NAME_REPLACEMENTS = [
  ['YOS Remote Hub', 'リモコン'],
  ['YOS BRAVIA Remote', 'テレビリモコン'],
  ['YOS AC Remote', 'エアコンリモコン'],
  ['YOS AC Widget', 'エアコンウィジェット'],
  ['YOS Light Remote', '照明リモコン'],
  ['YOS Light Widget', '照明ウィジェット'],
  ['YOS Tapo H110 Core', 'リモコン/内部/Tapo共通'],
];

const ORGANIZER_SOURCE = `// リモコン整理 v2.0\n// 英語名の旧版・重複だけを削除せず「リモコン/保管」へ移します。\n\nconst LEGACY=${JSON.stringify(LEGACY_ROOT)};\nconst PREFIX='リモコン/保管/整理 ';\nfunction stamp(){return new Date().toISOString().replace(/[:.]/g,'-')}\nfunction stem(name){return String(name).replace(/\\.js$/i,'').trim()}\nfunction lower(v){return String(v).trim().toLowerCase()}\nfunction recognized(name){if(!/\\.js$/i.test(String(name)))return false;const candidate=lower(stem(name));for(const canonical of LEGACY){const base=lower(stem(canonical));if(candidate===base)return true;if(!candidate.startsWith(base))continue;const suffix=candidate.slice(base.length).replace(/^[\\s._-]+/,'');if(/^(?:\\(\\d+\\)|\\d+|copy(?:\\s*\\d+)?|old(?:\\s*\\d+)?|backup(?:\\s*\\d+)?|bak(?:\\s*\\d+)?|legacy(?:\\s*\\d+)?|v\\d+(?:[._-]\\d+)*)$/i.test(suffix))return true}return false}\nfunction parent(path){const i=String(path).lastIndexOf('/');return i<=0?'/':String(path).slice(0,i)}\nfunction ensureDir(fm,path){if(!fm.fileExists(path))fm.createDirectory(path,true)}\nasync function tidy(fm){if(!fm)return[];const docs=fm.documentsDirectory();let names=[];try{names=fm.listContents(docs)}catch(_){return[]}const candidates=names.filter(recognized);if(!candidates.length)return[];const dir=fm.joinPath(docs,PREFIX+stamp());ensureDir(fm,dir);const moved=[];for(const name of candidates){const src=fm.joinPath(docs,name);if(!fm.fileExists(src))continue;try{if(typeof fm.isFileStoredIniCloud==='function'&&fm.isFileStoredIniCloud(src))await fm.downloadFileFromiCloud(src)}catch(_){}let dst=fm.joinPath(dir,name),n=2;while(fm.fileExists(dst)){dst=fm.joinPath(dir,stem(name)+' '+n+'.js');n++}fm.move(src,dst);moved.push(name)}return moved}\nasync function main(){const a=new Alert();try{const moved=[...await tidy(FileManager.iCloud()),...await tidy(typeof FileManager.local==='function'?FileManager.local():null)];a.title='リモコン整理完了';a.message=moved.length?moved.length+'件を削除せず保管フォルダへ移動しました。':'整理対象はありません。'}catch(e){a.title='リモコン整理失敗';a.message=e&&e.message?e.message:String(e)}a.addAction('OK');await a.presentAlert()}\nawait main();Script.complete();\n`;

const fm = FileManager.iCloud();
const docs = fm.documentsDirectory();
const recoveryDir = fm.joinPath(docs, RECOVERY_NAME);
const stageDir = fm.joinPath(recoveryDir, 'stage');
const backupDir = fm.joinPath(recoveryDir, 'backup');
const manifestPath = fm.joinPath(recoveryDir, 'manifest.json');

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function join(dir, name) { return fm.joinPath(dir, name); }
function livePath(target) { return join(docs, target); }
function stagedPath(target) { return join(stageDir, target); }
function backedUpPath(target) { return join(backupDir, target); }
function rawURL(name) { return BASE + name.split('/').map(encodeURIComponent).join('/'); }
function parent(path) { const i = String(path).lastIndexOf('/'); return i <= 0 ? '/' : String(path).slice(0, i); }
function ensureDir(manager, path) { if (!manager.fileExists(path)) manager.createDirectory(path, true); }
function ensureParent(manager, path) { ensureDir(manager, parent(path)); }
function hook(name, detail) {
  const hooks = globalThis.__YOS_INSTALLER_TEST_HOOKS__;
  if (hooks && typeof hooks[name] === 'function') hooks[name](detail);
}

function transformSource(text) {
  let out = String(text);
  for (const [from, to] of NAME_REPLACEMENTS) out = out.split(from).join(to);
  return out;
}

async function ensureLocal(manager, path) {
  if (!manager || !manager.fileExists(path)) return;
  try {
    if (typeof manager.isFileStoredIniCloud === 'function' && manager.isFileStoredIniCloud(path)) {
      await manager.downloadFileFromiCloud(path);
    }
  } catch (_) {}
}

function writeJSON(path, value) {
  ensureParent(fm, path);
  fm.writeString(path, JSON.stringify(value));
  const check = JSON.parse(fm.readString(path));
  if (!check || check.phase !== value.phase) throw new Error('復旧情報の保存検証に失敗しました。');
}

function readManifest(dir = recoveryDir) {
  const path = join(dir, 'manifest.json');
  if (!fm.fileExists(path)) return null;
  try { return JSON.parse(fm.readString(path)); }
  catch (_) { throw new Error('復旧情報が破損しています。復旧フォルダを保持したまま停止します。'); }
}

function removeIfExists(path) { if (fm.fileExists(path)) fm.remove(path); }
function sameText(path, expected) { return fm.fileExists(path) && fm.readString(path) === expected; }
async function settle(ms) {
  if (typeof Timer === 'undefined' || !Timer || typeof Timer.schedule !== 'function') return;
  await new Promise(resolve => Timer.schedule(ms, false, resolve));
}
async function writeStable(path, expected, label) {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    ensureParent(fm, path);
    fm.writeString(path, expected);
    await settle(250 * attempt);
    try { last = fm.readString(path); } catch (_) { last = ''; }
    if (last === expected) return;
  }
  throw new Error(label + ' の安定書き込みに失敗しました。');
}
async function reconcileCommittedSet(manifest) {
  for (let round = 1; round <= 3; round++) {
    let repaired = false;
    for (const entry of manifest.entries) {
      const staged = fm.readString(stagedPath(entry.target));
      const live = livePath(entry.target);
      if (!sameText(live, staged)) {
        repaired = true;
        await writeStable(live, staged, entry.target);
      }
    }
    await settle(300 * round);
    const mismatches = [];
    for (const entry of manifest.entries) {
      const staged = fm.readString(stagedPath(entry.target));
      if (!sameText(livePath(entry.target), staged)) mismatches.push(entry.target);
    }
    if (!mismatches.length) return;
    if (!repaired && round === 3) break;
    if (round === 3) throw new Error(mismatches[0] + ' の最終整合検証に失敗しました。');
  }
  throw new Error('更新後ファイルの最終整合検証に失敗しました。');
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
    const target = livePath(entry.target);
    try {
      if (entry.existed) {
        const backup = backedUpPath(entry.target);
        if (!fm.fileExists(backup)) throw new Error('backup missing');
        const oldText = fm.readString(backup);
        ensureParent(fm, target);
        fm.writeString(target, oldText);
        if (!sameText(target, oldText)) throw new Error('restore verify failed');
      } else {
        removeIfExists(target);
        if (fm.fileExists(target)) throw new Error('remove verify failed');
      }
    } catch (e) {
      failures.push(entry.target + ': ' + (e && e.message ? e.message : String(e)));
    }
  }
  if (failures.length) throw new Error('rollback失敗: ' + failures.join(' / '));
}

function archiveRecovery(prefix, manifest) {
  manifest.archivedAt = new Date().toISOString();
  writeJSON(manifestPath, manifest);
  const base = join(docs, prefix + manifest.id);
  ensureDir(fm, parent(base));
  let destination = base;
  let suffix = 2;
  while (fm.fileExists(destination)) destination = base + '-' + suffix++;
  fm.move(recoveryDir, destination);
  return destination;
}

async function recoverInterrupted() {
  if (!fm.fileExists(recoveryDir)) return false;
  const manifest = readManifest();
  if (!manifest) throw new Error('復旧フォルダにmanifestがありません。自動上書きを停止します。');

  if (manifest.phase === 'prepared') {
    archiveRecovery(FAILED_PREFIX, { ...manifest, phase: 'abandoned_before_commit' });
    return true;
  }

  if (manifest.phase === 'committed') {
    let valid = true;
    for (const entry of manifest.entries || []) {
      const staged = stagedPath(entry.target);
      const live = livePath(entry.target);
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

  if (['rolled_back','recovered','abandoned_before_commit'].includes(manifest.phase)) {
    archiveRecovery(FAILED_PREFIX, manifest);
    return true;
  }
  throw new Error('未知の復旧状態です（' + String(manifest.phase) + '）。自動上書きを停止します。');
}

function latestSuccessfulBackup() {
  const baseDir = join(docs, 'リモコン/保管');
  if (!fm.fileExists(baseDir)) return null;
  const names = fm.listContents(baseDir).filter(name => name.startsWith('更新前 ')).sort().reverse();
  for (const name of names) {
    const dir = join(baseDir, name);
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
    for (const item of PACKAGE) {
      const text = transformSource(await downloadText(item.source));
      const path = stagedPath(item.target);
      ensureParent(fm, path);
      fm.writeString(path, text);
      if (!sameText(path, text)) throw new Error(item.target + ' のstage検証に失敗しました。');
      entries.push({ source: item.source, target: item.target });
    }
    const organizerStage = stagedPath(ORGANIZER_TARGET);
    ensureParent(fm, organizerStage);
    fm.writeString(organizerStage, ORGANIZER_SOURCE);
    if (!sameText(organizerStage, ORGANIZER_SOURCE)) throw new Error(ORGANIZER_TARGET + ' のstage検証に失敗しました。');
    entries.push({ source: 'inline:organizer', target: ORGANIZER_TARGET });

    for (const entry of entries) {
      const target = livePath(entry.target);
      const existed = fm.fileExists(target);
      entry.existed = existed;
      if (existed) {
        await ensureLocal(fm, target);
        const oldText = fm.readString(target);
        const backup = backedUpPath(entry.target);
        ensureParent(fm, backup);
        fm.writeString(backup, oldText);
        if (!sameText(backup, oldText)) throw new Error(entry.target + ' のbackup検証に失敗しました。');
      }
    }

    const manifest = { version: 2, id, sourceSha: SOURCE_SHA, phase: 'prepared', createdAt: new Date().toISOString(), entries, applied: [] };
    writeJSON(manifestPath, manifest);
    return manifest;
  } catch (e) {
    if (fm.fileExists(recoveryDir)) {
      try {
        const fallback = { version: 2, id, sourceSha: SOURCE_SHA, phase: 'abandoned_before_commit', createdAt: new Date().toISOString(), entries, applied: [], lastError: e && e.message ? e.message : String(e) };
        if (fm.fileExists(manifestPath)) writeJSON(manifestPath, fallback);
        else { ensureParent(fm, manifestPath); fm.writeString(manifestPath, JSON.stringify(fallback)); }
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
      hook('beforeLiveWrite', { target: entry.target, applied: manifest.applied.slice() });
      const text = fm.readString(stagedPath(entry.target));
      const target = livePath(entry.target);
      ensureParent(fm, target);
      await writeStable(target, text, entry.target + ' の切替検証');
      manifest.applied.push(entry.target);
      writeJSON(manifestPath, manifest);
      hook('afterLiveWrite', { target: entry.target, applied: manifest.applied.slice() });
    }
    await reconcileCommittedSet(manifest);
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

function legacyVariant(name) {
  if (!/\.js$/i.test(String(name))) return false;
  const stem = v => String(v).replace(/\.js$/i, '').trim().toLowerCase();
  const candidate = stem(name);
  for (const canonical of LEGACY_ROOT) {
    const base = stem(canonical);
    if (candidate === base) return true;
    if (!candidate.startsWith(base)) continue;
    const suffix = candidate.slice(base.length).replace(/^[\s._-]+/, '');
    if (/^(?:\(\d+\)|\d+|copy(?:\s*\d+)?|old(?:\s*\d+)?|backup(?:\s*\d+)?|bak(?:\s*\d+)?|legacy(?:\s*\d+)?|v\d+(?:[._-]\d+)*)$/i.test(suffix)) return true;
  }
  return false;
}

async function archiveLegacy(manager) {
  if (!manager) return [];
  const root = manager.documentsDirectory();
  let names = [];
  try { names = manager.listContents(root); } catch (_) { return []; }
  const candidates = names.filter(legacyVariant);
  if (!candidates.length) return [];
  const archiveDir = manager.joinPath(root, 'リモコン/保管/英語旧版 ' + stamp());
  ensureDir(manager, archiveDir);
  const moved = [];
  for (const name of candidates) {
    const source = manager.joinPath(root, name);
    if (!manager.fileExists(source)) continue;
    await ensureLocal(manager, source);
    let destination = manager.joinPath(archiveDir, name);
    let n = 2;
    while (manager.fileExists(destination)) destination = manager.joinPath(archiveDir, String(name).replace(/\.js$/i, '') + ' ' + n++ + '.js');
    manager.move(source, destination);
    if (!manager.fileExists(destination)) throw new Error(name + ' の旧版保管に失敗しました。');
    moved.push(name);
  }
  return moved;
}

async function main() {
  const action = args && args.queryParameters ? args.queryParameters.action : null;
  if (action === 'recover') { await recoverInterrupted(); return; }
  if (action === 'rollback') { await manualRollback(); return; }
  const manifest = await prepareTransaction();
  await commitTransaction(manifest);
  try {
    await archiveLegacy(fm);
    if (typeof FileManager.local === 'function') await archiveLegacy(FileManager.local());
  } catch (_) {}
  Safari.open('scriptable:///run?scriptName=' + encodeURIComponent(HUB));
}

try {
  await main();
} catch (e) {
  const a = new Alert();
  a.title = 'リモコン更新失敗';
  a.message = e && e.message ? e.message : String(e);
  a.addAction('OK');
  await a.presentAlert();
}
Script.complete();
