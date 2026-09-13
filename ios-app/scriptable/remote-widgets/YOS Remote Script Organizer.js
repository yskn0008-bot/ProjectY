// YOS Remote Script Organizer v1.0
// Safe cleanup utility for Scriptable MY REMOTE scripts.
// It never deletes scripts. It archives only recognized duplicate/legacy variants.
// iCloud is the canonical store; exact local duplicates are archived only when the same canonical iCloud script exists.

const CANONICAL = [
  'YOS Remote Hub.js',
  'YOS Remote Update Installer.js',
  'YOS BRAVIA Remote.js',
  'YOS AC Remote.js',
  'YOS AC Widget.js',
  'YOS Light Remote.js',
  'YOS Light Widget.js',
  'YOS Tapo H110 Core.js'
]

const ARCHIVE_PREFIX = 'YOS Remote Script Archive '

function stem(name) {
  return String(name).replace(/\.js$/i, '').trim()
}

function lower(value) {
  return String(value).trim().toLowerCase()
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function recognizedVariant(name) {
  if (!/\.js$/i.test(String(name))) return false
  const candidate = lower(stem(name))
  for (const canonical of CANONICAL) {
    const base = lower(stem(canonical))
    if (candidate === base) continue
    if (!candidate.startsWith(base)) continue
    const suffix = candidate.slice(base.length).replace(/^[\s._-]+/, '')
    if (!suffix) continue
    if (/^(?:\(\d+\)|\d+|copy(?:\s*\d+)?|old(?:\s*\d+)?|backup(?:\s*\d+)?|bak(?:\s*\d+)?|legacy(?:\s*\d+)?|v\d+(?:[._-]\d+)*)$/i.test(suffix)) return true
  }
  return false
}

function canonicalName(name) {
  const value = lower(String(name))
  return CANONICAL.find(item => lower(item) === value) || null
}

async function ensureLocal(manager, path) {
  if (!manager || !manager.fileExists(path)) return
  try {
    if (typeof manager.isFileStoredIniCloud === 'function' && manager.isFileStoredIniCloud(path)) {
      await manager.downloadFileFromiCloud(path)
    }
  } catch (_) {}
}

function uniqueDestination(manager, archiveDir, name) {
  let destination = manager.joinPath(archiveDir, name)
  if (!manager.fileExists(destination)) return destination
  const base = stem(name)
  let index = 2
  while (manager.fileExists(destination)) {
    destination = manager.joinPath(archiveDir, `${base} ${index}.js`)
    index += 1
  }
  return destination
}

async function archiveOne(manager, archiveDir, name) {
  const source = manager.joinPath(manager.documentsDirectory(), name)
  if (!manager.fileExists(source)) return false
  await ensureLocal(manager, source)
  if (!manager.fileExists(archiveDir)) manager.createDirectory(archiveDir, true)
  const destination = uniqueDestination(manager, archiveDir, name)
  manager.move(source, destination)
  if (manager.fileExists(source) || !manager.fileExists(destination)) {
    throw new Error(`${name} のアーカイブ確認に失敗しました`)
  }
  return true
}

function listJs(manager) {
  try {
    return manager.listContents(manager.documentsDirectory()).filter(name => /\.js$/i.test(name))
  } catch (_) {
    return []
  }
}

async function organizeStore(manager, kind, iCloudCanonical) {
  if (!manager) return []
  const docs = manager.documentsDirectory()
  const archiveDir = manager.joinPath(docs, ARCHIVE_PREFIX + stamp())
  const moved = []
  for (const name of listJs(manager)) {
    let shouldArchive = recognizedVariant(name)
    const canonical = canonicalName(name)
    if (kind === 'local' && canonical && iCloudCanonical.has(lower(canonical))) {
      shouldArchive = true
    }
    if (!shouldArchive) continue
    if (await archiveOne(manager, archiveDir, name)) moved.push({ kind, name })
  }
  return moved
}

async function main() {
  const iCloud = FileManager.iCloud()
  const local = typeof FileManager.local === 'function' ? FileManager.local() : null
  const iCloudNames = new Set(listJs(iCloud).map(lower))
  const iCloudCanonical = new Set(CANONICAL.filter(name => iCloudNames.has(lower(name))).map(lower))

  const moved = []
  moved.push(...await organizeStore(iCloud, 'iCloud', iCloudCanonical))
  moved.push(...await organizeStore(local, 'local', iCloudCanonical))

  const a = new Alert()
  a.title = 'MY REMOTE スクリプト整理完了'
  if (moved.length === 0) {
    a.message = '重複・旧版候補は見つかりませんでした。現行スクリプトはそのままです。'
  } else {
    const preview = moved.slice(0, 12).map(item => `• ${item.kind}: ${item.name}`).join('\n')
    const rest = moved.length > 12 ? `\nほか ${moved.length - 12}件` : ''
    a.message = `${moved.length}件を削除せずArchiveへ移動しました。\n\n${preview}${rest}`
  }
  a.addAction('OK')
  await a.presentAlert()
}

try {
  await main()
} catch (error) {
  const a = new Alert()
  a.title = 'MY REMOTE 整理失敗'
  a.message = error && error.message ? error.message : String(error)
  a.addAction('OK')
  await a.presentAlert()
}
Script.complete()
