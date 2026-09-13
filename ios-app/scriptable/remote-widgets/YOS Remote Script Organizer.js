// YOS Remote Script Organizer v2.0
// Keeps current Japanese scripts visible and hides only safe legacy/duplicate scripts.
// Archived scripts are renamed to .js.bak so Scriptable does not keep showing them as runnable scripts.
// Successful update-backup folders are intentionally left untouched so manual rollback remains valid.

const ACTIVE = [
  'リモコン.js',
  'テレビリモコン.js',
  'エアコンリモコン.js',
  'エアコンウィジェット.js',
  '照明リモコン.js',
  '照明ウィジェット.js',
  'リモコン更新.js',
  'リモコン整理.js',
]

const LEGACY = [
  'YOS Remote Hub.js',
  'YOS Remote Update Installer.js',
  'YOS Remote Script Organizer.js',
  'YOS BRAVIA Remote.js',
  'YOS AC Remote.js',
  'YOS AC Widget.js',
  'YOS Light Remote.js',
  'YOS Light Widget.js',
  'YOS Tapo H110 Core.js',
]

const SAFE_OLD_ARCHIVE_PREFIXES = [
  'YOS Remote Script Archive ',
  'YOS Remote Failed Update ',
]

const REMOTE_SIGNATURE = /YOS Remote|YOS BRAVIA|YOS AC |YOS Light|YOS Tapo H110|MY REMOTE|リモコン更新|テレビリモコン|照明リモコン|エアコンリモコン/

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-') }
function lower(v) { return String(v || '').trim().toLowerCase() }
function stem(v) { return String(v || '').replace(/\.js$/i, '').trim() }
function isJs(name) { return /\.js$/i.test(String(name || '')) }
function isUntitled(name) { return /^Untitled Script(?:\s+\d+)?\.js$/i.test(String(name || '')) }
function isActive(name) { return ACTIVE.some(v => lower(v) === lower(name)) }

function legacyVariant(name) {
  if (!isJs(name)) return false
  const candidate = lower(stem(name))
  for (const canonical of LEGACY) {
    const base = lower(stem(canonical))
    if (candidate === base) return true
    if (!candidate.startsWith(base)) continue
    const suffix = candidate.slice(base.length).replace(/^[\s._-]+/, '')
    if (/^(?:\(\d+\)|\d+|copy(?:\s*\d+)?|old(?:\s*\d+)?|backup(?:\s*\d+)?|bak(?:\s*\d+)?|legacy(?:\s*\d+)?|v\d+(?:[._-]\d+)*)$/i.test(suffix)) return true
  }
  return false
}

async function ensureLocal(fm, path) {
  if (!fm || !fm.fileExists(path)) return
  try {
    if (typeof fm.isFileStoredIniCloud === 'function' && fm.isFileStoredIniCloud(path)) {
      await fm.downloadFileFromiCloud(path)
    }
  } catch (_) {}
}

function rootNames(fm) {
  try { return fm.listContents(fm.documentsDirectory()) }
  catch (_) { return [] }
}

function uniquePath(fm, desired) {
  if (!fm.fileExists(desired)) return desired
  let n = 2
  while (fm.fileExists(desired + '.' + n)) n += 1
  return desired + '.' + n
}

async function moveToBak(fm, source, archiveDir, displayName) {
  if (!fm.fileExists(source)) return false
  await ensureLocal(fm, source)
  if (!fm.fileExists(archiveDir)) fm.createDirectory(archiveDir, true)
  const fileName = String(displayName || source.split('/').pop())
  const target = uniquePath(fm, fm.joinPath(archiveDir, fileName + '.bak'))
  fm.move(source, target)
  if (fm.fileExists(source) || !fm.fileExists(target)) throw new Error(fileName + ' の保管確認に失敗しました')
  return true
}

function preference(name) {
  if (isActive(name)) return 100
  if (!isUntitled(name) && !legacyVariant(name)) return 60
  if (legacyVariant(name)) return 30
  return 10
}

