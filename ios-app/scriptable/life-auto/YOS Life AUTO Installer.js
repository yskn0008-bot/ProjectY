// YOS Life AUTO Installer v0.3
// Installs/updates YOS Life AUTO Router into Scriptable iCloud with backup + rollback.

const SOURCE_SHA = 'f7316540bcb0c8c975da7d5f49b0e298d090b344'
const SOURCE_URL = `https://raw.githubusercontent.com/yskn0008-bot/ProjectY/${SOURCE_SHA}/ios-app/scriptable/life-auto/YOS%20Life%20AUTO%20Router.js`
const TARGET_NAME = 'YOS Life AUTO Router.js'
const REQUIRED_MARKERS = [
  'YOS Life AUTO Router v0.3',
  "const SCHEMA = 'yos.life-auto-router.v0.3'",
  "executor: 'ios-shortcuts'",
  "label: '起床'",
  "label: '就寝'"
]
const FORBIDDEN_MARKERS = ['new CallbackURL', 'shortcuts://x-callback-url/run-shortcut']

function assertSource(text) {
  if (!text || text.length < 1000) throw new Error('Router source is unexpectedly short')
  for (const marker of REQUIRED_MARKERS) {
    if (!text.includes(marker)) throw new Error(`Router verification failed: ${marker}`)
  }
  for (const marker of FORBIDDEN_MARKERS) {
    if (text.includes(marker)) throw new Error(`Router contains unsupported child execution: ${marker}`)
  }
}

async function fetchSource() {
  const req = new Request(SOURCE_URL)
  req.timeoutInterval = 20
  const text = await req.loadString()
  assertSource(text)
  return text
}

async function main() {
  const fm = FileManager.iCloud()
  const docs = fm.documentsDirectory()
  const target = fm.joinPath(docs, TARGET_NAME)
  const backup = fm.joinPath(docs, `${TARGET_NAME}.backup`)
  const existed = fm.fileExists(target)
  let previous = null

  try {
    const source = await fetchSource()

    if (existed) {
      if (!fm.isFileDownloaded(target)) await fm.downloadFileFromiCloud(target)
      previous = fm.readString(target)
      fm.writeString(backup, previous)
    }

    fm.writeString(target, source)
    const written = fm.readString(target)
    assertSource(written)

    const alert = new Alert()
    alert.title = 'Life AUTO Router 準備完了'
    alert.message = existed
      ? 'Routerを安全に更新しました。以前の内容は .backup に保存しています。'
      : 'RouterをScriptableへ追加しました。次は起床・就寝Automationの接続だけです。'
    alert.addAction('OK')
    await alert.presentAlert()
  } catch (error) {
    if (previous !== null) {
      try { fm.writeString(target, previous) } catch (_) {}
    } else if (!existed && fm.fileExists(target)) {
      try { fm.remove(target) } catch (_) {}
    }

    const alert = new Alert()
    alert.title = 'インストール中止'
    alert.message = `変更は戻しました。\n${String(error?.message ?? error)}`
    alert.addAction('OK')
    await alert.presentAlert()
    throw error
  }
}

await main()