async function organizeRoot(fm, kind, currentExistsAnywhere) {
  if (!fm) return []
  const docs = fm.documentsDirectory()
  const names = rootNames(fm).filter(isJs)
  const moved = []
  const archive = fm.joinPath(docs, 'リモコン/保管/整理 ' + stamp())

  const records = []
  for (const name of names) {
    const path = fm.joinPath(docs, name)
    try {
      await ensureLocal(fm, path)
      records.push({ name, path, text: fm.readString(path) })
    } catch (_) {}
  }

  const byText = new Map()
  for (const record of records) {
    const key = record.text
    if (!byText.has(key)) byText.set(key, [])
    byText.get(key).push(record)
  }

  for (const group of byText.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => preference(b.name) - preference(a.name))
    for (const record of group.slice(1)) {
      if (!fm.fileExists(record.path)) continue
      if (await moveToBak(fm, record.path, archive, record.name)) moved.push({ kind, name: record.name, reason: 'duplicate' })
    }
  }

  for (const record of records) {
    if (!fm.fileExists(record.path)) continue
    let shouldMove = legacyVariant(record.name)
    if (!shouldMove && isUntitled(record.name) && currentExistsAnywhere && REMOTE_SIGNATURE.test(record.text)) shouldMove = true
    if (!shouldMove) continue
    if (await moveToBak(fm, record.path, archive, record.name)) moved.push({ kind, name: record.name, reason: 'legacy' })
  }

  return moved
}

async function hideJsTree(fm, dir) {
  if (!fm || !fm.fileExists(dir)) return 0
  let names = []
  try { names = fm.listContents(dir) } catch (_) { return 0 }
  let changed = 0
  for (const name of names) {
    const path = fm.joinPath(dir, name)
    let directory = false
    try { directory = fm.isDirectory(path) } catch (_) {}
    if (directory) {
      changed += await hideJsTree(fm, path)
      continue
    }
    if (!isJs(name)) continue
    await ensureLocal(fm, path)
    const target = uniquePath(fm, path + '.bak')
    fm.move(path, target)
    if (!fm.fileExists(target)) throw new Error(name + ' の非表示化に失敗しました')
    changed += 1
  }
  return changed
}

async function hideHistoricalArchives(fm) {
  if (!fm) return 0
  const docs = fm.documentsDirectory()
  let changed = 0

  const remoteStore = fm.joinPath(docs, 'リモコン/保管')
  if (fm.fileExists(remoteStore)) {
    let names = []
    try { names = fm.listContents(remoteStore) } catch (_) {}
    for (const name of names) {
      // 更新前バックアップはmanual rollback用なので触らない。
      if (String(name).startsWith('更新前 ')) continue
      const path = fm.joinPath(remoteStore, name)
      let directory = false
      try { directory = fm.isDirectory(path) } catch (_) {}
      if (directory) changed += await hideJsTree(fm, path)
    }
  }

  for (const name of rootNames(fm)) {
    if (!SAFE_OLD_ARCHIVE_PREFIXES.some(prefix => String(name).startsWith(prefix))) continue
    const path = fm.joinPath(docs, name)
    let directory = false
    try { directory = fm.isDirectory(path) } catch (_) {}
    if (directory) changed += await hideJsTree(fm, path)
  }
  return changed
}

async function main() {
  const iCloud = FileManager.iCloud()
  const local = typeof FileManager.local === 'function' ? FileManager.local() : null
  const currentExistsAnywhere = [iCloud, local].filter(Boolean).some(fm => rootNames(fm).some(isActive))

  const moved = []
  moved.push(...await organizeRoot(iCloud, 'iCloud', currentExistsAnywhere))
  moved.push(...await organizeRoot(local, 'local', currentExistsAnywhere))
  const hidden = (await hideHistoricalArchives(iCloud)) + (await hideHistoricalArchives(local))

  const a = new Alert()
  a.title = 'リモコン整理完了'
  const parts = []
  if (moved.length) parts.push('ルートから ' + moved.length + '件を削除せず保管しました。')
  if (hidden) parts.push('保管中の ' + hidden + '件を一覧に出ない .bak へ変更しました。')
  if (!parts.length) parts.push('整理対象はありませんでした。')
  parts.push('日本語の現行スクリプトと、内容を判定できない固有スクリプトは残しています。')
  a.message = parts.join('\n')
  a.addAction('OK')
  await a.presentAlert()
}

try { await main() }
catch (error) {
  const a = new Alert()
  a.title = 'リモコン整理失敗'
  a.message = error && error.message ? error.message : String(error)
  a.addAction('OK')
  await a.presentAlert()
}
Script.complete()
